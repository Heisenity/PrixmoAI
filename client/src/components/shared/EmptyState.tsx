import type { ReactNode } from 'react';

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="empty-state">
    <div className="empty-state__glow" />
    <h3>{title}</h3>
    <p>{description}</p>
    {action ? <div className="empty-state__action">{action}</div> : null}
  </div>
);
