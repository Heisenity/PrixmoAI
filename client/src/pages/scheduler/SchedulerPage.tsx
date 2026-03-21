import { CalendarClock, Link2, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConnectAccountButton } from '../../components/scheduler/ConnectAccountButton';
import { PostCard } from '../../components/scheduler/PostCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Card } from '../../components/ui/card';
import { useScheduler } from '../../hooks/useScheduler';

export const SchedulerPage = () => {
  const scheduler = useScheduler();
  const defaultDateTime = useMemo(() => {
    const next = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const tzOffset = next.getTimezoneOffset() * 60000;
    return new Date(next.getTime() - tzOffset).toISOString().slice(0, 16);
  }, []);
  const [accountForm, setAccountForm] = useState({
    platform: 'instagram',
    accountId: 'ig_demo_account',
    accountName: 'PrixmoAI Demo',
  });
  const [postForm, setPostForm] = useState({
    socialAccountId: '',
    platform: 'instagram',
    caption: 'Testing scheduled post from the new frontend',
    mediaUrl: '',
    scheduledFor: defaultDateTime,
  });

  useEffect(() => {
    if (!scheduler.accounts?.items.length) {
      return;
    }

    setPostForm((current) =>
      current.socialAccountId
        ? current
        : { ...current, socialAccountId: scheduler.accounts?.items[0]?.id || '' }
    );
  }, [scheduler.accounts]);

  const submitAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await scheduler.createAccount(accountForm);
    setPostForm((current) => ({
      ...current,
      socialAccountId: created?.id || current.socialAccountId,
      platform: created?.platform || current.platform,
    }));
  };

  const submitPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await scheduler.createPost({
      ...postForm,
      scheduledFor: new Date(postForm.scheduledFor).toISOString(),
    });
  };

  const connectedAccounts = scheduler.accounts?.items ?? [];
  const queuedPosts = scheduler.posts?.items ?? [];

  return (
    <div className="page-stack">
      <ErrorMessage message={scheduler.error} />

      <Card className="app-hero-card">
        <div className="app-hero-card__copy">
          <p className="section-eyebrow">Publishing queue</p>
          <h2>Stage social delivery before real Meta publishing goes live.</h2>
          <p>
            Connect account records, queue scheduled posts, and keep the release calendar
            clean while the publishing integrations stay behind the scenes.
          </p>
        </div>
        <div className="app-hero-card__stats">
          <div className="app-hero-card__metric">
            <span>Connected accounts</span>
            <strong>{connectedAccounts.length}</strong>
            <small>Instagram or Facebook</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Queued posts</span>
            <strong>{queuedPosts.length}</strong>
            <small>Active scheduler records</small>
          </div>
          <div className="app-hero-card__metric">
            <span>Scheduler state</span>
            <strong>{scheduler.isBusy ? 'Syncing' : 'Ready'}</strong>
            <small>Forms and queue are available</small>
          </div>
        </div>
      </Card>

      <div className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Accounts</p>
              <h3>Connect a social account record</h3>
            </div>
          </div>
          <form className="form-grid" onSubmit={submitAccount}>
            <Select
              label="Platform"
              value={accountForm.platform}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, platform: event.target.value }))
              }
            >
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </Select>
            <Input
              label="Account ID"
              value={accountForm.accountId}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, accountId: event.target.value }))
              }
              placeholder="ig_business_001"
            />
            <Input
              label="Account name"
              value={accountForm.accountName}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, accountName: event.target.value }))
              }
              placeholder="PrixmoAI Main Instagram"
            />
            <div className="field field--full">
              <ConnectAccountButton
                icon={<Link2 size={16} />}
                label={scheduler.isBusy ? 'Connecting...' : 'Connect account'}
                disabled={scheduler.isBusy}
              />
            </div>
          </form>

          <div className="stack-list">
            {connectedAccounts.length ? (
              connectedAccounts.map((account) => (
                <div key={account.id} className="stack-list__item stack-list__item--inline">
                  <strong>{account.accountName || account.accountId}</strong>
                  <span>{account.platform}</span>
                </div>
              ))
            ) : (
              <EmptyState
                title="No accounts connected yet"
                description="Create the first social account record here and the scheduler will immediately unlock the post form."
              />
            )}
          </div>
        </Card>

        <Card className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="section-eyebrow">Queue post</p>
              <h3>Create a scheduled post</h3>
            </div>
          </div>
          <form className="form-grid" onSubmit={submitPost}>
            <Select
              label="Social account"
              value={postForm.socialAccountId}
              onChange={(event) =>
                setPostForm((current) => ({
                  ...current,
                  socialAccountId: event.target.value,
                }))
              }
            >
              <option value="">Select an account</option>
              {connectedAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName || account.accountId}
                </option>
              ))}
            </Select>
            <Input
              label="Media URL"
              value={postForm.mediaUrl}
              onChange={(event) =>
                setPostForm((current) => ({ ...current, mediaUrl: event.target.value }))
              }
              placeholder="https://..."
            />
            <label className="field field--full">
              <span className="field__label">Caption</span>
              <textarea
                className="field__control field__control--textarea"
                rows={4}
                value={postForm.caption}
                onChange={(event) =>
                  setPostForm((current) => ({ ...current, caption: event.target.value }))
                }
              />
            </label>
            <Input
              label="Scheduled for"
              type="datetime-local"
              value={postForm.scheduledFor}
              onChange={(event) =>
                setPostForm((current) => ({
                  ...current,
                  scheduledFor: event.target.value,
                }))
              }
            />
            <div className="field field--full">
              <ConnectAccountButton
                icon={<Send size={16} />}
                label={scheduler.isBusy ? 'Scheduling...' : 'Create scheduled post'}
                disabled={scheduler.isBusy || !postForm.socialAccountId || !postForm.scheduledFor}
              />
            </div>
          </form>
        </Card>
      </div>

      <Card className="dashboard-panel">
        <div className="dashboard-panel__header">
          <div>
            <p className="section-eyebrow">Scheduled posts</p>
            <h3>Queue state</h3>
          </div>
        </div>
        {queuedPosts.length ? (
          <div className="page-stack">
            {queuedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onStatusChange={(status) => {
                  void scheduler.updateStatus(post.id, status);
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No scheduled posts yet"
            description="Create the first post and the queue will start to feel real."
          />
        )}
      </Card>
    </div>
  );
};
