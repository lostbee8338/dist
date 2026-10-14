const express = require("express");
const pool = require("../config/database");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, active, created_at FROM departments ORDER BY name ASC`
        );
        return res.json(result.rows);
    } catch (error) {
        console.error("Erro ao listar departamentos:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível listar os departamentos" });
    }
});

router.post("/", requireAdmin, async (req, res) => {
    try {
        const name = String(req.body?.name || "").trim();
        if (!name) {
            return res.status(400).json({ status: "error", message: "Nome do departamento é obrigatório" });
        }
        const existing = await pool.query("SELECT id FROM departments WHERE LOWER(name)=LOWER($1)", [name]);
        if (existing.rows.length) {
            return res.status(409).json({ status: "error", message: "Esse departamento já existe" });
        }
        const result = await pool.query(
            `INSERT INTO departments (name) VALUES ($1)
             RETURNING id, name, active, created_at`,
            [name]
        );
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Erro ao criar departamento:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível criar o departamento" });
    }
});

router.put("/:id", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const name = String(req.body?.name || "").trim();
        if (!Number.isInteger(id) || id <= 0 || !name) {
            return res.status(400).json({ status: "error", message: "ID e nome válidos são obrigatórios" });
        }
        const existing = await pool.query(
            "SELECT id FROM departments WHERE LOWER(name)=LOWER($1) AND id<>$2",
            [name, id]
        );
        if (existing.rows.length) {
            return res.status(409).json({ status: "error", message: "Já existe outro departamento com esse nome" });
        }
        const result = await pool.query(
            `UPDATE departments SET name=$1 WHERE id=$2
             RETURNING id, name, active, created_at`,
            [name, id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ status: "error", message: "Departamento não encontrado" });
        }
        return res.json(result.rows[0]);
    } catch (error) {
        console.error("Erro ao renomear departamento:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível atualizar o departamento" });
    }
});

router.patch("/:id/status", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { active } = req.body || {};
        if (!Number.isInteger(id) || id <= 0 || typeof active !== "boolean") {
            return res.status(400).json({ status: "error", message: "Dados inválidos para alterar o status" });
        }
        const result = await pool.query(
            `UPDATE departments SET active=$1 WHERE id=$2
             RETURNING id, name, active, created_at`,
            [active, id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ status: "error", message: "Departamento não encontrado" });
        }
        return res.json(result.rows[0]);
    } catch (error) {
        console.error("Erro ao alterar status do departamento:", error.message);
        return res.status(500).json({ status: "error", message: "Não foi possível alterar o status do departamento" });
    }
});

module.exports = router;
