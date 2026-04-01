import { cn } from '../../lib/utils';
import type { ScheduledPostStatus } from '../../types';

const STATUS_LABELS: Record<ScheduledPostStatus, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  published: 'Published',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const QueueStatusBadge = ({
  status,
  className,
}: {
  status: ScheduledPostStatus;
  className?: string;
}) => (
  <span
    className={cn('queue-status-badge', `queue-status-badge--${status}`, className)}
  >
    {STATUS_LABELS[status]}
  </span>
);
