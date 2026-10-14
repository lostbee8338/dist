const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const pool = require("./src/config/database");
const initializeDatabase = require("./src/database/init");
const authenticateToken = require("./src/middleware/auth");

const usersRoutes = require("./src/routes/users");
const messagesRoutes = require("./src/routes/messages");
const conversationsRoutes = require("./src/routes/conversations");
const departmentsRoutes = require("./src/routes/departments");
const authRoutes = require("./src/routes/auth");
const groupsRoutes = require("./src/routes/groups");
const botRoutes = require("./src/routes/bot");

const app = express();

app.use(cors());
app.use(express.json({ limit: "85mb" }));

app.use("/api/auth", authRoutes);

app.use("/api/users", authenticateToken, usersRoutes);
app.use("/api/messages", authenticateToken, messagesRoutes);
app.use("/api/conversations", authenticateToken, conversationsRoutes);
app.use("/api/departments", authenticateToken, departmentsRoutes);
app.use("/api/groups", authenticateToken, groupsRoutes);
app.use("/api/bot", authenticateToken, botRoutes);

app.get("/", (req, res) => {
    res.json({
        status: "success",
        message: "Backend do Sistema de Atendimento estÃ¡ funcionando"
    });
});

app.get("/api/whatsapp/status", async (req, res) => {
    try {
        const response = await axios.get(
            `${process.env.EVOLUTION_URL}/instance/connectionState/${process.env.EVOLUTION_INSTANCE}`,
            {
                headers: {
                    apikey: process.env.EVOLUTION_API_KEY
                }
            }
        );

        res.json({
            status: "success",
            whatsapp: response.data
        });
    } catch (error) {
        console.error(
            "Erro ao consultar WhatsApp:",
            error.response?.data || error.message
        );

        res.status(500).json({
            status: "error",
            message: "NÃ£o foi possÃ­vel consultar o WhatsApp"
        });
    }
});

/*
 * NOVA CONVERSA
 * As credenciais da Evolution API ficam somente no backend.
 * A rota de contatos retorna contatos individuais, sem grupos.
 */
app.get("/api/whatsapp/contacts", authenticateToken, async (req, res) => {
    const headers = { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json" };

    function getRows(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.contacts)) return payload.contacts;
        if (Array.isArray(payload?.response)) return payload.response;
        if (Array.isArray(payload?.records)) return payload.records;
        if (Array.isArray(payload?.chats)) return payload.chats;
        return [];
    }

    try {
        let records = [];
        let firstError = null;

        try {
            const response = await axios.post(
                `${process.env.EVOLUTION_URL}/chat/findContacts/${process.env.EVOLUTION_INSTANCE}`,
                {},
                { headers, timeout: 25000 }
            );
            records = getRows(response.data);
        } catch (error) {
            firstError = error;
        }

        // Algumas instâncias têm a agenda incompleta; tenta os chats sincronizados como alternativa.
        if (!records.length) {
            try {
                const response = await axios.post(
                    `${process.env.EVOLUTION_URL}/chat/findChats/${process.env.EVOLUTION_INSTANCE}`,
                    {},
                    { headers, timeout: 25000 }
                );
                records = getRows(response.data);
            } catch (error) {
                if (firstError) {
                    console.error("Evolution findContacts/findChats falhou:", firstError.response?.data || firstError.message, error.response?.data || error.message);
                } else {
                    firstError = error;
                }
            }
        }

        if (firstError && !records.length) {
            return res.status(502).json({
                message: "Não foi possível consultar os contatos do WhatsApp."
            });
        }

        const byPhone = new Map();
        for (const item of records) {
            const remoteJid = String(item?.remoteJid || item?.jid || "");
            if (remoteJid.includes("@g.us") || remoteJid.includes("status@broadcast")) continue;

            const rawNumber = remoteJid
                ? remoteJid.split("@")[0]
                : String(item?.phone || item?.number || "");
            const phone = rawNumber.replace(/\D/g, "");
            if (phone.length < 10 || phone.length > 15) continue;
            if (item?.isSaved === false) continue;

            const name = String(
                item?.pushName ||
                item?.name ||
                item?.notify ||
                item?.verifiedName ||
                phone
            ).trim();

            if (!byPhone.has(phone)) {
                byPhone.set(phone, { name: name || phone, phone });
            }
        }

        const contacts = Array.from(byPhone.values()).sort((a, b) =>
            a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
        );

        return res.json({ contacts });
    } catch (error) {
        console.error("Erro ao carregar contatos do WhatsApp:", error.response?.data || error.message);
        return res.status(500).json({
            message: "Ocorreu um erro ao carregar os contatos do WhatsApp."
        });
    }
});

// FOTOS DE PERFIL DO WHATSAPP
// Cache no backend para evitar consultar a Evolution repetidamente durante o polling do frontend.
const whatsappProfilePictureCache = new Map();
const PROFILE_PICTURE_TTL_MS = 30 * 60 * 1000;
const PROFILE_PICTURE_EMPTY_TTL_MS = 5 * 60 * 1000;

function normalizeProfilePictureTarget(value) {
    const raw = String(value || "").trim();
    if (/^\d+(?:-\d+)?@g\.us$/i.test(raw)) return raw;
    if (raw.includes("@s.whatsapp.net")) return raw.split("@")[0].replace(/\D/g, "");
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

async function getWhatsappProfilePicture(target, forceRefresh = false) {
    const now = Date.now();
    const cached = whatsappProfilePictureCache.get(target);
    if (!forceRefresh && cached && cached.expiresAt > now) return cached.url;

    try {
        const response = await axios.post(
            `${process.env.EVOLUTION_URL}/chat/fetchProfilePictureUrl/${process.env.EVOLUTION_INSTANCE}`,
            { number: target },
            {
                headers: {
                    apikey: process.env.EVOLUTION_API_KEY,
                    "Content-Type": "application/json"
                },
                timeout: 12000
            }
        );

        const payload = response.data || {};
        const candidate = payload.profilePictureUrl || payload.profilePicUrl ||
            payload.pictureUrl || payload.url || payload.data?.profilePictureUrl ||
            payload.data?.profilePicUrl || null;
        const url = typeof candidate === "string" && /^https?:\/\//i.test(candidate)
            ? candidate
            : null;

        whatsappProfilePictureCache.set(target, {
            url,
            expiresAt: Date.now() + (url ? PROFILE_PICTURE_TTL_MS : PROFILE_PICTURE_EMPTY_TTL_MS)
        });
        return url;
    } catch (error) {
        const status = error.response?.status;
        // Ausência de foto é normal no WhatsApp; não transforma isso em erro do atendimento.
        whatsappProfilePictureCache.set(target, {
            url: null,
            expiresAt: Date.now() + PROFILE_PICTURE_EMPTY_TTL_MS
        });
        if (status && status !== 404) {
            console.warn("Não foi possível obter foto de perfil do WhatsApp:", status);
        }
        return null;
    }
}

app.post("/api/whatsapp/profile-pictures", authenticateToken, async (req, res) => {
    try {
        const requested = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
        if (requested.length > 80) {
            return res.status(400).json({ message: "Consulte no máximo 80 fotos por solicitação." });
        }

        const targets = [...new Set(requested.map(normalizeProfilePictureTarget).filter(Boolean))];
        const forceRefresh = req.body?.refresh === true;
        const pictures = {};
        // Uma consulta por vez para evitar rate-overlimit na Evolution API.
        for (const target of targets) {
            pictures[target] = await getWhatsappProfilePicture(target, forceRefresh);
            if (targets.length > 1) {
                await new Promise(resolve => setTimeout(resolve, 900));
            }
        }

        return res.json({ pictures });
    } catch (error) {
        console.error("Erro ao consultar fotos de perfil do WhatsApp:", error.message);
        return res.status(500).json({ message: "Não foi possível carregar as fotos de perfil." });
    }
});

app.post("/api/whatsapp/new-conversation", authenticateToken, async (req, res) => {
    try {
        const phone = String(req.body?.phone || "").replace(/\D/g, "");
        const name = String(req.body?.name || "").trim().slice(0, 120);

        if (phone.length < 10 || phone.length > 15) {
            return res.status(400).json({
                message: "Informe um número válido com DDI e DDD."
            });
        }

        const customerResult = await pool.query(
            `INSERT INTO customers (name, phone)
             VALUES (NULLIF($1, ''), $2)
             ON CONFLICT (phone)
             DO UPDATE SET
                 name = COALESCE(NULLIF(EXCLUDED.name, ''), customers.name),
                 updated_at = CURRENT_TIMESTAMP
             RETURNING id, name, phone`,
            [name, phone]
        );

        const customer = customerResult.rows[0];
        const existing = await pool.query(
            `SELECT id
             FROM conversations
             WHERE customer_id = $1 AND status = 'open'
             ORDER BY id DESC
             LIMIT 1`,
            [customer.id]
        );

        let conversationId;
        if (existing.rows.length) {
            conversationId = existing.rows[0].id;
        } else {
            const created = await pool.query(
                `INSERT INTO conversations (customer_id, status)
                 VALUES ($1, 'open')
                 RETURNING id`,
                [customer.id]
            );
            conversationId = created.rows[0].id;
        }

        return res.json({
            status: "success",
            conversation_id: conversationId,
            customer: {
                id: customer.id,
                name: customer.name || name || phone,
                phone: customer.phone
            }
        });
    } catch (error) {
        console.error("Erro ao iniciar nova conversa:", error);
        return res.status(500).json({
            message: "Não foi possível criar a conversa no banco de dados."
        });
    }
});

app.get("/api/database/status", async (req, res) => {
    try {
        await pool.query("SELECT NOW()");

        res.json({
            status: "success",
            database: "connected"
        });
    } catch (error) {
        console.error("Erro no banco:", error.message);

        res.status(500).json({
            status: "error",
            database: "disconnected"
        });
    }
});


async function ensureBotColumns() {
    await pool.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_state VARCHAR(40)");
    await pool.query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS signature_sent BOOLEAN NOT NULL DEFAULT FALSE");
    await pool.query(`CREATE TABLE IF NOT EXISTS bot_department_mappings (
        reply_number VARCHAR(10) PRIMARY KEY,
        department_ids INTEGER[] NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS conversation_departments (
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (conversation_id, department_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS quick_replies (
        id SERIAL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by INTEGER NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}

async function sendBotText(phone, text) {
    const response = await axios.post(
        `${process.env.EVOLUTION_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
        { number: phone, text },
        { headers: { apikey: process.env.EVOLUTION_API_KEY, "Content-Type": "application/json" }, timeout: 20000 }
    );
    return response.data;
}

async function saveBotMessage(conversationId, response, text) {
    const externalId = response?.key?.id || response?.message?.key?.id || response?.data?.key?.id || null;
    await pool.query(
        "INSERT INTO messages (conversation_id, external_id, direction, message_type, content) VALUES ($1,$2,'outgoing','text',$3)",
        [conversationId, externalId, text]
    );
}

async function getBotMappings() {
    const configured = await pool.query(`
        SELECT m.reply_number, m.department_ids,
               ARRAY(SELECT d.name FROM departments d WHERE d.id = ANY(m.department_ids) AND d.active=TRUE ORDER BY d.name) AS department_names
        FROM bot_department_mappings m
        ORDER BY m.reply_number::INTEGER, m.reply_number
    `);
    const mappings = configured.rows.filter(row => (row.department_ids || []).length > 0 && (row.department_names || []).length > 0);
    if (mappings.length) return mappings;
    const defaults = await pool.query("SELECT id, name FROM departments WHERE active=TRUE ORDER BY name");
    return defaults.rows.map((d, i) => ({ reply_number: String(i + 1), department_ids: [d.id], department_names: [d.name] }));
}

async function sendDepartmentMenu(phone, conversationId) {
    const mappings = await getBotMappings();
    let text;
    if (!mappings.length) {
        text = "Olá! Recebemos sua mensagem. No momento, não há departamentos ativos configurados para o atendimento. Nossa equipe fará o direcionamento assim que possível.";
    } else {
        text = "Olá! Seja bem-vindo(a) à Melo & Melo Associados.\n\nPara direcionar seu atendimento, responda com o número correspondente ao departamento desejado:\n\n" +
            mappings.map(m => `${m.reply_number}. ${(m.department_names || []).join(" / ")}`).join("\n") +
            "\n\nAguardaremos sua escolha.";
    }
    const sent = await sendBotText(phone, text);
    await saveBotMessage(conversationId, sent, text);
}

/*
 * WEBHOOK DA EVOLUTION
 * NÃ£o utiliza autenticaÃ§Ã£o JWT.
 */
app.post("/api/webhook/evolution", async (req, res) => {
    try {
        await ensureBotColumns();
        const event = req.body;

        console.log(
            "Webhook Evolution recebido:",
            event?.event
        );

        if (event?.event !== "messages.upsert") {
            return res.status(200).json({
                status: "ignored"
            });
        }

        const data = event?.data;

        if (!data) {
            return res.status(200).json({
                status: "ignored"
            });
        }

        const key = data.key;

        if (!key) {
            return res.status(200).json({
                status: "ignored"
            });
        }

        const remoteJid = key.remoteJid;

        if (!remoteJid) {
            return res.status(200).json({
                status: "ignored"
            });
        }

        /*
         * Registra mensagens recebidas/enviadas em grupos. Antes, o webhook
         * ignorava explicitamente qualquer remoteJid terminado em @g.us,
         * por isso os grupos só enviavam e nunca recebiam mensagens na tela.
         */
        if (remoteJid.endsWith("@g.us")) {
            const group = await pool.query(
                "SELECT id FROM groups WHERE whatsapp_jid=$1 LIMIT 1",
                [remoteJid]
            );
            if (!group.rows.length) {
                console.log(`Mensagem de grupo ignorada: grupo ainda não sincronizado (${remoteJid})`);
                return res.status(200).json({ status: "group_not_synced" });
            }
            if (!data.message) return res.status(200).json({ status: "ignored" });

            let groupMessage = data.message;
            for (let i = 0; i < 5; i++) {
                const wrappers = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage"];
                const wrapper = wrappers.find(k => groupMessage?.[k]?.message);
                if (!wrapper) break;
                groupMessage = groupMessage[wrapper].message;
            }
            const textContent = groupMessage.conversation ||
                groupMessage.extendedTextMessage?.text ||
                groupMessage.imageMessage?.caption ||
                groupMessage.videoMessage?.caption ||
                groupMessage.documentMessage?.caption || "";
            const typeMap = {
                imageMessage: "imageMessage", videoMessage: "videoMessage",
                audioMessage: "audioMessage", documentMessage: "documentMessage",
                stickerMessage: "stickerMessage", contactMessage: "contactMessage",
                locationMessage: "locationMessage", liveLocationMessage: "liveLocationMessage"
            };
            const foundType = Object.keys(typeMap).find(k => groupMessage[k] !== undefined);
            const groupType = groupMessage.conversation !== undefined || groupMessage.extendedTextMessage !== undefined
                ? "text" : (foundType || "text");
            const groupContent = textContent || ({
                imageMessage: "[Imagem]", videoMessage: "[Vídeo]", audioMessage: "[Áudio]",
                documentMessage: "[Documento]", stickerMessage: "[Figurinha]",
                contactMessage: "[Contato]", locationMessage: "[Localização]", liveLocationMessage: "[Localização]"
            }[groupType] || "[Mensagem]");
            if (key.id) {
                const duplicate = await pool.query("SELECT id FROM group_messages WHERE external_id=$1 LIMIT 1", [key.id]);
                if (duplicate.rows.length) return res.status(200).json({ status: "success", duplicate: true });
            }
            const participantJid = key.participant || data.participant || null;
            const participantName = (typeof data.pushName === "string" && data.pushName.trim()) || participantJid || "Participante";
            await pool.query(`
                INSERT INTO group_messages
                    (group_id, external_id, participant_jid, participant_name, direction, message_type, content, sent_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            `, [group.rows[0].id, key.id || null, participantJid, participantName,
                key.fromMe === true ? "outgoing" : "incoming", groupType, groupContent]);
            await pool.query("UPDATE groups SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [group.rows[0].id]);
            console.log(`Mensagem de grupo registrada: ${remoteJid} | ${participantName} | ${groupType}`);
            return res.status(200).json({ status: "success", group: true });
        }

        /*
         * Resolve LID para o nÃºmero real quando disponÃ­vel.
         */
        const phoneJid =
            remoteJid.endsWith("@lid") && key.remoteJidAlt
                ? key.remoteJidAlt
                : remoteJid;

        const phone = phoneJid
            .replace("@s.whatsapp.net", "")
            .replace("@lid", "")
            .replace(/\D/g, "");

        if (!phone) {
            return res.status(200).json({
                status: "ignored"
            });
        }

        const originalMessage = data.message;

        if (!originalMessage) {
            return res.status(200).json({
                status: "ignored"
            });
        }

        /*
         * Desembrulha mensagens encapsuladas pelo WhatsApp.
         */
        function unwrapMessage(message) {
            let current = message;

            for (let i = 0; i < 5; i++) {
                if (!current || typeof current !== "object") {
                    break;
                }

                const wrapperKeys = [
                    "ephemeralMessage",
                    "viewOnceMessage",
                    "viewOnceMessageV2",
                    "viewOnceMessageV2Extension",
                    "documentWithCaptionMessage"
                ];

                let found = false;

                for (const wrapperKey of wrapperKeys) {
                    if (current[wrapperKey]?.message) {
                        current = current[wrapperKey].message;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    break;
                }
            }

            return current;
        }

        const message = unwrapMessage(originalMessage);
        const selectedReplyId =
            message?.buttonsResponseMessage?.selectedButtonId ||
            message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            message?.templateButtonReplyMessage?.selectedId ||
            "";
        const selectedReplyText =
            message?.buttonsResponseMessage?.selectedDisplayText ||
            message?.listResponseMessage?.title ||
            message?.templateButtonReplyMessage?.selectedDisplayText ||
            "";

        /*
         * Identifica o tipo real da mensagem.
         */
        const knownMessageTypes = [
            "conversation",
            "extendedTextMessage",
            "imageMessage",
            "videoMessage",
            "audioMessage",
            "documentMessage",
            "stickerMessage",
            "contactMessage",
            "contactsArrayMessage",
            "locationMessage",
            "liveLocationMessage"
        ];

        let messageType = "text";

        for (const type of knownMessageTypes) {
            if (message[type] !== undefined) {
                if (type === "conversation") {
                    messageType = "text";
                } else if (type === "extendedTextMessage") {
                    messageType = "text";
                } else {
                    messageType = type;
                }
                break;
            }
        }

        /*
         * Extrai o conteÃºdo textual ou legenda.
         * Para mÃ­dia sem legenda, grava um marcador para o frontend.
         */
        let content = selectedReplyText || selectedReplyId || "";

        if (!content && typeof message.conversation === "string") {
            content = message.conversation;
        } else if (!content && typeof message.extendedTextMessage?.text === "string") {
            content = message.extendedTextMessage.text;
        } else if (!content && typeof message.imageMessage?.caption === "string") {
            content = message.imageMessage.caption;
        } else if (!content && typeof message.videoMessage?.caption === "string") {
            content = message.videoMessage.caption;
        } else if (!content && typeof message.documentMessage?.caption === "string") {
            content = message.documentMessage.caption;
        }

        if (!content) {
            const mediaLabels = {
                imageMessage: "[Imagem]",
                videoMessage: "[VÃ­deo]",
                audioMessage: "[Ãudio]",
                documentMessage: "[Documento]",
                stickerMessage: "[Figurinha]",
                contactMessage: "[Contato]",
                contactsArrayMessage: "[Contatos]",
                locationMessage: "[LocalizaÃ§Ã£o]",
                liveLocationMessage: "[LocalizaÃ§Ã£o]"
            };

            content = mediaLabels[messageType] || "";
        }

        /*
         * Se nÃ£o houver nenhum conteÃºdo reconhecÃ­vel,
         * ignora a mensagem.
         */
        if (!content) {
            return res.status(200).json({
                status: "ignored"
            });
        }

        const direction =
            key.fromMe === true
                ? "outgoing"
                : "incoming";

        const pushName =
            typeof data.pushName === "string"
                ? data.pushName.trim()
                : "";

        /*
         * Cria/atualiza o cliente.
         */
        let customerResult;

        if (direction === "incoming" && pushName) {
            customerResult = await pool.query(
                `
                INSERT INTO customers (
                    name,
                    phone
                )
                VALUES ($1, $2)
                ON CONFLICT (phone)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
                `,
                [
                    pushName,
                    phone
                ]
            );
        } else {
            customerResult = await pool.query(
                `
                INSERT INTO customers (
                    phone
                )
                VALUES ($1)
                ON CONFLICT (phone)
                DO UPDATE SET
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
                `,
                [phone]
            );
        }

        const customerId = customerResult.rows[0].id;

        /*
         * Reutiliza sempre a conversa mais recente do contato, inclusive
         * quando foi finalizada. Assim, novas mensagens reabrem o mesmo
         * histórico em vez de criar outra conversa.
         */
        const conversationResult = await pool.query(
            `
            SELECT id, status, department_id, bot_state, signature_sent
            FROM conversations
            WHERE customer_id = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [customerId]
        );

        let conversationId;
        let currentConversation = conversationResult.rows[0] || null;
        let wasWaitingForDepartment = currentConversation?.bot_state === "waiting_department";

        if (!currentConversation) {
            const newConversation = await pool.query(
                `
                INSERT INTO conversations (customer_id, status)
                VALUES ($1, 'open')
                RETURNING id, status, department_id, bot_state, signature_sent
                `,
                [customerId]
            );
            currentConversation = newConversation.rows[0];
            conversationId = currentConversation.id;
            wasWaitingForDepartment = false;
        } else {
            conversationId = currentConversation.id;

            // Só uma nova mensagem do cliente reabre um atendimento finalizado.
            if (direction === "incoming" && currentConversation.status === "closed") {
                const reopened = await pool.query(
                    `UPDATE conversations
                     SET status='open', closed_at=NULL, department_id=NULL,
                         bot_state=NULL, signature_sent=FALSE, assigned_user_id=NULL
                     WHERE id=$1
                     RETURNING id, status, department_id, bot_state, signature_sent`,
                    [conversationId]
                );
                currentConversation = reopened.rows[0];
                wasWaitingForDepartment = false;
                console.log(`Atendimento reaberto no mesmo histórico: conversa ${conversationId} | ${phone}`);
            }
        }

        /*
         * Evita duplicidade caso a mesma mensagem seja
         * processada novamente pelo webhook.
         */
        if (key.id) {
            const duplicate = await pool.query(
                `
                SELECT id
                FROM messages
                WHERE external_id = $1
                LIMIT 1
                `,
                [key.id]
            );

            if (duplicate.rows.length > 0) {
                return res.status(200).json({
                    status: "success",
                    duplicate: true
                });
            }
        }

        /* Processa a resposta numérica conforme as regras cadastradas pelo administrador. */
        let departmentWasSelected = false;
        let selectedDepartments = [];
        if (direction === "incoming" && wasWaitingForDepartment && !currentConversation?.department_id) {
            const numericReply = String(content || "").trim().match(/^\d{1,3}$/);
            if (numericReply) {
                const mapping = await pool.query(
                    "SELECT reply_number, department_ids FROM bot_department_mappings WHERE reply_number=$1 LIMIT 1",
                    [numericReply[0]]
                );
                const departmentIds = mapping.rows[0]?.department_ids || [];
                if (departmentIds.length) {
                    const activeDepartments = await pool.query(
                        "SELECT id, name FROM departments WHERE active=TRUE AND id=ANY($1::int[]) ORDER BY name",
                        [departmentIds]
                    );
                    selectedDepartments = activeDepartments.rows;
                }
                // Compatibilidade inicial: se não houver configuração salva, usa a numeração padrão exibida no menu.
                if (!selectedDepartments.length && mapping.rows.length === 0) {
                    const configuredCount = await pool.query("SELECT COUNT(*)::int AS count FROM bot_department_mappings");
                    if (configuredCount.rows[0].count === 0) {
                        const defaults = await pool.query("SELECT id, name FROM departments WHERE active=TRUE ORDER BY name");
                        const index = Number(numericReply[0]) - 1;
                        if (index >= 0 && index < defaults.rows.length) selectedDepartments = [defaults.rows[index]];
                    }
                }
            }
            if (selectedDepartments.length) {
                await pool.query("DELETE FROM conversation_departments WHERE conversation_id=$1", [conversationId]);
                for (const department of selectedDepartments) {
                    await pool.query(
                        "INSERT INTO conversation_departments (conversation_id, department_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
                        [conversationId, department.id]
                    );
                }
                const primaryDepartment = selectedDepartments[0];
                await pool.query(
                    "UPDATE conversations SET department_id=$1, bot_state=NULL, signature_sent=FALSE, status='open', closed_at=NULL WHERE id=$2",
                    [primaryDepartment.id, conversationId]
                );
                currentConversation.department_id = primaryDepartment.id;
                currentConversation.bot_state = null;
                departmentWasSelected = true;
                content = `Departamento(s) selecionado(s): ${selectedDepartments.map(d => d.name).join(", ")}`;
            }
        }

        /*
         * Registra texto e mÃ­dia na mesma tabela.
         */
        await pool.query(
            `
            INSERT INTO messages (
                conversation_id,
                external_id,
                direction,
                message_type,
                content
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5
            )
            `,
            [
                conversationId,
                key.id || null,
                direction,
                messageType,
                content
            ]
        );

        console.log(
            `Mensagem registrada: ${direction} | ${phone} | ${pushName || "sem nome"} | ${messageType} | ${content}`
        );

        if (direction === "incoming" && departmentWasSelected && selectedDepartments.length) {
            const names = selectedDepartments.map(d => d.name).join(" e ");
            const confirmation = `Obrigado! Seu atendimento foi direcionado para: ${names}. Em breve, nossa equipe dará continuidade por aqui.`;
            const sent = await sendBotText(phone, confirmation);
            await saveBotMessage(conversationId, sent, confirmation);
        } else if (direction === "incoming" && !currentConversation?.department_id && !wasWaitingForDepartment) {
            await pool.query(
                "UPDATE conversations SET bot_state='waiting_department' WHERE id=$1",
                [conversationId]
            );
            currentConversation.bot_state = "waiting_department";
            await sendDepartmentMenu(phone, conversationId);
        }

        return res.status(200).json({
            status: "success",
            messageType,
            externalId: key.id || null,
            conversationId
        });

    } catch (error) {
        console.error(
            "Erro no webhook Evolution:",
            error.response?.data || error
        );

        return res.status(500).json({
            status: "error",
            message: "Erro ao processar webhook"
        });
    }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        console.log("Inicializando banco de dados...");

        await initializeDatabase();
        await ensureBotColumns();

        console.log(
            "Banco de dados inicializado com sucesso."
        );

        app.listen(PORT, () => {
            console.log(
                `Backend iniciado na porta ${PORT}`
            );
        });

    } catch (error) {
        console.error(
            "Falha ao iniciar o backend:",
            error.message
        );

        process.exit(1);
    }
}

startServer();