const jwt = require("jsonwebtoken");
const pool = require("../config/database");

async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                status: "error",
                message: "Token de autenticação não informado"
            });
        }

        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                status: "error",
                message: "Formato de autenticação inválido"
            });
        }

        const decoded = jwt.verify(parts[1], process.env.JWT_SECRET);
        const userId = Number(decoded.userId);

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({
                status: "error",
                message: "Token inválido"
            });
        }

        // Revalida a conta no banco em cada requisição: alterações de papel,
        // departamento ou status passam a valer sem depender do token antigo.
        const result = await pool.query(
            `SELECT id, name, email, role, active, department_id
             FROM users
             WHERE id = $1
             LIMIT 1`,
            [userId]
        );

        if (!result.rows.length || !result.rows[0].active) {
            return res.status(401).json({
                status: "error",
                message: "Usuário inexistente ou desativado"
            });
        }

        const user = result.rows[0];
        req.user = {
            userId: user.id,
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            active: user.active,
            department_id: user.department_id
        };

        return next();
    } catch (error) {
        if (error.name !== "JsonWebTokenError" && error.name !== "TokenExpiredError") {
            console.error("Erro ao validar autenticação:", error.message);
            return res.status(500).json({
                status: "error",
                message: "Não foi possível validar a autenticação"
            });
        }

        return res.status(401).json({
            status: "error",
            message: "Token inválido ou expirado"
        });
    }
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({
            status: "error",
            message: "Apenas administradores podem realizar esta operação"
        });
    }
    return next();
}

module.exports = authenticateToken;
module.exports.requireAdmin = requireAdmin;
