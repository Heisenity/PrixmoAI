"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRequestCancellation = exports.throwIfRequestCancelled = exports.isRequestCancelledError = exports.isAbortError = exports.RequestCancelledError = void 0;
const DEFAULT_REQUEST_CANCELLED_MESSAGE = 'Request cancelled by user.';
class RequestCancelledError extends Error {
    constructor(message = DEFAULT_REQUEST_CANCELLED_MESSAGE) {
        super(message);
        this.name = 'RequestCancelledError';
    }
}
exports.RequestCancelledError = RequestCancelledError;
const isAbortError = (error) => error instanceof Error && error.name === 'AbortError';
exports.isAbortError = isAbortError;
const isRequestCancelledError = (error) => error instanceof RequestCancelledError;
exports.isRequestCancelledError = isRequestCancelledError;
const throwIfRequestCancelled = (signal, message = DEFAULT_REQUEST_CANCELLED_MESSAGE) => {
    if (signal?.aborted) {
        throw new RequestCancelledError(message);
    }
};
exports.throwIfRequestCancelled = throwIfRequestCancelled;
const createRequestCancellation = (req, res) => {
    const controller = new AbortController();
    const abort = () => {
        if (!controller.signal.aborted) {
            controller.abort();
        }
    };
    const handleAborted = () => {
        abort();
    };
    const handleClosed = () => {
        if (!res.writableEnded) {
            abort();
        }
    };
    req.once('aborted', handleAborted);
    res.once('close', handleClosed);
    return {
        signal: controller.signal,
        cleanup: () => {
            req.off('aborted', handleAborted);
            res.off('close', handleClosed);
        },
    };
};
exports.createRequestCancellation = createRequestCancellation;
