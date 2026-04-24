"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelJobRuntime = exports.getJobRuntime = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const jobRuntime_service_1 = require("../services/jobRuntime.service");
const runtimeQueues = new Map();
const getRuntimeQueue = (queueName) => {
    const existingQueue = runtimeQueues.get(queueName);
    if (existingQueue) {
        return existingQueue;
    }
    const nextQueue = new bullmq_1.Queue(queueName, (0, redis_1.getBullMqConfig)(`prixmoai:runtime:${queueName}`));
    runtimeQueues.set(queueName, nextQueue);
    return nextQueue;
};
const cancelPendingQueueJob = async (jobId, queueName) => {
    const queue = getRuntimeQueue(queueName);
    const job = await bullmq_1.Job.fromId(queue, jobId);
    if (!job) {
        return;
    }
    const state = await job.getState();
    if (state === 'waiting' ||
        state === 'delayed' ||
        state === 'prioritized') {
        await job.remove();
    }
};
const getJobRuntime = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const snapshot = await (0, jobRuntime_service_1.getJobRuntimeSnapshot)(req.params.id);
        if (!snapshot || snapshot.userId !== req.user.id) {
            return res.status(404).json({
                status: 'fail',
                message: 'Job not found',
            });
        }
        return res.status(200).json({
            status: 'success',
            data: snapshot,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to fetch job status',
        });
    }
};
exports.getJobRuntime = getJobRuntime;
const cancelJobRuntime = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            status: 'fail',
            message: 'Unauthorized',
        });
    }
    try {
        const snapshot = await (0, jobRuntime_service_1.getJobRuntimeSnapshot)(req.params.id);
        if (!snapshot || snapshot.userId !== req.user.id) {
            return res.status(404).json({
                status: 'fail',
                message: 'Job not found',
            });
        }
        if (snapshot.status === 'completed' ||
            snapshot.status === 'failed' ||
            snapshot.status === 'cancelled') {
            return res.status(200).json({
                status: 'success',
                message: 'Job is already finished',
                data: snapshot,
            });
        }
        await (0, jobRuntime_service_1.requestJobCancellation)(req.params.id);
        await cancelPendingQueueJob(req.params.id, snapshot.queue);
        const nextSnapshot = await (0, jobRuntime_service_1.getJobRuntimeSnapshot)(req.params.id);
        return res.status(200).json({
            status: 'success',
            message: 'Job cancellation requested successfully',
            data: nextSnapshot ?? snapshot,
        });
    }
    catch (error) {
        return res.status(500).json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to cancel job',
        });
    }
};
exports.cancelJobRuntime = cancelJobRuntime;
