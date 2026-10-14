const express = require("express");
const axios = require("axios");
const pool = require("../config/database");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const EVOLUTION_URL =
    process.env.EVOLUTION_URL || "http://localhost:8080";

const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

const EVOLUTION_INSTANCE =
    process.env.EVOLUTION_INSTANCE || "melo-melo";

let lastEvolutionSync = 0;

let departmentColumnReady = false;
async function ensureGroupDepartmentColumn() {
    if (departmentColumnReady) return;
    await pool.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS group_departments (
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, department_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS group_reads (
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id)
    )`);
    await pool.query(`
        INSERT INTO group_reads (group_id, user_id, last_read_at)
        SELECT g.id, u.id, CURRENT_TIMESTAMP FROM groups g CROSS JOIN users u
        WHERE NOT EXISTS (SELECT 1 FROM group_reads)
        ON CONFLICT (group_id, user_id) DO NOTHING
    `);
    // Migra o departamento único anterior sem perder os vínculos existentes.
    await pool.query(`INSERT INTO group_departments (group_id, department_id)
        SELECT id, department_id FROM groups WHERE department_id IS NOT NULL
        ON CONFLICT DO NOTHING`);
    departmentColumnReady = true;
}

async function getAccessibleGroup(groupId, req) {
    await ensureGroupDepartmentColumn();
    const isAdmin = req.user?.role === "admin";
    const departmentId = req.user?.department_id || -1;
    const result = await pool.query(
        `SELECT g.id, g.whatsapp_jid, g.name, g.department_id, d.name AS department_name
         FROM groups g LEFT JOIN departments d ON d.id = g.department_id
         WHERE g.id = $1 AND ($2::boolean = TRUE OR EXISTS (
             SELECT 1 FROM group_departments gd WHERE gd.group_id=g.id AND gd.department_id=$3
         ) OR g.department_id=$3) LIMIT 1`,
        [groupId, isAdmin, departmentId]
    );
    return result.rows[0] || null;
}
const EVOLUTION_SYNC_INTERVAL = 30000;

/* SINCRONIZAR GRUPOS */
async function syncGroupsFromEvolution() {
    await ensureGroupDepartmentColumn();
    const now = Date.now();

    if (now - lastEvolutionSync < EVOLUTION_SYNC_INTERVAL) {
        return;
    }

    try {
        const response = await axios.get(
            `${EVOLUTION_URL}/group/fetchAllGroups/${EVOLUTION_INSTANCE}?getParticipants=false`,
            {
                headers: { apikey: EVOLUTION_API_KEY },
                timeout: 10000,
            }
        );

        const evolutionGroups = Array.isArray(response.data)
            ? response.data
            : [];

        for (const group of evolutionGroups) {
            const whatsappJid = group?.id;
            const name = String(group?.subject || "").trim();

            if (!whatsappJid || !whatsappJid.endsWith("@g.us")) {
                continue;
            }

            await pool.query(
                `
                INSERT INTO groups (whatsapp_jid, name)
                VALUES ($1, $2)
                ON CONFLICT (whatsapp_jid)
                DO UPDATE SET
                    name = CASE
                        WHEN EXCLUDED.name IS NOT NULL
                             AND EXCLUDED.name <> ''
                        THEN EXCLUDED.name
                        ELSE groups.name
                    END
                `,
                [whatsappJid, name || null]
            );
            await pool.query(`
                INSERT INTO group_reads (group_id, user_id, last_read_at)
                SELECT g.id, u.id, CURRENT_TIMESTAMP
                FROM groups g CROSS JOIN users u
                WHERE g.whatsapp_jid=$1
                ON CONFLICT (group_id, user_id) DO NOTHING
            `, [whatsappJid]);
        }

        lastEvolutionSync = now;

        console.log(
            `Grupos sincronizados com a Evolution: ${evolutionGroups.length}`
        );
    } catch (error) {
        console.error(
            "Erro ao sincronizar grupos com a Evolution:",
            error.response?.data || error.message
        );
    }
}

/* CONVERSÃO DE HORÁRIO */
const LOCAL_TIME_SQL = `
    sent_at AT TIME ZONE 'UTC'
             AT TIME ZONE 'America/Sao_Paulo'
`;

/* LISTAR GRUPOS */
router.get("/", async (req, res) => {
    try {
        await syncGroupsFromEvolution();

        const result = await pool.query(`
            SELECT
                g.id, g.department_id, d.name AS department_name,
                g.whatsapp_jid,
                g.name,
                g.created_at,
                g.updated_at,
                gm.content AS last_message,
                gm.direction AS last_message_direction,
                gm.sent_at AT TIME ZONE 'UTC'
                         AT TIME ZONE 'America/Sao_Paulo'
                         AS last_message_at,
                gm.participant_name AS last_message_participant,
                COALESCE((SELECT array_agg(gd.department_id ORDER BY gd.department_id)
                    FROM group_departments gd WHERE gd.group_id=g.id), ARRAY[]::integer[]) AS department_ids,
                (SELECT COUNT(*)::int FROM group_messages um
                 WHERE um.group_id=g.id AND um.direction='incoming'
                   AND um.sent_at > COALESCE((SELECT gr.last_read_at FROM group_reads gr
                     WHERE gr.group_id=g.id AND gr.user_id=$3), TIMESTAMP '1970-01-01')) AS unread_count
            FROM groups g
            LEFT JOIN departments d ON d.id = g.department_id
            LEFT JOIN LATERAL (
                SELECT
                    content,
                    direction,
                    sent_at,
                    participant_name
                FROM group_messages
                WHERE group_id = g.id
                ORDER BY sent_at DESC, id DESC
                LIMIT 1
            ) gm ON true
            WHERE ($1::boolean = TRUE OR g.department_id = $2 OR EXISTS (
                SELECT 1 FROM group_departments gd WHERE gd.group_id=g.id AND gd.department_id=$2
            ))
            ORDER BY
                COALESCE(gm.sent_at, g.updated_at) DESC,
                g.name ASC,
                g.whatsapp_jid ASC
        `, [req.user?.role === "admin", req.user?.department_id || -1, req.user?.userId || req.user?.id || -1]);

        res.json(result.rows);
    } catch (error) {
        console.error("Erro ao listar grupos:", error);

        res.status(500).json({
            error: "Erro ao listar grupos",
        });
    }
});


router.patch("/:id/departments", requireAdmin, async (req, res) => {
    try {
        await ensureGroupDepartmentColumn();
        const groupId = Number(req.params.id);
        const raw = Array.isArray(req.body?.department_ids) ? req.body.department_ids : [];
        const departmentIds = [...new Set(raw.map(Number))];
        if (!Number.isInteger(groupId) || groupId <= 0 || departmentIds.some(id => !Number.isInteger(id) || id <= 0)) {
            return res.status(400).json({ error: "Grupo ou departamentos inválidos." });
        }
        const group = await pool.query("SELECT id FROM groups WHERE id=$1", [groupId]);
        if (!group.rows.length) return res.status(404).json({ error: "Grupo não encontrado." });
        if (departmentIds.length) {
            const valid = await pool.query("SELECT id FROM departments WHERE active=TRUE AND id=ANY($1::int[])", [departmentIds]);
            if (valid.rows.length !== departmentIds.length) return res.status(400).json({ error: "Selecione apenas departamentos ativos." });
        }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query("DELETE FROM group_departments WHERE group_id=$1", [groupId]);
            for (const departmentId of departmentIds) {
                await client.query("INSERT INTO group_departments (group_id, department_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [groupId, departmentId]);
            }
            await client.query("UPDATE groups SET department_id=$1 WHERE id=$2", [departmentIds[0] || null, groupId]);
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally { client.release(); }
        return res.json({ status: "success", group_id: groupId, department_ids: departmentIds });
    } catch (error) {
        console.error("Erro ao vincular departamentos ao grupo:", error.message);
        return res.status(500).json({ error: "Não foi possível salvar os departamentos do grupo." });
    }
});

/* ENVIAR MÍDIA — GRUPOS E CONVERSAS */
router.post("/media/send", async (req, res) => {
    try {
        // express.json() já processou o JSON antes desta rota; não reler req.on("data").
        const body = req.body || {};

        const targetType = String(body?.targetType || "").trim();
        const targetId = Number(body?.targetId || 0);
        const fileName = String(body?.fileName || "arquivo").trim();
        const mimetype = String(
            body?.mimetype || "application/octet-stream"
        ).trim();
        const media = String(body?.media || "").trim();
        const caption = String(body?.caption || "").trim();

        if (
            !targetId ||
            !["group", "conversation"].includes(targetType) ||
            !media
        ) {
            return res.status(400).json({
                error: "Dados da mídia incompletos",
            });
        }

        let number;
        let group = null;
        let conversation = null;

        if (targetType === "group") {
            const accessibleGroup = await getAccessibleGroup(targetId, req);
            if (!accessibleGroup) {
                return res.status(404).json({ error: "Grupo não encontrado" });
            }
            group = accessibleGroup;
            number = group.whatsapp_jid;
        } else {
            const result = await pool.query(
                `
                SELECT c.id, cu.phone, cu.name
                FROM conversations c
                INNER JOIN customers cu ON cu.id = c.customer_id
                WHERE c.id = $1
                LIMIT 1
                `,
                [targetId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    error: "Conversa não encontrada",
                });
            }

            conversation = result.rows[0];
            number = conversation.phone;
        }

        let normalizedMedia = media;

        const dataUrlMatch = normalizedMedia.match(
            /^data:[^,]*;base64,/i
        );

        if (dataUrlMatch) {
            normalizedMedia = normalizedMedia.slice(
                dataUrlMatch[0].length
            );
        }

        if (!/^https?:\/\//i.test(normalizedMedia)) {
            normalizedMedia = normalizedMedia.replace(/\s/g, "");
        }

        let mediatype = "document";

        if (mimetype.startsWith("image/")) {
            mediatype = "image";
        } else if (mimetype.startsWith("video/")) {
            mediatype = "video";
        } else if (mimetype.startsWith("audio/")) {
            mediatype = "audio";
        }

        const evolutionResponse = await axios.post(
            `${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`,
            {
                number,
                mediatype,
                mimetype,
                caption,
                media: normalizedMedia,
                fileName,
            },
            {
                headers: {
                    apikey: EVOLUTION_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout: 120000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );

        const externalId =
            evolutionResponse.data?.key?.id ||
            evolutionResponse.data?.message?.key?.id ||
            evolutionResponse.data?.data?.key?.id ||
            null;

        const messageTypeMap = {
            image: "imageMessage",
            video: "videoMessage",
            audio: "audioMessage",
            document: "documentMessage",
        };

        const messageType = messageTypeMap[mediatype];
        const displayContent = caption || `[${messageType}]`;

        if (targetType === "group") {
            await pool.query(
                `
                INSERT INTO group_messages (
                    group_id,
                    external_id,
                    participant_jid,
                    participant_name,
                    direction,
                    message_type,
                    content,
                    sent_at
                )
                VALUES ($1, $2, NULL, $3, 'outgoing', $4, $5, CURRENT_TIMESTAMP)
                `,
                [
                    group.id,
                    externalId,
                    req.user?.name || "Atendimento",
                    messageType,
                    displayContent,
                ]
            );
        } else {
            await pool.query(
                `
                INSERT INTO messages (
                    conversation_id,
                    external_id,
                    direction,
                    message_type,
                    content,
                    sent_at
                )
                VALUES ($1, $2, 'outgoing', $3, $4, CURRENT_TIMESTAMP)
                `,
                [
                    conversation.id,
                    externalId,
                    messageType,
                    displayContent,
                ]
            );
        }

        return res.status(200).json({
            status: "success",
            messageType,
            externalId,
            evolution: evolutionResponse.data,
        });
    } catch (error) {
        console.error(
            "Erro ao enviar mídia:",
            error.response?.data || error.message
        );

        return res.status(
            error.response?.status >= 400
                ? error.response.status
                : 500
        ).json({
            error: "Não foi possível enviar a mídia",
            details:
                error.response?.data?.message ||
                error.response?.data ||
                error.message,
        });
    }
});


router.post("/:id/reaction", async (req, res) => {
    try {
        const group = await getAccessibleGroup(req.params.id, req);
        if (!group) return res.status(404).json({ status: "error", message: "Grupo não encontrado ou sem permissão." });
        const { external_id, reaction, fromMe } = req.body || {};
        const allowed = new Set(["❤️", "👍", "😂", "😮", "😢", "🙏"]);
        if (!external_id || !allowed.has(reaction)) return res.status(400).json({ status: "error", message: "Mensagem ou reação inválida." });
        const response = await axios.post(`${EVOLUTION_URL}/message/sendReaction/${EVOLUTION_INSTANCE}`, {
            key: { remoteJid: group.whatsapp_jid, fromMe: Boolean(fromMe), id: String(external_id) }, reaction
        }, { headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" }, timeout: 15000 });
        return res.json({ status: "success", evolution: response.data });
    } catch (error) {
        console.error("Erro ao reagir à mensagem do grupo:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ status: "error", message: "A Evolution API não confirmou o envio da reação.", details: error.response?.data || error.message });
    }
});

/* ENVIAR MENSAGEM DE TEXTO PARA GRUPO */
router.post("/:id/send", async (req, res) => {
    try {
        const { id } = req.params;
        const message = String(req.body?.message || "").trim();
        const quoted = req.body?.quoted;

        if (!message) {
            return res.status(400).json({
                error: "Mensagem vazia",
            });
        }

        const group = await getAccessibleGroup(id, req);
        if (!group) {
            return res.status(404).json({ error: "Grupo não encontrado" });
        }

        const evolutionResponse = await axios.post(
            `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
            {
                number: group.whatsapp_jid,
                text: message,
                ...(quoted?.id ? { quoted: {
                    key: { remoteJid: group.whatsapp_jid, fromMe: Boolean(quoted.fromMe), id: String(quoted.id) },
                    message: { conversation: String(quoted.content || "Mensagem") }
                } } : {})
            },
            {
                headers: {
                    apikey: EVOLUTION_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout: 15000,
            }
        );

        const externalId =
            evolutionResponse.data?.key?.id ||
            evolutionResponse.data?.message?.key?.id ||
            null;

        const inserted = await pool.query(
            `
            INSERT INTO group_messages (
                group_id,
                external_id,
                participant_jid,
                participant_name,
                direction,
                message_type,
                content,
                sent_at
            )
            VALUES ($1, $2, NULL, $3, 'outgoing', 'text', $4, CURRENT_TIMESTAMP)
            RETURNING
                id,
                external_id,
                participant_jid,
                participant_name,
                direction,
                message_type,
                content,
                sent_at
            `,
            [
                group.id,
                externalId,
                req.user?.name || "Atendimento",
                message,
            ]
        );

        return res.status(200).json({
            status: "success",
            message: inserted.rows[0],
            evolution: evolutionResponse.data,
        });
    } catch (error) {
        console.error(
            "Erro ao enviar mensagem para grupo:",
            error.response?.data || error.message
        );

        return res.status(
            error.response?.status >= 400
                ? error.response.status
                : 500
        ).json({
            error: "Não foi possível enviar a mensagem para o grupo",
            details:
                error.response?.data?.message ||
                error.response?.data ||
                error.message,
        });
    }
});

/* CARREGAR MÍDIA DE UMA MENSAGEM */
router.get("/media/:externalId", async (req, res) => {
    try {
        const externalId = String(req.params.externalId || "").trim();

        if (!externalId) {
            return res.status(400).json({
                error: "ID da mensagem não informado",
            });
        }

        const mediaAccess = await pool.query(
            `SELECT g.id FROM group_messages gm
             INNER JOIN groups g ON g.id = gm.group_id
             WHERE gm.external_id = $1
               AND ($2::boolean = TRUE OR g.department_id = $3)
             LIMIT 1`,
            [externalId, req.user?.role === "admin", req.user?.department_id || -1]
        );
        if (!mediaAccess.rows.length) {
            return res.status(404).json({ error: "Mídia não encontrada" });
        }

        const evolutionResponse = await axios.post(
            `${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`,
            {
                message: {
                    key: {
                        id: externalId,
                    },
                },
                convertToMp4: false,
            },
            {
                headers: {
                    apikey: EVOLUTION_API_KEY,
                    "Content-Type": "application/json",
                },
                timeout: 60000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );

        const payload = evolutionResponse.data || {};

        const base64 =
            payload?.data?.base64 ||
            payload?.base64 ||
            payload?.data?.dataUrl ||
            payload?.dataUrl ||
            null;

        if (!base64) {
            return res.status(404).json({
                error: "A Evolution não retornou a mídia desta mensagem",
            });
        }

        const dataUrl = String(base64).startsWith("data:")
            ? String(base64)
            : `data:${
                payload?.data?.mimetype ||
                payload?.mimetype ||
                "application/octet-stream"
            };base64,${base64}`;

        const mimetype =
            payload?.data?.mimetype ||
            payload?.mimetype ||
            (String(dataUrl).match(/^data:([^;]+);/) || [])[1] ||
            "application/octet-stream";

        const fileName =
            payload?.data?.fileName ||
            payload?.fileName ||
            null;

        return res.status(200).json({
            dataUrl,
            mimetype,
            fileName,
        });
    } catch (error) {
        console.error(
            "Erro ao carregar mídia da Evolution:",
            error.response?.data || error.message
        );

        return res.status(
            error.response?.status >= 400
                ? error.response.status
                : 500
        ).json({
            error: "Não foi possível carregar a mídia",
            details:
                error.response?.data?.message ||
                error.response?.data ||
                error.message,
        });
    }
});

/* CLASSIFICAR GRUPO POR DEPARTAMENTO — somente administrador */
router.patch("/:id/department", requireAdmin, async (req, res) => {
    try {
        await ensureGroupDepartmentColumn();
        const id = Number(req.params.id);
        const raw = req.body?.department_id;
        const departmentId = raw === null || raw === "" || raw === undefined ? null : Number(raw);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "ID de grupo inválido" });
        if (departmentId !== null && (!Number.isInteger(departmentId) || departmentId <= 0)) return res.status(400).json({ error: "Departamento inválido" });
        if (departmentId !== null) {
            const department = await pool.query("SELECT id FROM departments WHERE id=$1 AND active=TRUE", [departmentId]);
            if (!department.rows.length) return res.status(400).json({ error: "Selecione um departamento ativo" });
        }
        const result = await pool.query("UPDATE groups SET department_id=$1 WHERE id=$2 RETURNING id, department_id", [departmentId, id]);
        if (!result.rows.length) return res.status(404).json({ error: "Grupo não encontrado" });
        const department = departmentId === null ? { rows: [] } : await pool.query("SELECT name FROM departments WHERE id=$1", [departmentId]);
        return res.json({ status: "success", group_id: id, department_id: departmentId, department_name: department.rows[0]?.name || null });
    } catch (error) {
        console.error("Erro ao vincular grupo ao departamento:", error);
        return res.status(500).json({ error: "Não foi possível atualizar o departamento do grupo" });
    }
});

/* DETALHES DO GRUPO E HISTÓRICO */
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        await syncGroupsFromEvolution();

        const accessibleGroup = await getAccessibleGroup(id, req);
        if (!accessibleGroup) {
            return res.status(404).json({
                error: "Grupo não encontrado",
            });
        }

        const messagesResult = await pool.query(
            `
            SELECT
                id,
                external_id,
                participant_jid,
                participant_name,
                direction,
                message_type,
                content,
                ${LOCAL_TIME_SQL} AS sent_at
            FROM group_messages
            WHERE group_id = $1
            ORDER BY sent_at ASC, id ASC
            `,
            [id]
        );

        const metadata = await pool.query(
            `SELECT g.id, g.whatsapp_jid, g.name, g.created_at, g.updated_at,
                    g.department_id, d.name AS department_name,
                    COALESCE((SELECT array_agg(gd.department_id ORDER BY gd.department_id)
                      FROM group_departments gd WHERE gd.group_id=g.id), ARRAY[]::integer[]) AS department_ids
             FROM groups g LEFT JOIN departments d ON d.id = g.department_id
             WHERE g.id = $1`, [id]
        );
        await pool.query(`
            INSERT INTO group_reads (group_id, user_id, last_read_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (group_id, user_id)
            DO UPDATE SET last_read_at = CURRENT_TIMESTAMP
        `, [id, req.user?.userId || req.user?.id]);
        res.json({
            group: metadata.rows[0] || accessibleGroup,
            messages: messagesResult.rows,
        });
    } catch (error) {
        console.error("Erro ao abrir grupo:", error);

        res.status(500).json({
            error: "Erro ao carregar grupo",
        });
    }
});

/* MENSAGENS DO GRUPO */
router.get("/:id/messages", async (req, res) => {
    try {
        const { id } = req.params;
        const accessibleGroup = await getAccessibleGroup(id, req);
        if (!accessibleGroup) return res.status(404).json({ error: "Grupo não encontrado" });

        const result = await pool.query(
            `
            SELECT
                id,
                external_id,
                participant_jid,
                participant_name,
                direction,
                message_type,
                content,
                ${LOCAL_TIME_SQL} AS sent_at
            FROM group_messages
            WHERE group_id = $1
            ORDER BY sent_at ASC, id ASC
            `,
            [id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Erro ao listar mensagens do grupo:", error);

        res.status(500).json({
            error: "Erro ao listar mensagens do grupo",
        });
    }
});

module.exports = router;