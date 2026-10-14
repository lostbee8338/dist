const express = require("express");
const pool = require("../config/database");
const { requireAdmin } = require("../middleware/auth");
const router = express.Router();

async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bot_department_mappings (
    reply_number VARCHAR(10) PRIMARY KEY,
    department_ids INTEGER[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS quick_replies (
    id SERIAL PRIMARY KEY, title VARCHAR(120) NOT NULL, body TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE, created_by INTEGER NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

router.use(async (req, res, next) => {
  try { await ensureTables(); next(); }
  catch (error) { console.error("Erro ao preparar configurações do bot:", error.message); res.status(500).json({ status: "error", message: "Não foi possível preparar as configurações do bot." }); }
});

router.get("/config", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.reply_number, m.department_ids,
        COALESCE(json_agg(json_build_object('id', d.id, 'name', d.name)) FILTER (WHERE d.id IS NOT NULL), '[]'::json) AS departments
      FROM bot_department_mappings m
      LEFT JOIN departments d ON d.id=ANY(m.department_ids)
      GROUP BY m.reply_number, m.department_ids
      ORDER BY m.reply_number::INTEGER, m.reply_number
    `);
    return res.json({ mappings: result.rows });
  } catch (error) {
    console.error("Erro ao carregar configuração do bot:", error.message);
    return res.status(500).json({ status: "error", message: "Não foi possível carregar a configuração do bot." });
  }
});

router.put("/config", requireAdmin, async (req, res) => {
  const mappings = req.body?.mappings;
  if (!Array.isArray(mappings)) return res.status(400).json({ status: "error", message: "Envie uma lista de números e departamentos." });
  const normalized = [];
  const seen = new Set();
  for (const item of mappings) {
    const number = String(item?.reply_number ?? item?.number ?? "").trim();
    const departmentIds = [...new Set((Array.isArray(item?.department_ids) ? item.department_ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!/^\d{1,3}$/.test(number)) return res.status(400).json({ status: "error", message: "Cada opção deve ser um número de 1 a 3 dígitos." });
    if (seen.has(number)) return res.status(400).json({ status: "error", message: `O número ${number} está duplicado. Use uma única linha por número e selecione vários departamentos nela.` });
    if (!departmentIds.length) return res.status(400).json({ status: "error", message: `Selecione pelo menos um departamento para a opção ${number}.` });
    seen.add(number); normalized.push({ number, departmentIds });
  }
  const allIds = [...new Set(normalized.flatMap(x => x.departmentIds))];
  try {
    const valid = await pool.query("SELECT id FROM departments WHERE active=TRUE AND id=ANY($1::int[])", [allIds]);
    if (valid.rows.length !== allIds.length) return res.status(400).json({ status: "error", message: "Há departamentos inexistentes ou inativos na configuração." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM bot_department_mappings");
      for (const item of normalized) {
        await client.query("INSERT INTO bot_department_mappings (reply_number, department_ids, updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP)", [item.number, item.departmentIds]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    return res.json({ status: "success", message: "Configuração do bot salva.", mappings: normalized });
  } catch (error) {
    console.error("Erro ao salvar configuração do bot:", error.message);
    return res.status(500).json({ status: "error", message: "Não foi possível salvar a configuração do bot." });
  }
});

router.get("/quick-replies", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, title, body FROM quick_replies WHERE active=TRUE ORDER BY title ASC");
    return res.json(result.rows);
  } catch (error) { return res.status(500).json({ status: "error", message: "Não foi possível carregar as mensagens prontas." }); }
});

router.post("/quick-replies", requireAdmin, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  if (!title || !body) return res.status(400).json({ status: "error", message: "Informe o título e o texto da mensagem." });
  if (title.length > 120) return res.status(400).json({ status: "error", message: "O título deve ter no máximo 120 caracteres." });
  try {
    const result = await pool.query("INSERT INTO quick_replies (title, body, created_by) VALUES ($1,$2,$3) RETURNING id, title, body", [title, body, req.user?.id || null]);
    return res.status(201).json(result.rows[0]);
  } catch (error) { console.error("Erro ao criar mensagem pronta:", error.message); return res.status(500).json({ status: "error", message: "Não foi possível criar a mensagem pronta." }); }
});

router.delete("/quick-replies/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ status: "error", message: "ID inválido." });
  try {
    const result = await pool.query("UPDATE quick_replies SET active=FALSE, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id", [id]);
    if (!result.rows.length) return res.status(404).json({ status: "error", message: "Mensagem pronta não encontrada." });
    return res.json({ status: "success" });
  } catch (error) { return res.status(500).json({ status: "error", message: "Não foi possível remover a mensagem pronta." }); }
});

module.exports = router;
