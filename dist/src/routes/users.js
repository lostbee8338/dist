const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../config/database");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAdmin);

// Garante que a tabela de vínculos múltiplos exista antes de qualquer operação
// de leitura/gravação. A coluna users.department_id continua sendo mantida para
// compatibilidade com as partes antigas do sistema.
router.use(async (req, res, next) => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS user_departments (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, department_id)
        )`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_departments_department_id ON user_departments(department_id)`);
        next();
    } catch (error) {
        console.error("Erro ao preparar vínculos de departamentos:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível preparar os vínculos de departamentos" });
    }
});

const USER_FIELDS = `
    id, name, email, role, active, department_id, created_at, updated_at
`;

async function validateDepartments(raw) {
    const values = Array.isArray(raw) ? raw : (raw === null || raw === undefined || raw === "" ? [] : [raw]);
    const ids = [...new Set(values.map(Number))];
    if (ids.some(id => !Number.isInteger(id) || id <= 0)) throw new Error("INVALID_DEPARTMENT");
    if (ids.length > 2) throw new Error("MAX_TWO_DEPARTMENTS");
    if (ids.length) {
        const result = await pool.query("SELECT id FROM departments WHERE id = ANY($1::int[]) AND active = TRUE", [ids]);
        if (result.rows.length !== ids.length) throw new Error("INVALID_DEPARTMENT");
    }
    return ids;
}

async function attachDepartmentIds(users) {
    const list = Array.isArray(users) ? users : [users];
    if (!list.length) return users;
    const ids = list.map(item => item.id);
    const links = await pool.query(`SELECT user_id, array_agg(department_id ORDER BY department_id) AS department_ids
        FROM user_departments WHERE user_id = ANY($1::int[]) GROUP BY user_id`, [ids]);
    const map = new Map(links.rows.map(row => [row.user_id, row.department_ids || []]));
    const decorated = list.map(item => ({ ...item, department_ids: map.get(item.id) || (item.department_id ? [item.department_id] : []) }));
    return Array.isArray(users) ? decorated : decorated[0];
}

async function saveUserDepartments(client, userId, departmentIds) {
    await client.query("DELETE FROM user_departments WHERE user_id=$1", [userId]);
    for (const departmentId of departmentIds) {
        await client.query("INSERT INTO user_departments (user_id, department_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, departmentId]);
    }
    await client.query("UPDATE users SET department_id=$1 WHERE id=$2", [departmentIds[0] || null, userId]);
}

router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${USER_FIELDS} FROM users ORDER BY name ASC`
        );
        return res.json(await attachDepartmentIds(result.rows));
    } catch (error) {
        console.error("Erro ao listar usuários:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível listar os usuários" });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${USER_FIELDS} FROM users WHERE id = $1`,
            [req.params.id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ status: "error", message: "Usuário não encontrado" });
        }
        return res.json(await attachDepartmentIds(result.rows[0]));
    } catch (error) {
        console.error("Erro ao buscar usuário:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível buscar o usuário" });
    }
});

router.post("/", async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        const email = String(req.body?.email || "").trim().toLowerCase();
        const password = String(req.body?.password || "");
        const role = String(req.body?.role || "agent");
        if (!name || !email || !password) {
            return res.status(400).json({ status: "error", message: "Nome, e-mail e senha são obrigatórios" });
        }
        if (password.length < 8) {
            return res.status(400).json({ status: "error", message: "A senha deve ter pelo menos 8 caracteres" });
        }
        if (!["admin", "agent"].includes(role)) {
            return res.status(400).json({ status: "error", message: "Perfil inválido" });
        }
        let departmentIds;
        try { departmentIds = await validateDepartments(req.body.department_ids ?? req.body.department_id); }
        catch (error) { return res.status(400).json({ status: "error", message: error.message === "MAX_TWO_DEPARTMENTS" ? "Selecione no máximo dois departamentos" : "Departamento inválido ou inativo" }); }
        const passwordHash = await bcrypt.hash(password, 12);
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `INSERT INTO users (name, email, password_hash, role, department_id)
                 VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_FIELDS}`,
                [name, email, passwordHash, role, departmentIds[0] || null]
            );
            await saveUserDepartments(client, result.rows[0].id, departmentIds);
            await client.query("COMMIT");
            return res.status(201).json({ ...result.rows[0], department_ids: departmentIds });
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ status: "error", message: "Já existe um usuário com esse e-mail" });
        }
        console.error("Erro ao criar usuário:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível criar o usuário" });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const name = String(req.body?.name || "").trim();
        const email = String(req.body?.email || "").trim().toLowerCase();
        const role = String(req.body?.role || "agent");
        if (!Number.isInteger(id) || id <= 0 || !name || !email || !["admin", "agent"].includes(role)) {
            return res.status(400).json({ status: "error", message: "Dados inválidos para atualização" });
        }
        let departmentIds;
        try { departmentIds = await validateDepartments(req.body.department_ids ?? req.body.department_id); }
        catch (error) { return res.status(400).json({ status: "error", message: error.message === "MAX_TWO_DEPARTMENTS" ? "Selecione no máximo dois departamentos" : "Departamento inválido ou inativo" }); }

        const target = await pool.query("SELECT id, role, active FROM users WHERE id = $1", [id]);
        if (!target.rows.length) {
            return res.status(404).json({ status: "error", message: "Usuário não encontrado" });
        }

        // Impede que o último administrador ativo perca o acesso administrativo.
        const current = target.rows[0];
        if (current.role === "admin" && current.active && role !== "admin") {
            const admins = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin' AND active = TRUE");
            if (admins.rows[0].total <= 1) {
                return res.status(400).json({ status: "error", message: "Não é possível remover o último administrador ativo" });
            }
        }

        let result;
        const password = String(req.body?.password || "");
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          if (password) {
            if (password.length < 8) {
                throw Object.assign(new Error("PASSWORD_TOO_SHORT"), { statusCode: 400 });
            }
            const hash = await bcrypt.hash(password, 12);
            result = await client.query(
                `UPDATE users SET name=$1, email=$2, role=$3, department_id=$4,
                 password_hash=$5, updated_at=CURRENT_TIMESTAMP
                 WHERE id=$6 RETURNING ${USER_FIELDS}`,
                [name, email, role, departmentIds[0] || null, hash, id]
            );
        } else {
            result = await client.query(
                `UPDATE users SET name=$1, email=$2, role=$3, department_id=$4,
                 updated_at=CURRENT_TIMESTAMP
                 WHERE id=$5 RETURNING ${USER_FIELDS}`,
                [name, email, role, departmentIds[0] || null, id]
            );
          }
          await saveUserDepartments(client, id, departmentIds);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
        return res.json({ ...result.rows[0], department_ids: departmentIds });
    } catch (error) {
        if (error.statusCode === 400) return res.status(400).json({ status: "error", message: "A senha deve ter pelo menos 8 caracteres" });
        if (error.code === "23505") {
            return res.status(409).json({ status: "error", message: "Já existe um usuário com esse e-mail" });
        }
        console.error("Erro ao atualizar usuário:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível atualizar o usuário" });
    }
});

router.patch("/:id/status", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { active } = req.body || {};
        if (!Number.isInteger(id) || id <= 0 || typeof active !== "boolean") {
            return res.status(400).json({ status: "error", message: "Dados inválidos para alterar o status" });
        }
        const target = await pool.query("SELECT id, role, active FROM users WHERE id = $1", [id]);
        if (!target.rows.length) {
            return res.status(404).json({ status: "error", message: "Usuário não encontrado" });
        }
        if (target.rows[0].role === "admin" && target.rows[0].active && !active) {
            const admins = await pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin' AND active = TRUE");
            if (admins.rows[0].total <= 1) {
                return res.status(400).json({ status: "error", message: "Não é possível desativar o último administrador ativo" });
            }
        }
        const result = await pool.query(
            `UPDATE users SET active=$1, updated_at=CURRENT_TIMESTAMP
             WHERE id=$2 RETURNING ${USER_FIELDS}`,
            [active, id]
        );
        return res.json(result.rows[0]);
    } catch (error) {
        console.error("Erro ao alterar status do usuário:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível alterar o status do usuário" });
    }
});

module.exports = router;
