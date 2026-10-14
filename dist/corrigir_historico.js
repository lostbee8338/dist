require("dotenv").config();

const axios = require("axios");
const { Pool } = require("pg");

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

async function corrigir() {
    try {
        const result = await pool.query(`
            SELECT id, external_id, direction
            FROM messages
            WHERE external_id IS NOT NULL
            ORDER BY id
        `);

        let verificadas = 0;
        let corrigidas = 0;
        let erros = 0;

        console.log("");
        console.log("========================================");
        console.log("CORRECAO DO HISTORICO");
        console.log("========================================");
        console.log("");

        for (const message of result.rows) {
            try {
                const response = await axios.post(
                    `${process.env.EVOLUTION_URL}/chat/findMessages/${process.env.EVOLUTION_INSTANCE}`,
                    {
                        where: {
                            key: {
                                id: message.external_id
                            }
                        },
                        limit: 1
                    },
                    {
                        headers: {
                            apikey: process.env.EVOLUTION_API_KEY
                        }
                    }
                );

                const record =
                    response.data?.messages?.records?.[0];

                if (!record) {
                    continue;
                }

                verificadas++;

                const direction =
                    record.key?.fromMe === true
                        ? "outgoing"
                        : "incoming";

                if (direction !== message.direction) {
                    await pool.query(
                        `
                        UPDATE messages
                        SET direction = $1
                        WHERE id = $2
                        `,
                        [
                            direction,
                            message.id
                        ]
                    );

                    corrigidas++;

                    console.log(
                        `CORRIGIDA | ID ${message.id} | ${message.direction} -> ${direction} | ${message.external_id}`
                    );
                }

            } catch (error) {
                erros++;

                console.log(
                    `ERRO | ID ${message.id} | ${
                        error.response?.status || error.message
                    }`
                );
            }
        }

        console.log("");
        console.log("========================================");
        console.log(`MENSAGENS VERIFICADAS: ${verificadas}`);
        console.log(`MENSAGENS CORRIGIDAS: ${corrigidas}`);
        console.log(`ERROS: ${erros}`);
        console.log("========================================");
        console.log("");

    } catch (error) {
        console.error("");
        console.error("ERRO GERAL:");
        console.error(error);
        console.error("");
    } finally {
        await pool.end();
    }
}

corrigir();