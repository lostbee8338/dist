const express = require("express");
const axios = require("axios");
const pool = require("../config/database");

const router = express.Router();

async function getAuthorizedConversation(req, conversationId) {
    const id = Number(conversationId);
    if (!Number.isInteger(id) || id <= 0) return { invalid: true };
    const isAdmin = req.user?.role === "admin";
    const departmentId = req.user?.department_id || -1;
    const result = await pool.query(
        `SELECT c.id, c.department_id, c.signature_sent, c.status, cu.phone, d.name AS department_name
         FROM conversations c
         INNER JOIN customers cu ON cu.id=c.customer_id
         LEFT JOIN departments d ON d.id=c.department_id
         WHERE c.id=$1 AND ($2::boolean = TRUE OR c.department_id=$3 OR EXISTS (SELECT 1 FROM conversation_departments cd WHERE cd.conversation_id=c.id AND cd.department_id=$3))
         LIMIT 1`,
        [id, isAdmin, departmentId]
    );
    return result.rows[0] || null;
}

async function saveOutgoingMessage(conversationId, externalId, type, content) {
    let existing = null;
    if (externalId) {
        const found = await pool.query("SELECT id FROM messages WHERE external_id=$1 LIMIT 1", [externalId]);
        if (found.rows.length) existing = found.rows[0];
    }
    if (existing) {
        await pool.query(
            `UPDATE messages SET conversation_id=$1, external_id=$2, direction='outgoing',
             message_type=$3, content=$4 WHERE id=$5`,
            [conversationId, externalId, type, content, existing.id]
        );
    } else {
        await pool.query(
            `INSERT INTO messages (conversation_id, external_id, direction, message_type, content)
             VALUES ($1, $2, 'outgoing', $3, $4)`,
            [conversationId, externalId, type, content]
        );
    }
}


router.post("/reaction", async (req, res) => {
    try {
        const { conversation_id, external_id, reaction, fromMe } = req.body || {};
        const allowed = new Set(["❤️", "👍", "😂", "😮", "😢", "🙏"]);
        if (!external_id || !allowed.has(reaction)) return res.status(400).json({ status: "error", message: "Mensagem ou reação inválida." });
        const conversation = await getAuthorizedConversation(req, conversation_id);
        if (!conversation) return res.status(404).json({ status: "error", message: "Conversa não encontrada ou sem permissão." });
        const phone = String(conversation.phone || "").replace(/\D/g, "");
        const response = await axios.post(`${process.env.EVOLUTION_URL}/message/sendReaction/${process.env.EVOLUTION_INSTANCE}`, {
            key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: Boolean(fromMe), id: String(external_id) }, reaction
        }, { headers: { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json" }, timeout: 15000 });
        return res.json({ status: "success", evolution: response.data });
    } catch (error) {
        console.error("Erro ao reagir à mensagem:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ status: "error", message: "A Evolution API não confirmou o envio da reação.", details: error.response?.data || error.message });
    }
});

router.post("/send", async (req, res) => {
    try {
        const { message, conversation_id, quoted } = req.body || {};
        const messageText = String(message || "").trim();
        if (!conversation_id || !messageText) {
            return res.status(400).json({ status: "error", message: "Conversa e mensagem são obrigatórias" });
        }

        const conversation = await getAuthorizedConversation(req, conversation_id);
        if (conversation?.invalid) {
            return res.status(400).json({ status: "error", message: "ID de conversa inválido" });
        }
        if (!conversation) {
            return res.status(404).json({ status: "error", message: "Conversa não encontrada ou sem permissão" });
        }

        const phone = String(conversation.phone || "").trim();
        if (conversation.status === "closed") {
            return res.status(409).json({ status: "error", message: "Este atendimento está finalizado. Atualize a lista para iniciar um novo atendimento quando o cliente voltar a entrar em contato." });
        }
        let messageToSend = messageText;
        let addSignature = false;
        if (!conversation.signature_sent) {
            const signature = `${req.user?.name || "Colaborador"} | ${conversation.department_name || "Atendimento"}`;
            messageToSend = `*${signature}*\n\n${messageText}`;
            addSignature = true;
        }
        if (!phone) {
            return res.status(400).json({ status: "error", message: "A conversa não possui telefone cadastrado" });
        }

        const response = await axios.post(
            `${process.env.EVOLUTION_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
            {
                number: phone,
                text: messageToSend,
                ...(quoted?.id ? { quoted: {
                    key: { remoteJid: `${phone.replace(/\D/g, "")}@s.whatsapp.net`, fromMe: Boolean(quoted.fromMe), id: String(quoted.id) },
                    message: { conversation: String(quoted.content || "Mensagem") }
                } } : {})
            },
            { headers: { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json" } }
        );

        const externalId = response.data?.key?.id || response.data?.message?.key?.id || null;
        await saveOutgoingMessage(Number(conversation_id), externalId, "text", messageToSend);
        if (addSignature) {
            await pool.query("UPDATE conversations SET signature_sent=TRUE WHERE id=$1", [Number(conversation_id)]);
        }

        return res.status(200).json({
            status: "success",
            message: "Mensagem enviada com sucesso",
            evolution: response.data
        });
    } catch (error) {
        console.error("Erro ao enviar mensagem:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            status: "error",
            message: "Não foi possível enviar a mensagem",
            error: error.response?.data || error.message
        });
    }
});

router.post("/media/send", async (req, res) => {
    try {
        const { targetId, fileName, mimetype, media, caption } = req.body || {};
        const conversationId = Number(targetId);
        const safeFileName = String(fileName || "arquivo").trim();
        const safeMimeType = String(mimetype || "application/octet-stream").trim();
        const incomingMedia = String(media || "").trim();
        const mediaCaption = String(caption || "").trim();

        if (!Number.isInteger(conversationId) || conversationId <= 0 || !incomingMedia) {
            return res.status(400).json({ status: "error", error: "Dados da mídia incompletos." });
        }

        const conversation = await getAuthorizedConversation(req, conversationId);
        if (!conversation) {
            return res.status(404).json({ status: "error", error: "Conversa não encontrada ou sem permissão." });
        }
        const phone = String(conversation.phone || "").trim();
        if (conversation.status === "closed") {
            return res.status(409).json({ status: "error", error: "Este atendimento está finalizado." });
        }
        let captionToSend = mediaCaption;
        let addSignature = false;
        if (!conversation.signature_sent) {
            const signature = `${req.user?.name || "Colaborador"} | ${conversation.department_name || "Atendimento"}`;
            captionToSend = captionToSend ? `*${signature}*\n\n${captionToSend}` : `*${signature}*`;
            addSignature = true;
        }
        if (!phone) {
            return res.status(400).json({ status: "error", error: "A conversa não possui telefone cadastrado." });
        }

        let normalizedMedia = incomingMedia;
        const dataUrlMatch = normalizedMedia.match(/^data:[^,]*;base64,/i);
        if (dataUrlMatch) normalizedMedia = normalizedMedia.slice(dataUrlMatch[0].length);
        if (!/^https?:\/\//i.test(normalizedMedia)) normalizedMedia = normalizedMedia.replace(/\s/g, "");
        if (!normalizedMedia) {
            return res.status(400).json({ status: "error", error: "O conteúdo da mídia está vazio." });
        }

        let mediatype = "document";
        if (safeMimeType.startsWith("image/")) mediatype = "image";
        else if (safeMimeType.startsWith("video/")) mediatype = "video";
        else if (safeMimeType.startsWith("audio/")) mediatype = "audio";

        const evolutionResponse = await axios.post(
            `${process.env.EVOLUTION_URL}/message/sendMedia/${process.env.EVOLUTION_INSTANCE}`,
            {
                number: phone, mediatype, mimetype: safeMimeType,
                caption: captionToSend, media: normalizedMedia, fileName: safeFileName
            },
            {
                headers: { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json" },
                timeout: 120000, maxContentLength: Infinity, maxBodyLength: Infinity
            }
        );

        const externalId =
            evolutionResponse.data?.key?.id ||
            evolutionResponse.data?.message?.key?.id ||
            evolutionResponse.data?.data?.key?.id ||
            null;

        await saveOutgoingMessage(conversationId, externalId, mediatype, captionToSend || `[${mediatype}]`);
        if (addSignature) {
            await pool.query("UPDATE conversations SET signature_sent=TRUE WHERE id=$1", [conversationId]);
        }
        return res.status(200).json({
            status: "success", message: "Mídia enviada com sucesso.",
            externalId, evolution: evolutionResponse.data
        });
    } catch (error) {
        console.error("Erro ao enviar mídia individual:", error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({
            status: "error",
            error: error.response?.data?.response?.message?.[0] ||
                error.response?.data?.message || error.message ||
                "Não foi possível enviar a mídia."
        });
    }
});

module.exports = router;
