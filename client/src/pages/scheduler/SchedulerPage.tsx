import { useState } from 'react';
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
    scheduledFor: '',
  });

  const submitAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await scheduler.createAccount(accountForm);
  };

  const submitPost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await scheduler.createPost(postForm);
  };

  return (
    <div className="page-stack">
      <ErrorMessage message={scheduler.error} />

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
            />
            <Input
              label="Account name"
              value={accountForm.accountName}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, accountName: event.target.value }))
              }
            />
            <div className="field field--full">
              <ConnectAccountButton disabled={scheduler.isLoading} />
            </div>
          </form>
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
              {scheduler.accounts?.items.map((account) => (
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
                  scheduledFor: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : '',
                }))
              }
            />
            <div className="field field--full">
              <ConnectAccountButton disabled={scheduler.isLoading} />
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
        {scheduler.posts?.items.length ? (
          <div className="page-stack">
            {scheduler.posts.items.map((post) => (
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
