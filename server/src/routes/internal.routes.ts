import { Router } from 'express';
import { isAuthorizedCronHeader } from '../lib/cronAuth';
import { logFailure, logOperationalEvent } from '../lib/observability';
import { processDueScheduledPosts } from '../services/schedulerPublisher.service';

type InternalRouterOptions = {
  isAuthorized?: typeof isAuthorizedCronHeader;
  processScheduledPosts?: typeof processDueScheduledPosts;
};
type InternalSchedulerRequest = {
  header(name: string): string | undefined;
  originalUrl: string;
  ip?: string;
};
type InternalSchedulerResponse = {
  status(code: number): InternalSchedulerResponse;
  json(value: unknown): InternalSchedulerResponse;
};

export const createInternalRouter = (options: InternalRouterOptions = {}) => {
  const router = Router();

  router.post('/process-scheduled-posts', (req, res) =>
    handleProcessScheduledPosts(req, res, options)
  );

  return router;
};

export const handleProcessScheduledPosts = async (
  req: InternalSchedulerRequest,
  res: InternalSchedulerResponse,
  options: InternalRouterOptions = {}
) => {
  const isAuthorized = options.isAuthorized ?? isAuthorizedCronHeader;
  const processScheduledPosts =
    options.processScheduledPosts ?? processDueScheduledPosts;

  if (!isAuthorized(req.header('authorization'))) {
    logOperationalEvent('unauthorised_scheduler_request', {
      path: req.originalUrl,
      ip: req.ip,
    }, 'warn');
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  try {
    const result = await processScheduledPosts();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logFailure('scheduler_internal_process_failed', error, {
      path: req.originalUrl,
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to process scheduled posts',
    });
  }
};

export default createInternalRouter();
