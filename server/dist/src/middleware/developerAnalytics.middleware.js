"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.developerAnalyticsMiddleware = void 0;
const developerAnalyticsMiddleware = (req, res, next) => {
    const internalKey = process.env.DEVELOPER_ANALYTICS_KEY;
    if (!internalKey) {
        return res.status(503).json({
            status: 'error',
            message: 'Developer analytics is not configured. Set DEVELOPER_ANALYTICS_KEY.',
        });
    }
    const headerValue = req.headers['x-developer-analytics-key'];
    const providedKey = typeof headerValue === 'string'
        ? headerValue
        : Array.isArray(headerValue)
            ? headerValue[0]
            : null;
    if (!providedKey || providedKey !== internalKey) {
        return res.status(403).json({
            status: 'fail',
            message: 'Forbidden',
        });
    }
    return next();
};
exports.developerAnalyticsMiddleware = developerAnalyticsMiddleware;
