import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthProviderButton } from '../../components/auth/AuthProviderButton';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

export const SignupPage = () => {
  const location = useLocation();
  const { session, profile, signUp, signInWithOAuth, isConfigured, isInitializing } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | 'facebook' | null>(
    null
  );

  const notice = (location.state as { authNotice?: string } | null)?.authNotice;
  const destination = profile?.fullName && profile?.phoneNumber ? '/app/dashboard' : '/onboarding';

  if (session) {
    return (
      <Navigate
        to={destination}
        replace
        state={{
          authNotice: "You're already signed in. We moved you to the next step in your workspace.",
        }}
      />
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      await signUp(email, password);
      setSuccess('Account created. If email confirmation is enabled, confirm it before signing in.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github' | 'facebook') => {
    setError(null);
    setSuccess(null);
    setOauthPending(provider);

    try {
      await signInWithOAuth(provider);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to start social sign-up'
      );
    } finally {
      setOauthPending(null);
    }
  };

  return (
    <AuthLayout
      eyebrow="Start system"
      title="Create your workspace and start shipping faster."
      description="Set up the account that holds your brand voice, generation history, images, analytics, and publishing queue."
      highlights={['Free plan available', 'No credit card to begin', 'Google, GitHub, and Facebook ready']}
    >
      <div className="auth-form-shell">
        <div className="auth-form-shell__header">
          <div>
            <p className="section-eyebrow">Create account</p>
            <h2>Start your PrixmoAI workspace</h2>
          </div>
          <Link className="auth-form-shell__switch" to="/login">
            Already have access?
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="auth-provider-grid">
          <AuthProviderButton
            provider="google"
            label="Sign up with Google"
            busy={oauthPending === 'google'}
            disabled={!isConfigured || isInitializing || isSubmitting || oauthPending !== null}
            onClick={() => {
              void handleOAuth('google');
            }}
          />
          <AuthProviderButton
            provider="github"
            label="Sign up with GitHub"
            busy={oauthPending === 'github'}
            disabled={!isConfigured || isInitializing || isSubmitting || oauthPending !== null}
            onClick={() => {
              void handleOAuth('github');
            }}
          />
          <AuthProviderButton
            provider="facebook"
            label="Sign up with Facebook"
            busy={oauthPending === 'facebook'}
            disabled={!isConfigured || isInitializing || isSubmitting || oauthPending !== null}
            onClick={() => {
              void handleOAuth('facebook');
            }}
          />
        </div>

        <div className="auth-divider">
          <span>or create with email</span>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
        {notice ? <div className="message">{notice}</div> : null}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@brand.com"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          required
        />

        {!isConfigured ? (
          <ErrorMessage message="Client Supabase env is missing. Add the variables from client/.env.example first." />
        ) : null}
        <ErrorMessage message={error} />
        {success ? <div className="message">{success}</div> : null}

        <Button type="submit" size="lg" disabled={!isConfigured || isSubmitting || isInitializing}>
          {isSubmitting ? 'Creating workspace...' : 'Create account'}
        </Button>
        {isInitializing ? <LoadingSpinner label="Checking session" /> : null}

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
        </form>
      </div>
    </AuthLayout>
  );
};
