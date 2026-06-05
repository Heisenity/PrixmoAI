"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAccessMiddleware = void 0;
const adminAccess_1 = require("../lib/adminAccess");
const adminAccessMiddleware = (requiredPermission) => async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const access = await (0, adminAccess_1.resolveAdminAccessForUser)(req.user);
        if (!access.isAdmin) {
            return res.status(403).json({
                status: 'fail',
                message: 'Admin access is required.',
            });
        }
        if (requiredPermission && !(0, adminAccess_1.hasAdminPermission)(access, requiredPermission)) {
            return res.status(403).json({
                status: 'fail',
                message: 'You do not have permission to use this admin feature.',
            });
        }
        req.adminAccess = access;
        return next();
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to verify admin access.',
        });
    }
};
exports.adminAccessMiddleware = adminAccessMiddleware;
