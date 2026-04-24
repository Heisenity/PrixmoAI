"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLowCommandWorkerOptions = void 0;
const constants_1 = require("../config/constants");
const getLowCommandWorkerOptions = () => ({
    drainDelay: Math.max(1, constants_1.BULLMQ_WORKER_DRAIN_DELAY_SECONDS),
    stalledInterval: Math.max(1000, constants_1.BULLMQ_WORKER_STALLED_INTERVAL_MS),
});
exports.getLowCommandWorkerOptions = getLowCommandWorkerOptions;
