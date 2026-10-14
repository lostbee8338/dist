const pool = require("../config/database");

async function initializeDatabase() {
    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(30) NOT NULL DEFAULT 'agent',
                active BOOLEAN NOT NULL DEFAULT TRUE,
                department_id INTEGER REFERENCES departments(id),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150),
                phone VARCHAR(30) UNIQUE NOT NULL,
                email VARCHAR(150),
                notes TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id),
                department_id INTEGER REFERENCES departments(id),
                assigned_user_id INTEGER REFERENCES users(id),
                status VARCHAR(30) NOT NULL DEFAULT 'open',
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                external_id VARCHAR(255),
                direction VARCHAR(20) NOT NULL,
                message_type VARCHAR(30) NOT NULL DEFAULT 'text',
                content TEXT,
                sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tags (
                id SERIAL PRIMARY KEY,
                name VARCHAR(80) UNIQUE NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversation_tags (
                conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (conversation_id, tag_id)
            );
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversation_reads (
                conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                last_read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (conversation_id, user_id)
            );
        `);
        await pool.query(`
            INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
            SELECT c.id, u.id, CURRENT_TIMESTAMP
            FROM conversations c CROSS JOIN users u
            WHERE NOT EXISTS (SELECT 1 FROM conversation_reads)
            ON CONFLICT (conversation_id, user_id) DO NOTHING
        `);

        console.log("Tabelas verificadas/criadas com sucesso.");

    } catch (error) {

        console.error(
            "Erro ao inicializar banco de dados:",
            error.message
        );

        throw error;
    }
}

module.exports = initializeDatabase;