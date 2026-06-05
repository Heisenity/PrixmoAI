import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  Wifi,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../../lib/axios';
import { useAuth } from '../../hooks/useAuth';
import { useAdminAccess } from '../../hooks/useAdminAccess';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { EmptyState } from '../../components/shared/EmptyState';

const PERMISSIONS = {
  adminAccessManage: 'admin_access:manage',
  safeActionsRun: 'safe_actions:run',
  userDebugView: 'user_debug:view',
};

type AdminGrant = {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  notes?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
};

type AdminOverview = {
  generatedAt: string;
  liveSystemStatus: Record<string, any>;
  generationHealth: Record<string, any>;
  schedulerHealth: Record<string, any>;
  socialAccountHealth: Record<string, any>;
  analyticsHealth: Record<string, any>;
  queueMonitor: Array<Record<string, any>>;
  failureAlerts: Record<string, any>;
  userImpact: Array<Record<string, any>>;
  recentEvents: Array<Record<string, any>>;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const statusClass = (status?: string | null) => {
  const normalized = status?.toLowerCase();

  if (['up', 'connected', 'ok', 'healthy'].includes(normalized ?? '')) {
    return 'admin-health-status admin-health-status--good';
  }

  if (['disabled', 'degraded', 'warning'].includes(normalized ?? '')) {
    return 'admin-health-status admin-health-status--warn';
  }

  return 'admin-health-status admin-health-status--bad';
};

const JsonPreview = ({ value }: { value: unknown }) => (
  <pre className="admin-health-json">
    {JSON.stringify(value ?? {}, null, 2)}
  </pre>
);

const toReadableAdminMessage = (value: unknown, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  if (value instanceof Error) {
    return toReadableAdminMessage(value.message, fallback);
  }

  if (typeof value === 'string') {
    return value && value !== '[object Object]' ? value : fallback;
  }

  if (Array.isArray(value)) {
    const message = value
      .map((item) => toReadableAdminMessage(item, ''))
      .filter(Boolean)
      .join(' ');

    return message || fallback;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const message = [
      toReadableAdminMessage(record.message, ''),
      toReadableAdminMessage(record.details, ''),
      toReadableAdminMessage(record.hint, ''),
      toReadableAdminMessage(record.code, ''),
    ]
      .filter(Boolean)
      .join(' ');

    if (message) {
      return message;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return fallback;
    }
  }

  return String(value);
};

const AdminNotice = ({
  value,
  fallback,
  tone = 'info',
}: {
  value: unknown;
  fallback: string;
  tone?: 'info' | 'error' | 'warning';
}) => {
  const message = toReadableAdminMessage(value, fallback);

  if (!message.trim()) {
    return null;
  }

  return (
    <div
      className={
        tone === 'error'
          ? 'error-message'
          : tone === 'warning'
            ? 'message admin-health-warning'
            : 'message'
      }
    >
      {message}
    </div>
  );
};

export const AdminHealthPage = () => {
  const { token } = useAuth();
  const {
    access,
    hasPermission,
    isAdmin,
    isLoading: isAdminAccessLoading,
  } = useAdminAccess();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [grants, setGrants] = useState<AdminGrant[]>([]);
  const [debugQuery, setDebugQuery] = useState('');
  const [debugSnapshot, setDebugSnapshot] = useState<unknown>(null);
  const [grantForm, setGrantForm] = useState({
    email: '',
    role: 'support',
    permissions: [] as string[],
    notes: '',
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [grantErrorMessage, setGrantErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionRunning, setIsActionRunning] = useState(false);

  const canManageAccess = hasPermission(PERMISSIONS.adminAccessManage);
  const canRunActions = hasPermission(PERMISSIONS.safeActionsRun);
  const canDebugUsers = hasPermission(PERMISSIONS.userDebugView);

  const loadOverview = async () => {
    if (!token || !isAdmin) {
      return;
    }

    setErrorMessage(null);
    setGrantErrorMessage(null);
    setIsLoading(true);

    try {
      try {
        const nextOverview = await apiRequest<AdminOverview>(
          '/api/admin-health/overview',
          {
            token,
          }
        );
        setOverview(nextOverview);
      } catch (error) {
        setOverview(null);
        setErrorMessage(
          toReadableAdminMessage(
            error,
            'Failed to load admin health. Apply the admin health migration and refresh.'
          )
        );
      }

      if (canManageAccess) {
        try {
          const nextGrants = await apiRequest<AdminGrant[]>(
            '/api/admin-health/grants',
            {
              token,
            }
          );
          setGrants(nextGrants);
        } catch (error) {
          setGrants([]);
          setGrantErrorMessage(
            toReadableAdminMessage(
              error,
              'Admin access grants could not be loaded yet.'
            )
          );
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminAccessLoading || !isAdmin) {
      setIsLoading(false);
      return;
    }

    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canManageAccess, isAdmin, isAdminAccessLoading]);

  const totalFailedQueueJobs = useMemo(
    () =>
      overview?.queueMonitor.reduce(
        (total, queue) => total + Number(queue.failedJobs?.length ?? 0),
        0
      ) ?? 0,
    [overview]
  );

  const runSafeAction = async (body: Record<string, unknown>) => {
    if (!token || !canRunActions) {
      return;
    }

    setIsActionRunning(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await apiRequest('/api/admin-health/actions', {
        method: 'POST',
        token,
        body,
      });
      setStatusMessage('Admin action completed.');
      await loadOverview();
    } catch (error) {
      setErrorMessage(
        toReadableAdminMessage(error, 'Admin action failed.')
      );
    } finally {
      setIsActionRunning(false);
    }
  };

  const searchUser = async () => {
    if (!token || !debugQuery.trim()) {
      return;
    }

    setIsActionRunning(true);
    setDebugSnapshot(null);
    setErrorMessage(null);

    try {
      const data = await apiRequest('/api/admin-health/user-debug', {
        token,
        query: {
          query: debugQuery.trim(),
        },
      });
      setDebugSnapshot(data);
    } catch (error) {
      setErrorMessage(
        toReadableAdminMessage(error, 'User debug lookup failed.')
      );
    } finally {
      setIsActionRunning(false);
    }
  };

  const saveGrant = async () => {
    if (!token || !canManageAccess) {
      return;
    }

    setIsActionRunning(true);
    setErrorMessage(null);

    try {
      await apiRequest('/api/admin-health/grants', {
        method: 'POST',
        token,
        body: grantForm,
      });
      setGrantForm({
        email: '',
        role: 'support',
        permissions: [],
        notes: '',
      });
      setStatusMessage('Admin permission saved.');
      await loadOverview();
    } catch (error) {
      setErrorMessage(
        toReadableAdminMessage(error, 'Failed to save permission.')
      );
    } finally {
      setIsActionRunning(false);
    }
  };

  const revokeGrant = async (grantId: string) => {
    if (!token || !canManageAccess) {
      return;
    }

    setIsActionRunning(true);
    setErrorMessage(null);

    try {
      await apiRequest(`/api/admin-health/grants/${grantId}`, {
        method: 'DELETE',
        token,
      });
      setStatusMessage('Admin permission revoked.');
      await loadOverview();
    } catch (error) {
      setErrorMessage(
        toReadableAdminMessage(error, 'Failed to revoke permission.')
      );
    } finally {
      setIsActionRunning(false);
    }
  };

  if (isLoading && !overview) {
    return <LoadingSpinner label="Loading admin health" />;
  }

  if (isAdminAccessLoading) {
    return <LoadingSpinner label="Checking admin access" />;
  }

  if (!access?.isAdmin) {
    return (
      <EmptyState
        title="Admin access required"
        description="This section is only available to the SA account or approved admin employees."
      />
    );
  }

  return (
    <div className="admin-health">
      <section className="admin-health-hero">
        <div>
          <p className="section-eyebrow">SA Control Room</p>
          <h2>System Health</h2>
          <p>
            Monitor generation, scheduler, Meta accounts, analytics, queues,
            incidents, and employee admin access from one secure place.
          </p>
        </div>
        <button
          type="button"
          className="admin-health-button admin-health-button--primary"
          onClick={() => void loadOverview()}
          disabled={isLoading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </section>

      {statusMessage ? (
        <AdminNotice
          value={statusMessage}
          fallback="Admin action completed."
        />
      ) : null}
      {errorMessage ? (
        <AdminNotice
          value={errorMessage}
          fallback="Admin health could not be loaded yet."
          tone="error"
        />
      ) : null}
      {grantErrorMessage ? (
        <AdminNotice
          value={grantErrorMessage}
          fallback="Admin access grants could not be loaded yet."
          tone="warning"
        />
      ) : null}

      {overview ? (
        <>
          <section className="admin-health-grid admin-health-grid--status">
            <article className="admin-health-card">
              <Database size={20} />
              <span>Database</span>
              <strong className={statusClass(overview.liveSystemStatus.database?.status)}>
                {overview.liveSystemStatus.database?.status ?? 'unknown'}
              </strong>
              <p>{overview.liveSystemStatus.database?.message}</p>
            </article>
            <article className="admin-health-card">
              <Wifi size={20} />
              <span>Redis / Queues</span>
              <strong className={statusClass(overview.liveSystemStatus.redis?.status)}>
                {overview.liveSystemStatus.redis?.status ?? 'unknown'}
              </strong>
              <p>{overview.liveSystemStatus.redis?.message}</p>
            </article>
            <article className="admin-health-card">
              <Activity size={20} />
              <span>Workers</span>
              <strong>{overview.liveSystemStatus.workers?.mode ?? 'unknown'}</strong>
              <p>
                Generation boot:{' '}
                {String(overview.liveSystemStatus.workers?.generationWorkersOnBoot)}
                {' '}• Background boot:{' '}
                {String(overview.liveSystemStatus.workers?.backgroundWorkersOnBoot)}
              </p>
            </article>
            <article className="admin-health-card">
              <CheckCircle2 size={20} />
              <span>Last successful job</span>
              <strong>
                {overview.liveSystemStatus.lastSuccessfulBackgroundJob?.event ??
                  'No success event yet'}
              </strong>
              <p>
                {formatDate(
                  overview.liveSystemStatus.lastSuccessfulBackgroundJob?.created_at
                )}
              </p>
            </article>
          </section>

          <section className="admin-health-grid">
            <article className="admin-health-card admin-health-card--wide">
              <h3>Generation Health</h3>
              <div className="admin-health-metrics">
                <span>{overview.generationHealth.failedEventCount} failed events</span>
                <span>{totalFailedQueueJobs} failed queue jobs</span>
                <span>{overview.generationHealth.failedProviderCalls} provider failures</span>
              </div>
              <CompactEventList events={overview.generationHealth.recentFailures} />
            </article>

            <article className="admin-health-card admin-health-card--wide">
              <h3>Scheduler Health</h3>
              <div className="admin-health-metrics">
                <span>{overview.schedulerHealth.pendingPosts} pending posts</span>
                <span>{overview.schedulerHealth.publishedPosts} published posts</span>
                <span>{overview.schedulerHealth.failedPosts} failed posts</span>
                <span>{overview.schedulerHealth.failedItems} failed items</span>
              </div>
              <CompactEventList events={overview.schedulerHealth.recentFailures} />
            </article>

            <article className="admin-health-card">
              <h3>Social Account Health</h3>
              <div className="admin-health-stack">
                <span>Verified: {overview.socialAccountHealth.verified}</span>
                <span>Expired: {overview.socialAccountHealth.expired}</span>
                <span>Revoked: {overview.socialAccountHealth.revoked}</span>
                <strong>Needs reconnect: {overview.socialAccountHealth.needsReconnect}</strong>
              </div>
            </article>

            <article className="admin-health-card">
              <h3>Analytics Health</h3>
              <div className="admin-health-stack">
                <span>Synced rows 24h: {overview.analyticsHealth.syncedRowsLast24h}</span>
                <span>Learning runs: {overview.analyticsHealth.learningRunsLast24h}</span>
                <span>Failed runs: {overview.analyticsHealth.learningRunsFailed}</span>
                <strong>Posts analyzed: {overview.analyticsHealth.postsAnalyzedLast24h}</strong>
              </div>
            </article>
          </section>

          <section className="admin-health-card">
            <div className="admin-health-section-head">
              <div>
                <h3>Queue Monitor</h3>
                <p>Waiting, active, delayed, failed, and recent failed jobs.</p>
              </div>
            </div>
            <div className="admin-health-table">
              {overview.queueMonitor.map((queue) => (
                <div className="admin-health-table-row" key={queue.queue}>
                  <strong>{queue.queue}</strong>
                  <span>Status: {queue.status}</span>
                  <span>Waiting: {queue.counts?.waiting ?? 0}</span>
                  <span>Active: {queue.counts?.active ?? 0}</span>
                  <span>Delayed: {queue.counts?.delayed ?? 0}</span>
                  <span>Failed: {queue.counts?.failed ?? 0}</span>
                </div>
              ))}
            </div>
            <FailedJobs
              queues={overview.queueMonitor}
              canRunActions={canRunActions}
              isActionRunning={isActionRunning}
              onRetry={(queue, jobId) =>
                runSafeAction({
                  action: 'retry_queue_job',
                  queue,
                  jobId,
                })
              }
            />
          </section>

          <section className="admin-health-grid">
            <article className="admin-health-card admin-health-card--wide">
              <h3>Failure Alerts</h3>
              <p>{overview.failureAlerts.spikeCount} spike alerts in the last 24 hours.</p>
              <CompactEventList events={overview.failureAlerts.recentSpikes} />
            </article>
            <article className="admin-health-card admin-health-card--wide">
              <h3>User Impact View</h3>
              <div className="admin-health-table">
                {overview.userImpact.length ? (
                  overview.userImpact.map((user) => (
                    <div className="admin-health-table-row" key={user.userId}>
                      <strong>{user.email ?? user.userId}</strong>
                      <span>{user.issueCount} issues</span>
                      <span>{user.affectedFeatures?.join(', ') || 'system'}</span>
                      <span>{user.recovered ? 'Recovered signal found' : 'Needs review'}</span>
                    </div>
                  ))
                ) : (
                  <p>No impacted users in the last 24 hours.</p>
                )}
              </div>
            </article>
          </section>

          {canDebugUsers ? (
            <section className="admin-health-card">
              <div className="admin-health-section-head">
                <div>
                  <h3>Per-user Debugging</h3>
                  <p>Search by user email or user ID. Secrets and tokens are redacted.</p>
                </div>
                <div className="admin-health-search">
                  <Search size={16} />
                  <input
                    value={debugQuery}
                    onChange={(event) => setDebugQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void searchUser();
                      }
                    }}
                    placeholder="user@email.com or user id"
                  />
                  <button
                    type="button"
                    className="admin-health-button"
                    disabled={isActionRunning || debugQuery.trim().length < 3}
                    onClick={() => void searchUser()}
                  >
                    Search
                  </button>
                </div>
              </div>
              {debugSnapshot ? (
                <div className="admin-health-debug">
                  <JsonPreview value={debugSnapshot} />
                  {canRunActions && (debugSnapshot as any)?.user?.id ? (
                    <div className="admin-health-actions">
                      <button
                        type="button"
                        className="admin-health-button"
                        disabled={isActionRunning}
                        onClick={() =>
                          runSafeAction({
                            action: 'refresh_analytics',
                            userId: (debugSnapshot as any).user.id,
                          })
                        }
                      >
                        Refresh analytics
                      </button>
                      <button
                        type="button"
                        className="admin-health-button"
                        disabled={isActionRunning}
                        onClick={() =>
                          runSafeAction({
                            action: 'clear_user_cache',
                            userId: (debugSnapshot as any).user.id,
                          })
                        }
                      >
                        Clear user cache
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="admin-health-card">
            <h3>Recent Operational Events</h3>
            <CompactEventList
              events={overview.recentEvents}
              canMarkReviewed={canRunActions}
              isActionRunning={isActionRunning}
              onMarkReviewed={(eventId) =>
                runSafeAction({
                  action: 'mark_event_reviewed',
                  eventId,
                })
              }
            />
          </section>
        </>
      ) : (
        <section className="admin-health-card admin-health-card--setup">
          <h3>Health data is not loaded yet</h3>
          <p>
            This dashboard becomes useful after the admin health migration is
            applied and the backend can read the health-event tables.
          </p>
          <div className="admin-health-metrics">
            <span>System status</span>
            <span>Failed jobs</span>
            <span>Queue monitor</span>
            <span>Meta issues</span>
            <span>User impact</span>
          </div>
          <button
            type="button"
            className="admin-health-button"
            onClick={() => void loadOverview()}
            disabled={isLoading}
          >
            Try loading again
          </button>
        </section>
      )}

      {canManageAccess ? (
        <section className="admin-health-card">
          <div className="admin-health-section-head">
            <div>
              <h3>Admin Access Control</h3>
              <p>Give employees limited access without making them the main SA owner.</p>
            </div>
          </div>
          <div className="admin-health-grant-form">
            <input
              value={grantForm.email}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              placeholder="employee@email.com"
            />
            <select
              value={grantForm.role}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  role: event.target.value,
                  permissions: [],
                }))
              }
            >
              <option value="admin2">Admin 2</option>
              <option value="support">Support</option>
              <option value="analytics">Analytics</option>
              <option value="readonly">Read only</option>
              <option value="custom">Custom</option>
            </select>
            <input
              value={grantForm.notes}
              onChange={(event) =>
                setGrantForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder="Internal note"
            />
            <button
              type="button"
              className="admin-health-button admin-health-button--primary"
              disabled={isActionRunning || !grantForm.email.trim()}
              onClick={() => void saveGrant()}
            >
              Save access
            </button>
          </div>
          {grantForm.role === 'custom' ? (
            <div className="admin-health-permissions">
              {access?.allPermissions.map((permission) => (
                <label key={permission}>
                  <input
                    type="checkbox"
                    checked={grantForm.permissions.includes(permission)}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        permissions: event.target.checked
                          ? [...current.permissions, permission]
                          : current.permissions.filter((item) => item !== permission),
                      }))
                    }
                  />
                  {permission}
                </label>
              ))}
            </div>
          ) : null}

          <div className="admin-health-table">
            {grants.map((grant) => (
              <div className="admin-health-table-row" key={grant.id}>
                <strong>{grant.email}</strong>
                <span>{grant.role}</span>
                <span>{grant.revoked_at ? 'Revoked' : 'Active'}</span>
                <span>{formatDate(grant.created_at)}</span>
                {!grant.revoked_at ? (
                  <button
                    type="button"
                    className="admin-health-button admin-health-button--danger"
                    disabled={isActionRunning}
                    onClick={() => void revokeGrant(grant.id)}
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const CompactEventList = ({
  events,
  canMarkReviewed = false,
  isActionRunning = false,
  onMarkReviewed,
}: {
  events: Array<Record<string, any>>;
  canMarkReviewed?: boolean;
  isActionRunning?: boolean;
  onMarkReviewed?: (eventId: string) => void;
}) => {
  if (!events?.length) {
    return <p className="admin-health-muted">No recent events.</p>;
  }

  return (
    <div className="admin-health-event-list">
      {events.slice(0, 12).map((event) => {
        const Icon =
          event.level === 'error'
            ? XCircle
            : event.level === 'warn'
              ? AlertTriangle
              : CheckCircle2;

        return (
          <div className="admin-health-event" key={event.id ?? `${event.event}-${event.created_at}`}>
            <Icon size={16} />
            <div>
              <strong>{event.event}</strong>
              <span>
                {event.queue || event.provider || event.platform || 'system'} •{' '}
                {formatDate(event.created_at)}
              </span>
            </div>
            {canMarkReviewed && event.id && !event.reviewed_at ? (
              <button
                type="button"
                className="admin-health-button admin-health-button--tiny"
                disabled={isActionRunning}
                onClick={() => onMarkReviewed?.(event.id)}
              >
                Reviewed
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const FailedJobs = ({
  queues,
  canRunActions,
  isActionRunning,
  onRetry,
}: {
  queues: Array<Record<string, any>>;
  canRunActions: boolean;
  isActionRunning: boolean;
  onRetry: (queue: string, jobId: string) => void;
}) => {
  const failedJobs = queues.flatMap((queue) =>
    (queue.failedJobs ?? []).map((job: Record<string, any>) => ({
      ...job,
      queue: queue.queue,
    }))
  );

  if (!failedJobs.length) {
    return <p className="admin-health-muted">No failed queue jobs retained right now.</p>;
  }

  return (
    <div className="admin-health-failed-jobs">
      {failedJobs.map((job) => (
        <div className="admin-health-failed-job" key={`${job.queue}-${job.id}`}>
          <div>
            <strong>{job.queue}</strong>
            <span>Job {job.id} • attempts {job.attemptsMade}</span>
            <p>{job.failedReason || 'No failure reason saved.'}</p>
          </div>
          {canRunActions ? (
            <button
              type="button"
              className="admin-health-button"
              disabled={isActionRunning || !job.id}
              onClick={() => onRetry(String(job.queue), String(job.id))}
            >
              Retry
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
};
