import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import { ApiRequestError, apiRequest } from '../../lib/axios';
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

const FRIENDLY_EVENT_NAMES: Record<string, string> = {
  analytics_learning_completed: 'Learning updated',
  analytics_learning_job_enqueued: 'Learning update started',
  analytics_learning_job_failed: 'Learning update failed',
  analytics_learning_worker_failed: 'Learning service stopped',
  analytics_sync_completed: 'Analytics updated',
  analytics_sync_job_failed: 'Analytics update failed',
  analytics_sync_worker_failed: 'Analytics service stopped',
  analytics_account_sync_failed: 'Account analytics could not update',
  content_generation_job_completed: 'Content created',
  content_generation_job_failed: 'Content creation failed',
  content_generation_worker_failed: 'Content service stopped',
  image_generation_job_completed: 'Image created',
  image_generation_job_failed: 'Image creation failed',
  image_generation_worker_failed: 'Image service stopped',
  scheduler_publish_completed: 'Post published',
  scheduler_publish_failed: 'Post could not be published',
  scheduler_publish_worker_failed: 'Publishing service stopped',
  scheduler_analytics_sync_enqueue_failed: 'Post analytics update could not start',
  failure_spike_detected: 'Several failures detected',
};

const FRIENDLY_EVENT_DESCRIPTIONS: Record<string, string> = {
  analytics_learning_completed:
    'PrixmoAI finished learning from the latest analytics.',
  analytics_learning_job_enqueued:
    'A new learning update was added and is waiting to be processed.',
  analytics_learning_job_failed:
    'PrixmoAI could not finish the learning update.',
  analytics_learning_worker_failed:
    'The service that updates recommendations stopped unexpectedly.',
  analytics_sync_completed:
    'The latest social analytics were collected successfully.',
  analytics_sync_job_failed:
    'The latest social analytics could not be collected.',
  analytics_sync_worker_failed:
    'The analytics update service stopped unexpectedly.',
  analytics_account_sync_failed:
    'Analytics could not be updated for a connected social account.',
  content_generation_job_completed:
    'The requested content was created successfully.',
  content_generation_job_failed:
    'The requested content could not be created.',
  content_generation_worker_failed:
    'The content creation service stopped unexpectedly.',
  image_generation_job_completed:
    'The requested image was created successfully.',
  image_generation_job_failed:
    'The requested image could not be created.',
  image_generation_worker_failed:
    'The image creation service stopped unexpectedly.',
  scheduler_publish_completed:
    'A scheduled post was published successfully.',
  scheduler_publish_failed:
    'A scheduled post could not be published.',
  scheduler_publish_worker_failed:
    'The publishing service stopped unexpectedly.',
  scheduler_analytics_sync_enqueue_failed:
    'The system could not start the analytics update for a published post.',
  failure_spike_detected:
    'More failures than usual were detected and should be checked.',
};

const FRIENDLY_AREAS: Record<string, string> = {
  'content.generate': 'Content creation',
  'image.generate': 'Image creation',
  'video.generate': 'Video creation',
  'scheduler.publish': 'Post publishing',
  'analytics.sync.user': 'Analytics update',
  'analytics.learning.user': 'Recommendation learning',
  meta: 'Meta connection',
  instagram: 'Instagram',
  facebook: 'Facebook',
  system: 'System',
};

const FRIENDLY_PERMISSIONS: Record<string, string> = {
  'system_health:view': 'View system health',
  'admin_access:manage': 'Manage employee access',
  'social_health:view': 'View connected account health',
  'analytics_health:view': 'View analytics health',
  'safe_actions:run': 'Run safe recovery actions',
  'user_debug:view': 'Check individual user accounts',
};

const FRIENDLY_ROLES: Record<string, string> = {
  admin2: 'Full admin',
  support: 'Customer support',
  analytics: 'Analytics only',
  readonly: 'View only',
  custom: 'Custom access',
};

const friendlyWords = (value?: string | null) => {
  if (!value) {
    return 'System activity';
  }

  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const friendlyEventName = (event?: string | null) =>
  FRIENDLY_EVENT_NAMES[event ?? ''] ?? friendlyWords(event);

const friendlyEventDescription = (event?: string | null) =>
  FRIENDLY_EVENT_DESCRIPTIONS[event ?? ''] ??
  'The system recorded this activity for your review.';

const friendlyAreaName = (value?: string | null) =>
  FRIENDLY_AREAS[value ?? ''] ?? friendlyWords(value);

const friendlyStatus = (value?: string | null) => {
  const normalized = value?.toLowerCase();

  if (['up', 'connected', 'ok', 'healthy'].includes(normalized ?? '')) {
    return 'Working';
  }

  if (['disabled', 'degraded', 'warning'].includes(normalized ?? '')) {
    return 'Needs attention';
  }

  if (['error', 'failed', 'down'].includes(normalized ?? '')) {
    return 'Not working';
  }

  return friendlyWords(value ?? 'Checking');
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
      toReadableAdminMessage(record.error, ''),
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
  const { getAccessToken, token } = useAuth();
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
  const [dismissedImpactUsers, setDismissedImpactUsers] = useState<Set<string>>(
    () => new Set()
  );
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

  const resolveAdminToken = async (forceRefresh = false) => {
    const freshToken = await getAccessToken({ forceRefresh });

    if (!freshToken) {
      throw new Error('Please sign in again to load admin health.');
    }

    return freshToken;
  };

  const adminRequest = async <T,>(
    path: string,
    options: Parameters<typeof apiRequest<T>>[1] = {}
  ) => {
    const firstToken = await resolveAdminToken();

    try {
      return await apiRequest<T>(path, {
        ...options,
        token: firstToken,
      });
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 401) {
        throw error;
      }

      const retryToken = await resolveAdminToken(true);

      return apiRequest<T>(path, {
        ...options,
        token: retryToken,
      });
    }
  };

  const loadOverview = async () => {
    if (!token || !isAdmin) {
      return;
    }

    setErrorMessage(null);
    setGrantErrorMessage(null);
    setIsLoading(true);

    try {
      try {
        const nextOverview = await adminRequest<AdminOverview>(
          '/api/admin-health/overview'
        );
        setOverview(nextOverview);
        setDismissedImpactUsers(new Set());
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
          const nextGrants = await adminRequest<AdminGrant[]>(
            '/api/admin-health/grants'
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
      await adminRequest('/api/admin-health/actions', {
        method: 'POST',
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
      const data = await adminRequest('/api/admin-health/user-debug', {
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

  const clearUserDebug = () => {
    setDebugQuery('');
    setDebugSnapshot(null);
    setStatusMessage(null);
  };

  const visibleImpactedUsers =
    overview?.userImpact.filter(
      (user) => !dismissedImpactUsers.has(String(user.userId))
    ) ?? [];

  const saveGrant = async () => {
    if (!token || !canManageAccess) {
      return;
    }

    setIsActionRunning(true);
    setErrorMessage(null);

    try {
      await adminRequest('/api/admin-health/grants', {
        method: 'POST',
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
      await adminRequest(`/api/admin-health/grants/${grantId}`, {
        method: 'DELETE',
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
            See what is working, what needs attention, and which users may be
            affected.
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
              <span>Data storage</span>
              <strong className={statusClass(overview.liveSystemStatus.database?.status)}>
                {friendlyStatus(overview.liveSystemStatus.database?.status)}
              </strong>
              <p>Your app can read and save data.</p>
            </article>
            <article className="admin-health-card">
              <Wifi size={20} />
              <span>Background tasks</span>
              <strong className={statusClass(overview.liveSystemStatus.redis?.status)}>
                {friendlyStatus(overview.liveSystemStatus.redis?.status)}
              </strong>
              <p>Waiting jobs can be stored and processed.</p>
            </article>
            <article className="admin-health-card">
              <Activity size={20} />
              <span>Task processing</span>
              <strong>
                {overview.liveSystemStatus.workers?.mode === 'on-demand'
                  ? 'Starts when needed'
                  : 'Always ready'}
              </strong>
              <p>
                Content, publishing, and analytics tasks run automatically.
              </p>
            </article>
            <article className="admin-health-card admin-health-card--last-job">
              <CheckCircle2 size={20} />
              <span>Latest completed task</span>
              <strong title={overview.liveSystemStatus.lastSuccessfulBackgroundJob?.event}>
                {overview.liveSystemStatus.lastSuccessfulBackgroundJob?.event
                  ? friendlyEventName(
                      overview.liveSystemStatus.lastSuccessfulBackgroundJob.event
                    )
                  : 'Nothing completed yet'}
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
              <h3>Content and image creation</h3>
              <div className="admin-health-metrics">
                <span>{overview.generationHealth.failedEventCount} recent problems</span>
                <span>{totalFailedQueueJobs} tasks could not finish</span>
                <span>{overview.generationHealth.failedProviderCalls} service problems</span>
              </div>
              <CompactEventList events={overview.generationHealth.recentFailures} />
            </article>

            <article className="admin-health-card admin-health-card--wide">
              <h3>Scheduled publishing</h3>
              <div className="admin-health-metrics">
                <span>{overview.schedulerHealth.pendingPosts} posts waiting</span>
                <span>{overview.schedulerHealth.publishedPosts} published posts</span>
                <span>{overview.schedulerHealth.failedPosts} posts need attention</span>
                <span>{overview.schedulerHealth.failedItems} media items need attention</span>
              </div>
              <CompactEventList events={overview.schedulerHealth.recentFailures} />
            </article>

            <article className="admin-health-card">
              <h3>Connected social accounts</h3>
              <div className="admin-health-stack">
                <span>Working: {overview.socialAccountHealth.verified}</span>
                <span>Connection expired: {overview.socialAccountHealth.expired}</span>
                <span>Access removed: {overview.socialAccountHealth.revoked}</span>
                <strong>Reconnect needed: {overview.socialAccountHealth.needsReconnect}</strong>
              </div>
            </article>

            <article className="admin-health-card">
              <h3>Analytics updates</h3>
              <div className="admin-health-stack">
                <span>Updates received today: {overview.analyticsHealth.syncedRowsLast24h}</span>
                <span>Learning updates today: {overview.analyticsHealth.learningRunsLast24h}</span>
                <span>Updates needing attention: {overview.analyticsHealth.learningRunsFailed}</span>
                <strong>Posts checked today: {overview.analyticsHealth.postsAnalyzedLast24h}</strong>
              </div>
            </article>
          </section>

          <section className="admin-health-card">
            <div className="admin-health-section-head">
              <div>
                <h3>Background work</h3>
                <p>See which tasks are waiting, running, delayed, or need attention.</p>
              </div>
            </div>
            <div className="admin-health-table">
              {overview.queueMonitor.map((queue) => (
                <div className="admin-health-table-row admin-health-table-row--queue" key={queue.queue}>
                  <strong title={queue.queue}>{friendlyAreaName(queue.queue)}</strong>
                  <span>Connection: {friendlyStatus(queue.status)}</span>
                  <span>Waiting: {queue.counts?.waiting ?? 0}</span>
                  <span>Running: {queue.counts?.active ?? 0}</span>
                  <span>Delayed: {queue.counts?.delayed ?? 0}</span>
                  <span>Needs attention: {queue.counts?.failed ?? 0}</span>
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
              <h3>Important alerts</h3>
              <p>
                {overview.failureAlerts.spikeCount
                  ? `${overview.failureAlerts.spikeCount} unusual failure alerts in the last 24 hours.`
                  : 'No unusual rise in failures during the last 24 hours.'}
              </p>
              <CompactEventList events={overview.failureAlerts.recentSpikes} />
            </article>
            <article className="admin-health-card admin-health-card--wide">
              <h3>Users needing attention</h3>
              <p>Users who recently experienced a warning or failure.</p>
              <div className="admin-health-table admin-health-impact-list">
                {visibleImpactedUsers.length ? (
                  visibleImpactedUsers.map((user) => (
                    <div className="admin-health-impact-row" key={user.userId}>
                      <div className="admin-health-impact-copy">
                        <strong>{user.email ?? 'User account'}</strong>
                        <span>
                          {user.issueCount} {user.issueCount === 1 ? 'problem' : 'problems'} found
                        </span>
                        <span>
                          Affected area:{' '}
                          {(user.affectedFeatures ?? [])
                            .map((feature: string) => friendlyAreaName(feature))
                            .join(', ') || 'General system'}
                        </span>
                      </div>
                      <span
                        className={
                          user.recovered
                            ? 'admin-health-status admin-health-status--good'
                            : 'admin-health-status admin-health-status--warn'
                        }
                      >
                        {user.recovered ? 'Working again' : 'Please review'}
                      </span>
                      <button
                        type="button"
                        className="admin-health-icon-button"
                        aria-label={`Remove ${user.email ?? 'user'} from this view`}
                        title="Remove from this view"
                        onClick={() =>
                          setDismissedImpactUsers((current) => {
                            const next = new Set(current);
                            next.add(String(user.userId));
                            return next;
                          })
                        }
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p>No users currently need attention in this view.</p>
                )}
              </div>
            </article>
          </section>

          {canDebugUsers ? (
            <section className="admin-health-card">
              <div className="admin-health-section-head">
                <div>
                  <h3>Check one user</h3>
                  <p>Search by email or user ID to review that account safely.</p>
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
                  {debugQuery || debugSnapshot ? (
                    <button
                      type="button"
                      className="admin-health-icon-button"
                      aria-label="Clear user search"
                      title="Clear user search"
                      onClick={clearUserDebug}
                    >
                      <X size={17} />
                    </button>
                  ) : null}
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
                  <div className="admin-health-debug-head">
                    <div>
                      <strong>User details loaded</strong>
                      <span>Private tokens and passwords are hidden.</span>
                    </div>
                    <button
                      type="button"
                      className="admin-health-button admin-health-button--tiny"
                      onClick={clearUserDebug}
                    >
                      <X size={15} />
                      Close
                    </button>
                  </div>
                  <UserDebugSummary value={debugSnapshot} />
                  <details className="admin-health-technical-details">
                    <summary>Show technical details</summary>
                    <JsonPreview value={debugSnapshot} />
                  </details>
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
            <h3>Recent system activity</h3>
            <p>Recent updates and problems recorded by PrixmoAI.</p>
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
            System information is not available yet. Refresh after the backend
            and database are ready.
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
                  {FRIENDLY_PERMISSIONS[permission] ?? friendlyWords(permission)}
                </label>
              ))}
            </div>
          ) : null}

          <div className="admin-health-table">
            {grants.length ? (
              grants.map((grant) => (
                <div className="admin-health-table-row" key={grant.id}>
                  <strong>{grant.email}</strong>
                  <span>{FRIENDLY_ROLES[grant.role] ?? friendlyWords(grant.role)}</span>
                  <span>{grant.revoked_at ? 'Access removed' : 'Access active'}</span>
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
              ))
            ) : (
              <p className="admin-health-muted">
                No employee admin access has been added yet.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const UserDebugSummary = ({ value }: { value: unknown }) => {
  const snapshot =
    value && typeof value === 'object'
      ? (value as Record<string, any>)
      : {};
  const user =
    snapshot.user && typeof snapshot.user === 'object'
      ? snapshot.user
      : {};
  const count = (key: string) =>
    Array.isArray(snapshot[key]) ? snapshot[key].length : 0;
  const currentSubscription = Array.isArray(snapshot.subscriptions)
    ? snapshot.subscriptions[0]
    : null;

  return (
    <div className="admin-health-user-summary">
      <div className="admin-health-user-summary__identity">
        <div>
          <span>User</span>
          <strong>{user.email ?? 'Email not available'}</strong>
        </div>
        <div>
          <span>Last signed in</span>
          <strong>{formatDate(user.lastSignInAt)}</strong>
        </div>
        <div>
          <span>Current plan</span>
          <strong>
            {friendlyWords(
              currentSubscription?.plan ??
                currentSubscription?.tier ??
                currentSubscription?.status ??
                'Not available'
            )}
          </strong>
        </div>
      </div>
      <div className="admin-health-user-summary__counts">
        <span>{count('generatedContent')} content items</span>
        <span>{count('generatedImages')} images</span>
        <span>{count('socialAccounts')} connected accounts</span>
        <span>{count('scheduledPosts')} scheduled posts</span>
        <span>{count('analytics')} analytics records</span>
        <span>{count('learningRuns')} learning updates</span>
        <span>{count('healthEvents')} recent system events</span>
      </div>
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
        const area = event.queue || event.provider || event.platform || 'system';

        return (
          <div className="admin-health-event" key={event.id ?? `${event.event}-${event.created_at}`}>
            <Icon size={16} />
            <div className="admin-health-event__copy">
              <strong title={event.event}>{friendlyEventName(event.event)}</strong>
              <p>{friendlyEventDescription(event.event)}</p>
              <span>
                {friendlyAreaName(area)} •{' '}
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
                Mark checked
              </button>
            ) : event.reviewed_at ? (
              <span className="admin-health-checked">Checked</span>
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
    return <p className="admin-health-muted">No unfinished background tasks need attention.</p>;
  }

  return (
    <div className="admin-health-failed-jobs">
      {failedJobs.map((job) => (
        <div className="admin-health-failed-job" key={`${job.queue}-${job.id}`}>
          <div>
            <strong title={job.queue}>{friendlyAreaName(job.queue)}</strong>
            <span>
              Tried {Number(job.attemptsMade ?? 0)}{' '}
              {Number(job.attemptsMade ?? 0) === 1 ? 'time' : 'times'}
            </span>
            <p>{job.failedReason || 'No explanation was saved for this problem.'}</p>
          </div>
          {canRunActions ? (
            <button
              type="button"
              className="admin-health-button"
              disabled={isActionRunning || !job.id}
              onClick={() => onRetry(String(job.queue), String(job.id))}
            >
              Try again
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
};
