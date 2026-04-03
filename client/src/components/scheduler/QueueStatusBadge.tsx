import { cn } from '../../lib/utils';
import type { ScheduledItemStatus, ScheduledPostStatus } from '../../types';

const STATUS_LABELS: Record<ScheduledPostStatus | ScheduledItemStatus, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const QueueStatusBadge = ({
  status,
  className,
}: {
  status: ScheduledPostStatus | ScheduledItemStatus;
  className?: string;
}) => (
  <span
    className={cn('queue-status-badge', `queue-status-badge--${status}`, className)}
  >
    {STATUS_LABELS[status]}
  </span>
);
