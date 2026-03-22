import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { session, isInitializing, isConfigured, updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      if (password.length < 8) {
        throw new Error('Use a password with at least 8 characters.');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match yet.');
      }

      await updatePassword(password);
      await signOut();
      navigate('/login', {
        replace: true,
        state: {
          authNotice:
            'Password updated successfully. Sign in again with your new password.',
        },
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to update password'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="screen-center">
        <LoadingSpinner label="Preparing secure reset flow" />
      </div>
    );
  }

  if (!session) {
    return (
      <AuthLayout
        eyebrow="Recovery link required"
        title="Open this page from your password reset email."
        description="For security, password changes only work from the signed recovery link we send to your inbox."
        highlights={[
          'Use the latest reset email',
          'Links can expire',
          'Request a fresh reset if needed',
        ]}
      >
        <div className="auth-form-shell">
          <div className="auth-form-shell__header">
            <div>
              <p className="section-eyebrow">Invalid or expired session</p>
              <h2>Request a new reset link</h2>
            </div>
            <Link className="auth-form-shell__switch" to="/forgot-password">
              Go to recovery
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="message">
            This password change page only works after you click the secure link from your
            email.
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Secure password reset"
      title="Choose a fresh password for your workspace."
      description="Create a new password, then sign back in normally. This recovery session is temporary and only exists because you opened the email link."
      highlights={[
        'At least 8 characters',
        'Use something unique',
        'You will sign in again after updating it',
      ]}
    >
      <div className="auth-form-shell">
        <div className="auth-form-shell__header">
          <div>
            <p className="section-eyebrow">Reset password</p>
            <h2>Set new password</h2>
          </div>
          <Link className="auth-form-shell__switch" to="/login">
            Back to sign in
            <ArrowRight size={16} />
          </Link>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter the new password"
            autoComplete="new-password"
            minLength={8}
            required
          />

          {!isConfigured ? (
            <ErrorMessage message="Client Supabase env is missing. Add the variables from client/.env.example first." />
          ) : null}
          <ErrorMessage message={error} />
          {success ? <div className="message">{success}</div> : null}

          <Button type="submit" size="lg" disabled={!isConfigured || isSubmitting}>
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
};
