import type { NextFunction, Request, Response } from 'express';

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitRecord>();

const getClientIp = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown';
  }

  return req.ip || 'unknown';
};

export const authRateLimit = (maxAttempts: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : 'anonymous';
    const key = `${req.path}:${getClientIp(req)}:${email}`;
    const now = Date.now();
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      return next();
    }

    if (current.count >= maxAttempts) {
      return res.status(429).json({
        status: 'fail',
        message: 'Too many authentication attempts. Please try again later.',
      });
    }

    current.count += 1;
    return next();
  };
};
