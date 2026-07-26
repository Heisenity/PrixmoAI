"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const health_1 = require("../lib/health");
const cronAuth_1 = require("../lib/cronAuth");
const internal_routes_1 = require("../routes/internal.routes");
const createMockResponse = () => {
    let statusCode = 200;
    let payload = null;
    return {
        res: {
            status(code) {
                statusCode = code;
                return this;
            },
            json(value) {
                payload = value;
                return this;
            },
        },
        result: () => ({ statusCode, payload }),
    };
};
(0, node_test_1.default)('health endpoint payload is safe and healthy', async () => {
    const payload = (0, health_1.getHealthPayload)();
    strict_1.default.equal(payload.status, 'healthy');
    strict_1.default.equal(payload.service, 'prixmoai-backend');
    strict_1.default.equal(typeof payload.timestamp, 'string');
    strict_1.default.equal('environment' in payload, false);
});
(0, node_test_1.default)('cron authorization rejects missing and incorrect secrets', () => {
    strict_1.default.equal((0, cronAuth_1.isAuthorizedCronHeader)(undefined, 'expected-secret'), false);
    strict_1.default.equal((0, cronAuth_1.isAuthorizedCronHeader)('Bearer wrong-secret', 'expected-secret'), false);
    strict_1.default.equal((0, cronAuth_1.isAuthorizedCronHeader)('Basic expected-secret', 'expected-secret'), false);
});
(0, node_test_1.default)('cron authorization accepts the correct bearer secret', () => {
    strict_1.default.equal((0, cronAuth_1.isAuthorizedCronHeader)('Bearer expected-secret', 'expected-secret'), true);
    strict_1.default.equal((0, cronAuth_1.isAuthorizedCronHeader)('Bearer expected-secret', ' expected-secret\n'), true);
});
(0, node_test_1.default)('internal scheduler endpoint rejects missing credentials', async () => {
    let processed = false;
    const mock = createMockResponse();
    await (0, internal_routes_1.handleProcessScheduledPosts)({
        header: () => undefined,
        originalUrl: '/api/internal/process-scheduled-posts',
        ip: '127.0.0.1',
    }, mock.res, {
        isAuthorized: (header) => (0, cronAuth_1.isAuthorizedCronHeader)(header, 'expected-secret'),
        processScheduledPosts: async () => {
            processed = true;
            return { checked: 0, claimed: 0, recovered: 0, durationMs: 0 };
        },
    });
    const { statusCode, payload } = mock.result();
    strict_1.default.equal(statusCode, 401);
    strict_1.default.equal(payload.success, false);
    strict_1.default.equal(payload.message, 'Unauthorized');
    strict_1.default.equal(processed, false);
});
(0, node_test_1.default)('internal scheduler endpoint rejects an incorrect secret', async () => {
    let processed = false;
    const mock = createMockResponse();
    await (0, internal_routes_1.handleProcessScheduledPosts)({
        header: () => 'Bearer wrong-secret',
        originalUrl: '/api/internal/process-scheduled-posts',
        ip: '127.0.0.1',
    }, mock.res, {
        isAuthorized: (header) => (0, cronAuth_1.isAuthorizedCronHeader)(header, 'expected-secret'),
        processScheduledPosts: async () => {
            processed = true;
            return { checked: 0, claimed: 0, recovered: 0, durationMs: 0 };
        },
    });
    const { statusCode } = mock.result();
    strict_1.default.equal(statusCode, 401);
    strict_1.default.equal(processed, false);
});
(0, node_test_1.default)('internal scheduler endpoint accepts the correct secret without leaking it', async () => {
    const mock = createMockResponse();
    await (0, internal_routes_1.handleProcessScheduledPosts)({
        header: () => 'Bearer expected-secret',
        originalUrl: '/api/internal/process-scheduled-posts',
        ip: '127.0.0.1',
    }, mock.res, {
        isAuthorized: (header) => (0, cronAuth_1.isAuthorizedCronHeader)(header, 'expected-secret'),
        processScheduledPosts: async () => ({
            checked: 1,
            claimed: 1,
            recovered: 0,
            durationMs: 2,
        }),
    });
    const { statusCode, payload: responsePayload } = mock.result();
    const text = JSON.stringify(responsePayload);
    const payload = JSON.parse(text);
    strict_1.default.equal(statusCode, 200);
    strict_1.default.equal(payload.success, true);
    strict_1.default.equal(text.includes('expected-secret'), false);
});
