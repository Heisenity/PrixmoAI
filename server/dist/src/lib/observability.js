"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordFailureSpikeSignal = exports.logFailure = exports.logOperationalEvent = void 0;
const requestContext_1 = require("./requestContext");
const constants_1 = require("../config/constants");
const FAILURE_WINDOW_MS = 5 * 60000;
const failureTimestampsByKey = new Map();
const alertCooldownUntilByKey = new Map();
const serializeError = (error) => {
    if (!error) {
        return null;
    }
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
        };
    }
    return {
        message: String(error),
    };
};
const logOperationalEvent = (event, payload = {}, level = 'info') => {
    const requestContext = (0, requestContext_1.getCurrentRequestContext)();
    const entry = {
        event,
        requestId: requestContext?.requestId ?? null,
        userId: payload.userId ?? requestContext?.authenticatedUserId ?? null,
        plan: payload.plan ?? requestContext?.superAdminTestPlan ?? null,
        timestamp: new Date().toISOString(),
        ...payload,
    };
    const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    logger(`[observability] ${event}`, entry);
};
exports.logOperationalEvent = logOperationalEvent;
const logFailure = (event, error, payload = {}, level = 'error') => {
    (0, exports.logOperationalEvent)(event, {
        ...payload,
        error: serializeError(error),
    }, level);
};
exports.logFailure = logFailure;
const sendAlert = (payload) => {
    if (!constants_1.OBSERVABILITY_ALERT_WEBHOOK_URL) {
        return;
    }
    void fetch(constants_1.OBSERVABILITY_ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            source: 'prixmoai',
            timestamp: new Date().toISOString(),
            ...payload,
        }),
    }).catch((error) => {
        console.warn('[observability] alert delivery failed', {
            error: error instanceof Error ? error.message : String(error),
        });
    });
};
const recordFailureSpikeSignal = (key, payload = {}, options = {}) => {
    const now = Date.now();
    const windowMs = options.windowMs ?? constants_1.OBSERVABILITY_ALERT_WINDOW_MS ?? FAILURE_WINDOW_MS;
    const threshold = options.threshold ?? constants_1.OBSERVABILITY_ALERT_FAILURE_THRESHOLD ?? 5;
    const recent = (failureTimestampsByKey.get(key) ?? []).filter((timestamp) => now - timestamp <= windowMs);
    recent.push(now);
    failureTimestampsByKey.set(key, recent);
    if (recent.length < threshold) {
        return;
    }
    const cooldownUntil = alertCooldownUntilByKey.get(key) ?? 0;
    if (cooldownUntil > now) {
        return;
    }
    alertCooldownUntilByKey.set(key, now + windowMs);
    (0, exports.logOperationalEvent)('failure_spike_detected', {
        ...payload,
        signalKey: key,
        count: recent.length,
        windowMs,
    }, 'warn');
    sendAlert({
        event: 'failure_spike_detected',
        ...payload,
        signalKey: key,
        count: recent.length,
        windowMs,
    });
};
exports.recordFailureSpikeSignal = recordFailureSpikeSignal;
