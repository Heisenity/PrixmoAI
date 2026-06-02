"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const observability_1 = require("../lib/observability");
const errorHandler = (error, req, res, _next) => {
    const statusCode = error.statusCode || 500;
    const status = error.status || (statusCode >= 500 ? 'error' : 'fail');
    if (statusCode >= 500) {
        (0, observability_1.logFailure)('http_request_failed', error, {
            method: req.method,
            path: req.originalUrl,
            statusCode,
        });
    }
    return res.status(statusCode).json({
        status,
        message: error.message || 'Internal server error',
    });
};
exports.errorHandler = errorHandler;
