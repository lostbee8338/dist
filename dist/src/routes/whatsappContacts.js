const express = require("express");
const axios = require("axios");
const pool = require("../config/database");

const router = express.Router();

function extractArray(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.records)) return data.records;
    if (Array.isArray(data?.contacts)) return data.contacts;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.chats)) return data.chats;
    return [];
}

function normalizeContact(contact) {
    const rawId =
        contact?.id ||
        contact?.remoteJid ||
        contact?.jid ||
        contact?.number ||
        contact?.phone ||
        "";

    const raw = String(rawId).trim();

    // A contact with a LID but no phone JID cannot reliably be opened by number.
    if (!raw || raw.endsWith("@g.us") || raw.endsWith("@lid")) {
        return null;
    }

    const phone = raw
        .replace(/@s\.whatsapp\.net$/i, "")
        .replace(/@c\.us$/i, "")
        .replace(/\D/g, "");

    if (phone.length < 10 || phone.length > 15) {
        return null;
    }

    const name = String(
        contact?.pushName ||
        contact?.name ||
        contact?.verifiedName ||
        contact?.notify ||
        contact?.shortName ||
        ""
    ).trim();

    return { phone, name: name || phone };
}

/*
 * GET /api/whatsapp-contacts
 * Retorna os contatos disponibilizados pela instância conectada na Evolution API.
 */
router.get("/", async (req, res) => {
    try {
        const url = process.env.EVOLUTION_URL;
        const instance = process.env.EVOLUTION_INSTANCE;
        const apiKey = process.env.EVOLUTION_API_KEY;

        if (!url || !instance || !apiKey) {
            return res.status(500).json({
                message: "A configuração da Evolution API está incompleta no backend."
            });
        }

        const response = await axios.post(
            `${url.replace(/\/+$/, "")}/chat/findContacts/${encodeURIComponent(instance)}`,
            {},
            {
                headers: {
                    apikey: apiKey,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        const contacts = extractArray(response.data)
            .map(normalizeContact)
            .filter(Boolean);

        const unique = new Map();
        for (const contact of contacts) {
            const previous = unique.get(contact.phone);
            if (!previous || (previous.name === previous.phone && contact.name !== contact.phone)) {
                unique.set(contact.phone, contact);
            }
        }

        const sortedContacts = Array.from(unique.values())
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

        return res.json({ contacts: sortedContacts });
    } catch (error) {
        console.error(
            "Erro ao listar contatos da Evolution:",
            error.response?.data || error.message
        );

        return res.status(error.response?.status || 502).json({
            message: "Não foi possível consultar os contatos da instância do WhatsApp."
        });
    }
});

/*
 * POST /api/whatsapp-contacts/start
 * Garante um cliente e uma conversa aberta no banco para o contato selecionado
 * ou para o número informado manualmente.
 */
router.post("/start", async (req, res) => {
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    const name = String(req.body?.name || "").trim();

    if (phone.length < 10 || phone.length > 15) {
        return res.status(400).json({
            message: "Informe um número válido com DDI e DDD."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const customerResult = await client.query(
            `
            INSERT INTO customers (name, phone)
            VALUES ($1, $2)
            ON CONFLICT (phone)
            DO UPDATE SET
                name = CASE
                    WHEN EXCLUDED.name IS NOT NULL AND EXCLUDED.name <> ''
                    THEN EXCLUDED.name
                    ELSE customers.name
                END,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, name, phone
            `,
            [name || null, phone]
        );

        const customer = customerResult.rows[0];

        let conversationResult = await client.query(
            `
            SELECT id
            FROM conversations
            WHERE customer_id = $1
              AND status = 'open'
            ORDER BY id DESC
            LIMIT 1
            `,
            [customer.id]
        );

        let conversationId;
        if (conversationResult.rows.length > 0) {
            conversationId = conversationResult.rows[0].id;
        } else {
            const created = await client.query(
                `
                INSERT INTO conversations (customer_id, status)
                VALUES ($1, 'open')
                RETURNING id
                `,
                [customer.id]
            );
            conversationId = created.rows[0].id;
        }

        await client.query("COMMIT");

        return res.status(200).json({
            status: "success",
            conversation: {
                id: conversationId,
                customer_name: customer.name || name || phone,
                customer_phone: customer.phone
            }
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(
            "Erro ao iniciar conversa:",
            error.message
        );

        return res.status(500).json({
            message: "Não foi possível criar ou localizar a conversa."
        });
    } finally {
        client.release();
    }
});

module.exports = router;
