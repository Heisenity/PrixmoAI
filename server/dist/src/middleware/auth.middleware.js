"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const supabase_1 = require("../db/supabase");
const authMiddleware = async (req, res, next) => {
    if (!supabase_1.supabaseAuth) {
        return res.status(503).json({
            status: 'error',
            error: 'Supabase is not configured',
            message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env',
        });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: 'fail',
            error: 'No token provided',
        });
    }
    const token = authHeader.split(' ')[1];
    req.accessToken = token;
    try {
        const { data: { user }, error, } = await supabase_1.supabaseAuth.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({
                status: 'fail',
                error: 'Invalid or expired token',
            });
        }
        req.user = user;
        return next();
    }
    catch (_error) {
        return res.status(401).json({
            status: 'fail',
            error: 'Authentication failed',
        });
    }
};
exports.authMiddleware = authMiddleware;
