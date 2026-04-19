import express from "express";
import helmet from "helmet";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler.middleware";
import { handleRazorpayWebhook } from "./controllers/billing.controller";
import authRouter from "./routes/auth.routes";
import analyticsRouter from "./routes/analytics.routes";
import billingRouter from "./routes/billing.routes";
import contentRouter from "./routes/content.routes";
import generateRouter from "./routes/generate.routes";
import imageRouter from "./routes/image.routes";
import runtimeRouter from "./routes/runtime.routes";
import schedulerRouter from "./routes/scheduler.routes";
import {
  APP_PORT,
  LOW_REDIS_COMMAND_MODE,
  START_BACKGROUND_WORKERS_ON_BOOT,
  START_GENERATION_WORKERS_ON_BOOT,
  isMetaOAuthConfigured,
} from "./config/constants";
import { startAnalyticsSyncWorker } from './services/analyticsSync.service';
import { startContentGenerationWorker } from './services/contentGenerationQueue.service';
import { startImageGenerationWorker } from './services/imageGenerationQueue.service';
import { startSchedulerPublisherWorker } from './services/schedulerPublisher.service';
import { formatIstTimestamp } from './lib/timezone';
import { version } from '../package.json';
import { isRedisConfigured } from './lib/redis';


const app = express();
const PORT = APP_PORT;

// 1. Security Headers
app.use(helmet());
app.use(cors());
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  handleRazorpayWebhook
);
app.use(express.json({ limit: '80mb' }));
app.use(express.urlencoded({ extended: true, limit: '80mb' }));

app.get('/', (req, res) => {
  res.status(200).json({
    message: "Welcome to the API",
    version: version
  });
});

// 2. Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: "UP",
    message: "Server is healthy and running",
    timestamp: formatIstTimestamp(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth', authRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/content', contentRouter);
app.use('/api/generate', generateRouter);
app.use('/api/images', imageRouter);
app.use('/api/runtime', runtimeRouter);
app.use('/api/scheduler', schedulerRouter);

app.use((req, _res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`) as Error & {
    statusCode?: number;
    status?: string;
  };

  error.statusCode = 404;
  error.status = 'fail';
  next(error);
});

app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 [${formatIstTimestamp()}] Server running at http://localhost:${PORT}`);
  console.log(`✅ [${formatIstTimestamp()}] Check health at http://localhost:${PORT}/health`);
  if (START_GENERATION_WORKERS_ON_BOOT) {
    startContentGenerationWorker();
    startImageGenerationWorker();
  }
  if (START_BACKGROUND_WORKERS_ON_BOOT) {
    startSchedulerPublisherWorker();
    startAnalyticsSyncWorker();
  }
  if (!isRedisConfigured) {
    console.warn(
      '[runtime] Redis-backed queues are disabled because REDIS_URL is missing.'
    );
  } else {
    console.log(
      `[runtime] Redis is configured. Low-command mode is ${
        LOW_REDIS_COMMAND_MODE ? 'on' : 'off'
      }.`
    );
    if (!START_GENERATION_WORKERS_ON_BOOT) {
      console.log('[runtime] Generation workers will wake only when jobs are submitted.');
    }
    if (!START_BACKGROUND_WORKERS_ON_BOOT) {
      console.log('[runtime] Background workers will wake only when app actions enqueue work.');
    }
  }
  if (!isMetaOAuthConfigured) {
    console.warn(
      '[runtime] Meta-dependent background jobs are idle until Meta OAuth credentials are configured.'
    );
  }
});
