import { NextFunction, Request, Response } from "express";

export const enforceContentGenerationLimit = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user as any;

  if (!user?.id) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }


//plan-limit request flow

  const usedCount = user.usedCount || 0;
  const maxLimit = user.maxLimit || 5;

  if (usedCount >= maxLimit) {
    res.status(403).json({
      success: false,
      message: "Plan limit reached",
    });
    return;
  }

  next();
};
