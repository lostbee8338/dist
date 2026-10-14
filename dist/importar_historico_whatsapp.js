require("dotenv").config();

const axios = require("axios");
const pool = require("./src/config/database");

const EVOLUTION_URL =
    process.env.EVOLUTION_URL || "http://localhost:8080";

const EVOLUTION_API_KEY =
    process.env.EVOLUTION_API_KEY;

const EVOLUTION_INSTANCE =
    process.env.EVOLUTION_INSTANCE || "melo-melo";

const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 150;

const evolution = axios.create({
    baseURL: EVOLUTION_URL,
    headers: {
        apikey: EVOLUTION_API_KEY,
        "Content-Type": "application/json",
    },
    timeout: 30000,
});

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrapMessages(data) {
    if (!data) return [];

    if (Array.isArray(data)) return data;

    if (Array.isArray(data.records)) {
        return data.records;
    }

    if (Array.isArray(data.messages?.records)) {
        return data.messages.records;
    }

    if (Array.isArray(data.data?.records)) {
        return data.data.records;
    }

    return [];
}

function getPagination(data) {
    const source =
        data?.messages && !Array.isArray(data.messages)
            ? data.messages
            : data;

    return {
        total: Number(source?.total || 0),
        pages: Number(source?.pages || 1),
        currentPage: Number(source?.currentPage || 1),
    };
}

function extractText(message) {
    if (!message) return "";

    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        message.buttonsResponseMessage?.selectedDisplayText ||
        message.listResponseMessage?.title ||
        message.templateButtonReplyMessage?.selectedDisplayText ||
        ""
    );
}

function getMessageType(record) {
    if (record?.messageType) {
        return String(record.messageType);
    }

    const message = record?.message || {};

    if (message.conversation) return "conversation";
    if (message.extendedTextMessage) return "extendedTextMessage";
    if (message.imageMessage) return "imageMessage";
    if (message.videoMessage) return "videoMessage";
    if (message.audioMessage) return "audioMessage";
    if (message.documentMessage) return "documentMessage";
    if (message.stickerMessage) return "stickerMessage";
    if (message.contactMessage) return "contactMessage";
    if (message.locationMessage) return "locationMessage";

    return "unknown";
}

function getSentAt(record) {
    const timestamp = Number(record?.messageTimestamp || 0);

    if (!timestamp) {
        return null;
    }

    /*
     * PostgreSQL usa timestamp sem timezone no projeto.
     * Guardamos a hora local de Brasília.
     */
    const date = new Date(timestamp * 1000);

    const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);

    const values = {};
    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function normalizeJid(value) {
    if (!value) return null;

    const jid = String(value).trim();

    if (!jid) return null;

    return jid;
}

function jidToPhone(jid) {
    if (!jid) return "";

    const value = String(jid);

    if (value.endsWith("@s.whatsapp.net")) {
        return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
    }

    return "";
}

async function fetchMessages(remoteJid) {
    const all = [];

    let page = 1;
    let pages = 1;

    do {
        const body = {
            where: {
                key: {
                    remoteJid,
                },
            },
            additionalFields: {
                limit: PAGE_SIZE,
            },
            page,
        };

        const response = await evolution.post(
            `/chat/findMessages/${EVOLUTION_INSTANCE}`,
            body
        );

        const records = unwrapMessages(response.data);
        const pagination = getPagination(response.data);

        pages = pagination.pages || 1;

        all.push(...records);

        console.log(
            `    página ${page}/${pages} | ${records.length} mensagens`
        );

        page++;

        if (page <= pages) {
            await sleep(REQUEST_DELAY_MS);
        }
    } while (page <= pages);

    /*
     * A API pode retornar registros repetidos em algumas versões.
     * O external_id será usado novamente como proteção no banco.
     */
    const unique = new Map();

    for (const record of all) {
        const id =
            record?.key?.id ||
            record?.id;

        if (id) {
            unique.set(id, record);
        }
    }

    return Array.from(unique.values());
}

async function ensureCustomer(phone, name) {
    if (!phone) return null;

    const cleanPhone = phone.replace(/\D/g, "");

    if (!cleanPhone) return null;

    if (name) {
        const result = await pool.query(
            `
            INSERT INTO customers (
                name,
                phone
            )
            VALUES ($1, $2)
            ON CONFLICT (phone)
            DO UPDATE SET
                name = CASE
                    WHEN customers.name IS NULL
                         OR customers.name = ''
                    THEN EXCLUDED.name
                    ELSE customers.name
                END,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
            `,
            [name, cleanPhone]
        );

        return result.rows[0].id;
    }

    const result = await pool.query(
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
        [cleanPhone]
    );

    return result.rows[0].id;
}

async function ensureConversation(customerId) {
    const existing = await pool.query(
        `
        SELECT id
        FROM conversations
        WHERE customer_id = $1
        ORDER BY
            CASE WHEN status = 'open' THEN 0 ELSE 1 END,
            id DESC
        LIMIT 1
        `,
        [customerId]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0].id;
    }

    const created = await pool.query(
        `
        INSERT INTO conversations (
            customer_id,
            status
        )
        VALUES ($1, 'open')
        RETURNING id
        `,
        [customerId]
    );

    return created.rows[0].id;
}

async function importIndividualMessage(record) {
    const key = record?.key || {};

    const externalId =
        key.id ||
        record?.id ||
        null;

    if (!externalId) {
        return false;
    }

    const remoteJid =
        normalizeJid(key.remoteJid);

    if (!remoteJid || remoteJid.endsWith("@g.us")) {
        return false;
    }

    /*
     * LID: quando houver remoteJidAlt, usamos o número real.
     */
    const realJid =
        remoteJid.endsWith("@lid") && key.remoteJidAlt
            ? key.remoteJidAlt
            : remoteJid;

    const phone = jidToPhone(realJid);

    if (!phone) {
        console.log(
            `    ignorada ${externalId}: JID sem telefone (${remoteJid})`
        );
        return false;
    }

    const direction =
        key.fromMe === true
            ? "outgoing"
            : "incoming";

    const content =
        extractText(record?.message);

    const messageType =
        getMessageType(record);

    const sentAt =
        getSentAt(record);

    const pushName =
        typeof record?.pushName === "string"
            ? record.pushName.trim()
            : "";

    const customerId =
        await ensureCustomer(
            phone,
            direction === "incoming"
                ? pushName
                : null
        );

    if (!customerId) {
        return false;
    }

    const conversationId =
        await ensureConversation(customerId);

    /*
     * Não duplicar.
     */
    const exists = await pool.query(
        `
        SELECT id
        FROM messages
        WHERE external_id = $1
        LIMIT 1
        `,
        [externalId]
    );

    if (exists.rows.length > 0) {
        return false;
    }

    /*
     * Mantemos mensagens sem texto também.
     * O conteúdo recebe uma indicação do tipo para que
     * o histórico não desapareça visualmente.
     */
    const finalContent =
        content ||
        `[${messageType}]`;

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
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            COALESCE(
                $6::timestamp,
                CURRENT_TIMESTAMP
            )
        )
        `,
        [
            conversationId,
            externalId,
            direction,
            messageType,
            finalContent,
            sentAt,
        ]
    );

    return true;
}

async function importGroupMessage(groupId, record) {
    const key = record?.key || {};

    const externalId =
        key.id ||
        record?.id ||
        null;

    if (!externalId) {
        return false;
    }

    const remoteJid =
        normalizeJid(key.remoteJid);

    if (!remoteJid || !remoteJid.endsWith("@g.us")) {
        return false;
    }

    const direction =
        key.fromMe === true
            ? "outgoing"
            : "incoming";

    const participantJid =
        key.participant ||
        record?.participant ||
        record?.senderPn ||
        record?.sender;

    const participantName =
        typeof record?.pushName === "string"
            ? record.pushName.trim()
            : "";

    const messageType =
        getMessageType(record);

    const content =
        extractText(record?.message);

    const sentAt =
        getSentAt(record);

    const exists = await pool.query(
        `
        SELECT id
        FROM group_messages
        WHERE external_id = $1
        LIMIT 1
        `,
        [externalId]
    );

    if (exists.rows.length > 0) {
        return false;
    }

    const finalContent =
        content ||
        `[${messageType}]`;

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
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            COALESCE(
                $8::timestamp,
                CURRENT_TIMESTAMP
            )
        )
        `,
        [
            groupId,
            externalId,
            participantJid || null,
            participantName || null,
            direction,
            messageType,
            finalContent,
            sentAt,
        ]
    );

    return true;
}

async function getGroups() {
    const result = await pool.query(
        `
        SELECT
            id,
            whatsapp_jid,
            name
        FROM groups
        ORDER BY id
        `
    );

    return result.rows;
}

async function getCustomers() {
    const result = await pool.query(
        `
        SELECT
            id,
            phone,
            name
        FROM customers
        WHERE phone IS NOT NULL
          AND phone <> ''
        ORDER BY id
        `
    );

    return result.rows;
}

async function getEvolutionChats() {
    try {
        const response = await evolution.post(
            `/chat/findChats/${EVOLUTION_INSTANCE}`,
            {}
        );

        const data = response.data;

        if (Array.isArray(data)) {
            return data;
        }

        if (Array.isArray(data?.records)) {
            return data.records;
        }

        if (Array.isArray(data?.chats)) {
            return data.chats;
        }

        if (Array.isArray(data?.data)) {
            return data.data;
        }

        return [];
    } catch (error) {
        console.log(
            "    Não foi possível listar chats da Evolution; usando os clientes do banco."
        );

        return [];
    }
}

async function main() {
    console.log("");
    console.log("==============================================");
    console.log(" IMPORTAÇÃO DE HISTÓRICO DO WHATSAPP");
    console.log(" Evolution API 2.3.7");
    console.log("==============================================");
    console.log("");

    const summary = {
        groups: 0,
        groupMessages: 0,
        conversations: 0,
        messages: 0,
        skipped: 0,
    };

    /*
     * 1. GRUPOS
     */
    const groups = await getGroups();

    console.log(
        `GRUPOS ENCONTRADOS NO BANCO: ${groups.length}`
    );
    console.log("");

    for (const group of groups) {
        console.log(
            `GRUPO: ${group.name || group.whatsapp_jid}`
        );
        console.log(`JID: ${group.whatsapp_jid}`);

        try {
            const records =
                await fetchMessages(group.whatsapp_jid);

            let inserted = 0;

            for (const record of records) {
                const ok =
                    await importGroupMessage(
                        group.id,
                        record
                    );

                if (ok) {
                    inserted++;
                } else {
                    summary.skipped++;
                }
            }

            summary.groups++;
            summary.groupMessages += inserted;

            console.log(
                `    importadas: ${inserted} | disponíveis: ${records.length}`
            );
            console.log("");
        } catch (error) {
            console.error(
                `    ERRO NO GRUPO:`,
                error.response?.data ||
                    error.message
            );
            console.log("");
        }
    }

    /*
     * 2. CONVERSAS INDIVIDUAIS
     *
     * Primeiro usamos os clientes que já existem no banco.
     * Depois tentamos descobrir chats adicionais diretamente
     * na Evolution.
     */
    const customers =
        await getCustomers();

    const chatRecords =
        await getEvolutionChats();

    const jids = new Set();

    for (const customer of customers) {
        const phone =
            String(customer.phone || "")
                .replace(/\D/g, "");

        if (phone) {
            jids.add(
                `${phone}@s.whatsapp.net`
            );
        }
    }

    for (const chat of chatRecords) {
        const jid =
            normalizeJid(
                chat?.remoteJid ||
                chat?.id ||
                chat?.key?.remoteJid
            );

        if (
            jid &&
            !jid.endsWith("@g.us") &&
            !jid.endsWith("@broadcast")
        ) {
            jids.add(jid);
        }
    }

    console.log(
        `CHATS INDIVIDUAIS PARA IMPORTAÇÃO: ${jids.size}`
    );
    console.log("");

    for (const remoteJid of jids) {
        console.log(`CONVERSA: ${remoteJid}`);

        try {
            const records =
                await fetchMessages(remoteJid);

            let inserted = 0;

            for (const record of records) {
                const ok =
                    await importIndividualMessage(
                        record
                    );

                if (ok) {
                    inserted++;
                } else {
                    summary.skipped++;
                }
            }

            summary.conversations++;
            summary.messages += inserted;

            console.log(
                `    importadas: ${inserted} | disponíveis: ${records.length}`
            );
            console.log("");
        } catch (error) {
            console.error(
                `    ERRO NA CONVERSA:`,
                error.response?.data ||
                    error.message
            );
            console.log("");
        }
    }

    console.log("");
    console.log("==============================================");
    console.log(" IMPORTAÇÃO FINALIZADA");
    console.log("==============================================");
    console.log(
        `Grupos processados: ${summary.groups}`
    );
    console.log(
        `Mensagens de grupos importadas: ${summary.groupMessages}`
    );
    console.log(
        `Conversas processadas: ${summary.conversations}`
    );
    console.log(
        `Mensagens individuais importadas: ${summary.messages}`
    );
    console.log(
        `Registros já existentes/ignorados: ${summary.skipped}`
    );
    console.log("==============================================");
    console.log("");
}

main()
    .catch((error) => {
        console.error("");
        console.error(
            "FALHA GERAL NA IMPORTAÇÃO:"
        );
        console.error(
            error.response?.data ||
                error.message ||
                error
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
