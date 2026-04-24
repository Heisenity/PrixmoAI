"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const errorHandler_middleware_1 = require("./middleware/errorHandler.middleware");
const billing_controller_1 = require("./controllers/billing.controller");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const billing_routes_1 = __importDefault(require("./routes/billing.routes"));
const content_routes_1 = __importDefault(require("./routes/content.routes"));
const generate_routes_1 = __importDefault(require("./routes/generate.routes"));
const image_routes_1 = __importDefault(require("./routes/image.routes"));
const runtime_routes_1 = __importDefault(require("./routes/runtime.routes"));
const scheduler_routes_1 = __importDefault(require("./routes/scheduler.routes"));
const constants_1 = require("./config/constants");
const analyticsSync_service_1 = require("./services/analyticsSync.service");
const contentGenerationQueue_service_1 = require("./services/contentGenerationQueue.service");
const imageGenerationQueue_service_1 = require("./services/imageGenerationQueue.service");
const schedulerPublisher_service_1 = require("./services/schedulerPublisher.service");
const timezone_1 = require("./lib/timezone");
const package_json_1 = require("../package.json");
const redis_1 = require("./lib/redis");
const app = (0, express_1.default)();
const PORT = constants_1.APP_PORT;
// 1. Security Headers
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.post('/api/billing/webhook', express_1.default.raw({ type: 'application/json' }), billing_controller_1.handleRazorpayWebhook);
app.use(express_1.default.json({ limit: '80mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '80mb' }));
app.get('/', (req, res) => {
    res.status(200).json({
        message: "Welcome to the API",
        version: package_json_1.version
    });
});
// 2. Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: "UP",
        message: "Server is healthy and running",
        timestamp: (0, timezone_1.formatIstTimestamp)(),
        environment: process.env.NODE_ENV || 'development'
    });
});
app.use('/api/auth', auth_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
app.use('/api/content', content_routes_1.default);
app.use('/api/generate', generate_routes_1.default);
app.use('/api/images', image_routes_1.default);
app.use('/api/runtime', runtime_routes_1.default);
app.use('/api/scheduler', scheduler_routes_1.default);
app.use((req, _res, next) => {
    const error = new Error(`Route not found: ${req.originalUrl}`);
    error.statusCode = 404;
    error.status = 'fail';
    next(error);
});
app.use(errorHandler_middleware_1.errorHandler);
// Start Server
app.listen(PORT, () => {
    console.log(`🚀 [${(0, timezone_1.formatIstTimestamp)()}] Server running at http://localhost:${PORT}`);
    console.log(`✅ [${(0, timezone_1.formatIstTimestamp)()}] Check health at http://localhost:${PORT}/health`);
    if (constants_1.START_GENERATION_WORKERS_ON_BOOT) {
        (0, contentGenerationQueue_service_1.startContentGenerationWorker)();
        (0, imageGenerationQueue_service_1.startImageGenerationWorker)();
    }
    if (constants_1.START_BACKGROUND_WORKERS_ON_BOOT) {
        (0, schedulerPublisher_service_1.startSchedulerPublisherWorker)();
        (0, analyticsSync_service_1.startAnalyticsSyncWorker)();
    }
    if (!redis_1.isRedisConfigured) {
        console.warn('[runtime] Redis-backed queues are disabled because REDIS_URL is missing.');
    }
    else {
        console.log(`[runtime] Redis is configured. Low-command mode is ${constants_1.LOW_REDIS_COMMAND_MODE ? 'on' : 'off'}.`);
        if (!constants_1.START_GENERATION_WORKERS_ON_BOOT) {
            console.log('[runtime] Generation workers will wake only when jobs are submitted.');
        }
        if (!constants_1.START_BACKGROUND_WORKERS_ON_BOOT) {
            console.log('[runtime] Background workers will wake only when app actions enqueue work.');
        }
    }
    if (!constants_1.isMetaOAuthConfigured) {
        console.warn('[runtime] Meta-dependent background jobs are idle until Meta OAuth credentials are configured.');
    }
});
