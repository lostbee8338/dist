const express = require("express");
const pool = require("../config/database");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

function brasiliaTimestamp(column) {
    return `TO_CHAR(((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'),
        'YYYY-MM-DD"T"HH24:MI:SS.MS"-03:00"')`;
}

function accessFilter(req) {
    // Administradores podem consultar todas as conversas. Colaboradores só
    // consultam o departamento vinculado à conta atual.
    return {
        sql: req.user?.role === "admin" ? "TRUE" : "(c.department_id = $1 OR EXISTS (SELECT 1 FROM conversation_departments cd WHERE cd.conversation_id=c.id AND cd.department_id=$1))",
        params: req.user?.role === "admin" ? [] : [req.user?.department_id || -1]
    };
}

router.get("/", async (req, res) => {
    try {
        const requestedStatus = req.query.status === "closed" ? "closed" : "open";
        const access = accessFilter(req);
        const statusParam = access.params.length + 1;
        const result = await pool.query(`
            SELECT
                c.id, c.status,
                ${brasiliaTimestamp("c.started_at")} AS started_at,
                CASE WHEN c.closed_at IS NOT NULL
                    THEN ${brasiliaTimestamp("c.closed_at")} ELSE NULL END AS closed_at,
                cu.id AS customer_id, cu.name AS customer_name, cu.phone AS customer_phone,
                d.id AS department_id, d.name AS department_name,
                u.id AS assigned_user_id, u.name AS assigned_user_name,
                (SELECT m.content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
                (SELECT ${brasiliaTimestamp("m.sent_at")} FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
                (SELECT COUNT(*)::int FROM messages um
                 WHERE um.conversation_id=c.id AND um.direction='incoming'
                   AND um.sent_at > COALESCE((SELECT cr.last_read_at FROM conversation_reads cr WHERE cr.conversation_id=c.id AND cr.user_id=$${statusParam+1}), TIMESTAMP '1970-01-01')) AS unread_count
            FROM conversations c
            INNER JOIN customers cu ON cu.id=c.customer_id
            LEFT JOIN departments d ON d.id=c.department_id
            LEFT JOIN users u ON u.id=c.assigned_user_id
            WHERE ${access.sql} AND c.status = $${statusParam}
            ORDER BY COALESCE(
                (SELECT m.sent_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1),
                c.started_at
            ) DESC
        `, [...access.params, requestedStatus, req.user?.userId || req.user?.id || -1]);
        return res.json(result.rows);
    } catch (error) {
        console.error("Erro ao listar conversas:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível listar as conversas" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ status: "error", message: "ID de conversa inválido" });
        }

        const isAdmin = req.user?.role === "admin";
        const departmentId = req.user?.department_id || -1;
        const conversation = await pool.query(`
            SELECT
                c.id, c.status,
                ${brasiliaTimestamp("c.started_at")} AS started_at,
                CASE WHEN c.closed_at IS NOT NULL
                    THEN ${brasiliaTimestamp("c.closed_at")} ELSE NULL END AS closed_at,
                cu.id AS customer_id, cu.name AS customer_name, cu.phone AS customer_phone,
                cu.email AS customer_email, cu.notes AS customer_notes,
                d.id AS department_id, d.name AS department_name,
                u.id AS assigned_user_id, u.name AS assigned_user_name
            FROM conversations c
            INNER JOIN customers cu ON cu.id=c.customer_id
            LEFT JOIN departments d ON d.id=c.department_id
            LEFT JOIN users u ON u.id=c.assigned_user_id
            WHERE c.id=$1 AND ($2::boolean = TRUE OR c.department_id=$3 OR EXISTS (SELECT 1 FROM conversation_departments cd WHERE cd.conversation_id=c.id AND cd.department_id=$3))
        `, [id, isAdmin, departmentId]);

        if (!conversation.rows.length) {
            // Não revela a existência de conversas de outros departamentos.
            return res.status(404).json({ status: "error", message: "Conversa não encontrada" });
        }

        await pool.query(`
            INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (conversation_id, user_id)
            DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
        `, [id, req.user?.userId || req.user?.id]);

        const messages = await pool.query(`
            SELECT id, external_id, direction, message_type, content,
                ${brasiliaTimestamp("sent_at")} AS sent_at
            FROM messages
            WHERE conversation_id=$1
            ORDER BY sent_at ASC, id ASC
        `, [id]);

        return res.json({ conversation: conversation.rows[0], messages: messages.rows });
    } catch (error) {
        console.error("Erro ao buscar conversa:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível buscar a conversa" });
    }
});



router.patch("/:id/contact", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const name = String(req.body?.name || "").trim().slice(0, 150);
        const phone = String(req.body?.phone || "").replace(/[^0-9+]/g, "").slice(0, 30);
        const email = String(req.body?.email || "").trim().slice(0, 150);
        const notes = String(req.body?.notes || "").trim().slice(0, 5000);
        if (!Number.isInteger(id) || id <= 0 || !phone) {
            return res.status(400).json({ status: "error", message: "Informe um telefone válido." });
        }
        const access = await pool.query(`
            SELECT c.id, c.customer_id FROM conversations c
            WHERE c.id=$1 AND ($2::boolean=TRUE OR c.department_id=$3
              OR EXISTS (SELECT 1 FROM conversation_departments cd WHERE cd.conversation_id=c.id AND cd.department_id=$3))
            LIMIT 1
        `, [id, req.user?.role === "admin", req.user?.department_id || -1]);
        if (!access.rows.length) return res.status(404).json({ status: "error", message: "Contato/conversa não encontrado." });
        const customerId = access.rows[0].customer_id;
        const updated = await pool.query(`
            UPDATE customers SET name=$1, phone=$2, email=$3, notes=$4, updated_at=CURRENT_TIMESTAMP
            WHERE id=$5
            RETURNING id AS customer_id, name AS customer_name, phone AS customer_phone,
                      email AS customer_email, notes AS customer_notes
        `, [name || null, phone, email || null, notes || null, customerId]);
        return res.json({ status: "success", conversation: updated.rows[0] });
    } catch (error) {
        console.error("Erro ao atualizar contato:", error.message);
        if (error.code === "23505") return res.status(409).json({ status: "error", message: "Este telefone já está cadastrado em outro contato." });
        return res.status(500).json({ status: "error", message: "Não foi possível atualizar o contato." });
    }
});

// Vincula a conversa a um departamento. Somente administradores podem alterar
// essa classificação, pois ela determina quais colaboradores poderão visualizar
// a conversa.
router.patch("/:id/department", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const rawDepartmentId = req.body?.department_id;
        const departmentId = rawDepartmentId === null || rawDepartmentId === "" || rawDepartmentId === undefined
            ? null
            : Number(rawDepartmentId);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ status: "error", message: "ID de conversa inválido" });
        }
        if (departmentId !== null && (!Number.isInteger(departmentId) || departmentId <= 0)) {
            return res.status(400).json({ status: "error", message: "Departamento inválido" });
        }
        if (departmentId !== null) {
            const department = await pool.query(
                "SELECT id FROM departments WHERE id=$1 AND active=TRUE",
                [departmentId]
            );
            if (!department.rows.length) {
                return res.status(400).json({ status: "error", message: "Selecione um departamento ativo" });
            }
        }

        const result = await pool.query(
            `UPDATE conversations SET department_id=$1 WHERE id=$2
             RETURNING id, department_id`,
            [departmentId, id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ status: "error", message: "Conversa não encontrada" });
        }

        await pool.query("DELETE FROM conversation_departments WHERE conversation_id=$1", [id]);
        if (departmentId !== null) {
            await pool.query("INSERT INTO conversation_departments (conversation_id, department_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, departmentId]);
        }
        const department = departmentId === null
            ? { rows: [] }
            : await pool.query("SELECT id, name FROM departments WHERE id=$1", [departmentId]);
        return res.json({
            status: "success",
            conversation_id: id,
            department_id: departmentId,
            department_name: department.rows[0]?.name || null,
            message: "Departamento da conversa atualizado"
        });
    } catch (error) {
        console.error("Erro ao vincular conversa ao departamento:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível atualizar o departamento da conversa" });
    }
});


// Finalizar atendimento pelo painel. A conversa permanece no histórico.
router.patch("/:id/close", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ status: "error", message: "ID de conversa inválido" });
        }
        const isAdmin = req.user?.role === "admin";
        const departmentId = req.user?.department_id || -1;
        const result = await pool.query(
            `UPDATE conversations
             SET status='closed', closed_at=CURRENT_TIMESTAMP,
                 department_id=NULL, bot_state=NULL,
                 signature_sent=FALSE, assigned_user_id=NULL
             WHERE id=$1 AND status='open'
               AND ($2::boolean=TRUE OR department_id=$3 OR EXISTS (SELECT 1 FROM conversation_departments cd WHERE cd.conversation_id=conversations.id AND cd.department_id=$3))
             RETURNING id, status, closed_at, department_id`,
            [id, isAdmin, departmentId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ status: "error", message: "Atendimento não encontrado, já finalizado ou sem permissão." });
        }
        // Preserva conversation_departments para que os colaboradores do setor
        // que atendeu o contato possam consultar o histórico após a finalização.
        // O department_id atual é limpo, portanto a conversa sai da fila ativa.
        return res.json({ status: "success", conversation: result.rows[0], message: "Atendimento finalizado. O histórico foi mantido e removido da fila ativa; os colaboradores dos setores vinculados podem consultar as finalizadas." });
    } catch (error) {
        console.error("Erro ao finalizar atendimento:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível finalizar o atendimento." });
    }
});

module.exports = router;
