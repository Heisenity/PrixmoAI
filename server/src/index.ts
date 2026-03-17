import express from "express";
import helmet from "helmet";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler.middleware";
import authRouter from "./routes/auth.routes";
import { version } from '../package.json';


const app = express();
const PORT = process.env.PORT || 5000;

// 1. Security Headers
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
