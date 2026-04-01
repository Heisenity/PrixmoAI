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
const scheduler_routes_1 = __importDefault(require("./routes/scheduler.routes"));
const constants_1 = require("./config/constants");
const schedulerPublisher_service_1 = require("./services/schedulerPublisher.service");
const package_json_1 = require("../package.json");
const app = (0, express_1.default)();
const PORT = constants_1.APP_PORT;
// 1. Security Headers
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.post('/api/billing/webhook', express_1.default.raw({ type: 'application/json' }), billing_controller_1.handleRazorpayWebhook);
app.use(express_1.default.json({ limit: '12mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '12mb' }));
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
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});
app.use('/api/auth', auth_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/billing', billing_routes_1.default);
app.use('/api/content', content_routes_1.default);
app.use('/api/generate', generate_routes_1.default);
app.use('/api/images', image_routes_1.default);
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
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`✅ Check health at http://localhost:${PORT}/health`);
    (0, schedulerPublisher_service_1.startSchedulerPublisherWorker)();
});
