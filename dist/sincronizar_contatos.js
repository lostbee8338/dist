const fs = require("fs");
const { execFileSync } = require("child_process");
const { Client } = require("pg");

const atendimentoDb = new Client({
    host: "localhost",
    port: 5432,
    database: "atendimento",
    user: "atendimento",
    password: "atendimento123"
});

const SQL_FILE = "C:\\whatsapp-atendimento\\backend\\consulta_contatos_sync.sql";

function nomeValido(nome) {
    if (!nome) return false;

    const valor = String(nome).trim();

    if (!valor) return false;

    if (!/[A-Za-zÀ-ÿ0-9]/.test(valor)) return false;

    if (valor === "." || valor === ".." || valor === "...") {
        return false;
    }

    return true;
}

function extrairTelefone(remoteJid) {
    if (!remoteJid) return null;

    if (!remoteJid.endsWith("@s.whatsapp.net")) {
        return null;
    }

    const telefone = remoteJid.replace("@s.whatsapp.net", "");

    if (!/^\d+$/.test(telefone)) {
        return null;
    }

    return telefone;
}

function carregarContatosEvolution() {
    const sql = `
SELECT
    c."remoteJid",
    COALESCE(c."pushName", '') AS contact_name,
    COALESCE(ch."name", '') AS chat_name
FROM public."Contact" c
LEFT JOIN public."Chat" ch
    ON ch."remoteJid" = c."remoteJid"
    AND ch."instanceId" = c."instanceId"
WHERE c."instanceId" = '0893f0e7-09f2-4229-b9eb-8d08d4d477f3'
  AND c."remoteJid" LIKE '%@s.whatsapp.net'
ORDER BY c."remoteJid";
`;

    fs.writeFileSync(SQL_FILE, sql, "utf8");

    const sqlConteudo = fs.readFileSync(SQL_FILE, "utf8");

    const resultado = execFileSync(
        "docker",
        [
            "exec",
            "-i",
            "evolution_postgres",
            "psql",
            "-U",
            "postgres",
            "-d",
            "evolution",
            "-t",
            "-A",
            "-F",
            "|"
        ],
        {
            input: sqlConteudo,
            encoding: "utf8"
        }
    );

    return resultado
        .split(/\r?\n/)
        .filter(Boolean)
        .map((linha) => {
            const partes = linha.split("|");

            return {
                remoteJid: partes[0] || "",
                contact_name: partes[1] || "",
                chat_name: partes.slice(2).join("|") || ""
            };
        });
}

async function executar() {
    console.log("Iniciando sincronização de contatos...");

    let contatos;

    try {
        contatos = carregarContatosEvolution();
    } catch (error) {
        console.error("Erro ao consultar contatos da Evolution:");
        console.error(error.message);
        process.exit(1);
    }

    console.log(
        `Contatos encontrados na Evolution: ${contatos.length}`
    );

    await atendimentoDb.connect();

    try {
        let criados = 0;
        let atualizados = 0;
        let preservados = 0;
        let ignorados = 0;

        const nomesConfirmados = {
            "5521980262528": "Matheus RH",
            "5527999167453": "Raquel",
            "5527993124914": "Geovana"
        };

        for (const contato of contatos) {
            const telefone = extrairTelefone(contato.remoteJid);

            if (!telefone) {
                ignorados++;
                continue;
            }

            let nome = "";

            if (nomesConfirmados[telefone]) {
                nome = nomesConfirmados[telefone];
            } else if (nomeValido(contato.chat_name)) {
                nome = contato.chat_name.trim();
            } else if (nomeValido(contato.contact_name)) {
                nome = contato.contact_name.trim();
            }

            if (!nomeValido(nome)) {
                ignorados++;
                continue;
            }

            const existente = await atendimentoDb.query(
                `SELECT id, name
                 FROM customers
                 WHERE phone = $1
                 LIMIT 1`,
                [telefone]
            );

            if (existente.rows.length === 0) {
                await atendimentoDb.query(
                    `INSERT INTO customers (name, phone)
                     VALUES ($1, $2)
                     ON CONFLICT (phone) DO NOTHING`,
                    [nome, telefone]
                );

                criados++;
                continue;
            }

            const nomeAtual = existente.rows[0].name
                ? String(existente.rows[0].name).trim()
                : "";

            if (nomesConfirmados[telefone]) {
                if (nomeAtual !== nome) {
                    await atendimentoDb.query(
                        `UPDATE customers
                         SET name = $1,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE phone = $2`,
                        [nome, telefone]
                    );

                    atualizados++;
                } else {
                    preservados++;
                }

                continue;
            }

            if (nomeValido(nomeAtual)) {
                preservados++;
                continue;
            }

            await atendimentoDb.query(
                `UPDATE customers
                 SET name = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE phone = $2`,
                [nome, telefone]
            );

            atualizados++;
        }

        console.log("");
        console.log("===== SINCRONIZAÇÃO CONCLUÍDA =====");
        console.log(`Contatos da Evolution: ${contatos.length}`);
        console.log(`Novos clientes criados: ${criados}`);
        console.log(`Clientes atualizados: ${atualizados}`);
        console.log(`Nomes preservados: ${preservados}`);
        console.log(`Contatos ignorados: ${ignorados}`);
        console.log("===================================");

        const resumo = await atendimentoDb.query(`
            SELECT id, name, phone
            FROM customers
            ORDER BY id
        `);

        console.log("");
        console.log("Clientes atualmente no sistema:");
        console.table(resumo.rows);

    } finally {
        await atendimentoDb.end();
    }
}

executar().catch((error) => {
    console.error("Erro na sincronização:", error);
    process.exit(1);
});