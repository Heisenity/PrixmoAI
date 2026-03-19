//content generation request flow
import { Router } from "express";
import {
  generateContent,
  getContentHistory,
  deleteContentHistory,
} from "../controllers/content.controller";

import { enforceContentGenerationLimit } from "../middleware/planLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { contentGenerationSchema } from "../schemas/content.schema";

// Content API Docs
// POST /generate
// Body: topic, platform, tone, format, length
// Flow: validate -> plan limit -> generateContent
//
// GET /history
// Flow: getContentHistory
//
// DELETE /history
// Flow: deleteContentHistory
const router = Router();

router.post(
  "/generate",
  validate(contentGenerationSchema),
  enforceContentGenerationLimit,
  generateContent
);

router.get("/history", getContentHistory);

export default router;


//content history flow

router.get("/history", getContentHistory);

//delete content history flow

router.delete("/history", deleteContentHistory);

//plan-limit request flow
router.post(
  "/generate",
  validate(contentGenerationSchema),
  enforceContentGenerationLimit,
  generateContent
);
