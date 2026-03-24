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
import schedulerRouter from "./routes/scheduler.routes";
import { APP_PORT } from "./config/constants";
import { getClientAppUrl } from "./db/supabase";
import { version } from '../package.json';


const app = express();
const PORT = APP_PORT;

// 1. Security Headers
app.use(helmet());
app.set('trust proxy', 1);
app.use(
  cors({
    origin: (_origin, callback) => {
      try {
        callback(null, getClientAppUrl());
      } catch {
        callback(null, true);
      }
    },
    credentials: true,
  })
);
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  handleRazorpayWebhook
);
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

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
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use('/api/auth', authRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/content', contentRouter);
app.use('/api/generate', generateRouter);
app.use('/api/images', imageRouter);
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
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`✅ Check health at http://localhost:${PORT}/health`);
});
