"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (error, _req, res, _next) => {
    const statusCode = error.statusCode || 500;
    const status = error.status || (statusCode >= 500 ? 'error' : 'fail');
    return res.status(statusCode).json({
        status,
        message: error.message || 'Internal server error',
    });
};
exports.errorHandler = errorHandler;
