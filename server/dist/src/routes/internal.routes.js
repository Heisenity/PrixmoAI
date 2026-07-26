"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleProcessScheduledPosts = exports.createInternalRouter = void 0;
const express_1 = require("express");
const cronAuth_1 = require("../lib/cronAuth");
const observability_1 = require("../lib/observability");
const schedulerPublisher_service_1 = require("../services/schedulerPublisher.service");
const createInternalRouter = (options = {}) => {
    const router = (0, express_1.Router)();
    router.post('/process-scheduled-posts', (req, res) => (0, exports.handleProcessScheduledPosts)(req, res, options));
    return router;
};
exports.createInternalRouter = createInternalRouter;
const handleProcessScheduledPosts = async (req, res, options = {}) => {
    const isAuthorized = options.isAuthorized ?? cronAuth_1.isAuthorizedCronHeader;
    const processScheduledPosts = options.processScheduledPosts ?? schedulerPublisher_service_1.processDueScheduledPosts;
    if (!isAuthorized(req.header('authorization'))) {
        (0, observability_1.logOperationalEvent)('unauthorised_scheduler_request', {
            path: req.originalUrl,
            ip: req.ip,
        }, 'warn');
        return res.status(401).json({
            success: false,
            message: 'Unauthorized',
        });
    }
    try {
        const result = await processScheduledPosts();
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        (0, observability_1.logFailure)('scheduler_internal_process_failed', error, {
            path: req.originalUrl,
        });
        return res.status(500).json({
            success: false,
            message: 'Failed to process scheduled posts',
        });
    }
};
exports.handleProcessScheduledPosts = handleProcessScheduledPosts;
exports.default = (0, exports.createInternalRouter)();
