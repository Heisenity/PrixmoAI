"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserDebug = exports.runAdminAction = exports.deleteAdminGrant = exports.saveAdminGrant = exports.getAdminGrants = exports.getAdminHealth = exports.getMyAdminAccess = void 0;
const adminHealth_service_1 = require("../services/adminHealth.service");
const getActorUserId = (req) => {
    if (!req.user?.id) {
        throw new Error('Unauthorized');
    }
    return req.user.id;
};
const getMyAdminAccess = async (req, res) => {
    if (!req.user?.id || !req.adminAccess) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    return res.status(200).json({
        status: 'success',
        data: await (0, adminHealth_service_1.getAdminAccessSummary)(req.user, req.adminAccess),
    });
};
exports.getMyAdminAccess = getMyAdminAccess;
const getAdminHealth = async (_req, res) => {
    try {
        const data = await (0, adminHealth_service_1.getAdminHealthOverview)();
        return res.status(200).json({
            status: 'success',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to load admin system health.',
        });
    }
};
exports.getAdminHealth = getAdminHealth;
const getAdminGrants = async (_req, res) => {
    try {
        const data = await (0, adminHealth_service_1.listAdminAccessGrants)();
        return res.status(200).json({
            status: 'success',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to load admin access grants.',
        });
    }
};
exports.getAdminGrants = getAdminGrants;
const saveAdminGrant = async (req, res) => {
    try {
        const data = await (0, adminHealth_service_1.upsertAdminAccessGrant)(getActorUserId(req), req.body);
        return res.status(200).json({
            status: 'success',
            message: 'Admin access saved.',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to save admin access.',
        });
    }
};
exports.saveAdminGrant = saveAdminGrant;
const deleteAdminGrant = async (req, res) => {
    try {
        const data = await (0, adminHealth_service_1.revokeAdminAccessGrant)(getActorUserId(req), req.params.grantId);
        return res.status(200).json({
            status: 'success',
            message: 'Admin access revoked.',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to revoke admin access.',
        });
    }
};
exports.deleteAdminGrant = deleteAdminGrant;
const runAdminAction = async (req, res) => {
    try {
        const data = await (0, adminHealth_service_1.runAdminSafeAction)(getActorUserId(req), req.body);
        return res.status(200).json({
            status: 'success',
            message: 'Admin action completed.',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Admin action failed.',
        });
    }
};
exports.runAdminAction = runAdminAction;
const getUserDebug = async (req, res) => {
    try {
        const data = await (0, adminHealth_service_1.getAdminUserDebugSnapshot)(req.query.query);
        if (!data) {
            return res.status(404).json({
                status: 'fail',
                message: 'No user found for that email or user ID.',
            });
        }
        return res.status(200).json({
            status: 'success',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error
                ? error.message
                : 'Failed to load user debug snapshot.',
        });
    }
};
exports.getUserDebug = getUserDebug;
