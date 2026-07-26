"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHealthPayload = void 0;
const getHealthPayload = () => ({
    status: 'healthy',
    service: 'prixmoai-backend',
    timestamp: new Date().toISOString(),
});
exports.getHealthPayload = getHealthPayload;
