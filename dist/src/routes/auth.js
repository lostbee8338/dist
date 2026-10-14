const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");

const router = express.Router();

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: "error",
                message: "E-mail e senha são obrigatórios"
            });
        }

        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                password_hash,
                role,
                active,
                department_id
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [email.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                status: "error",
                message: "E-mail ou senha inválidos"
            });
        }

        const user = result.rows[0];

        if (!user.active) {
            return res.status(403).json({
                status: "error",
                message: "Usuário desativado"
            });
        }

        const passwordValid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordValid) {
            return res.status(401).json({
                status: "error",
                message: "E-mail ou senha inválidos"
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h"
            }
        );

        res.json({
            status: "success",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                active: user.active,
                department_id: user.department_id
            }
        });

    } catch (error) {
        console.error(
            "Erro no login:",
            error.message
        );

        res.status(500).json({
            status: "error",
            message: "Não foi possível realizar o login"
        });
    }
});

module.exports = router;