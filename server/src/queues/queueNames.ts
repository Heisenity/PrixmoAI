export const QUEUE_NAMES = {
  contentGenerate: 'content.generate',
  imageGenerate: 'image.generate',
  schedulerPublish: 'scheduler.publish',
  analyticsSyncUser: 'analytics.sync.user',
  videoGenerate: 'video.generate',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
