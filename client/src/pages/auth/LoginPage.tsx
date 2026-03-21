import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthProviderButton } from '../../components/auth/AuthProviderButton';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

export const LoginPage = () => {
  const location = useLocation();
  const { session, profile, signIn, signInWithOAuth, isConfigured, isInitializing } = useAuth();
  const [email, setEmail] = useState('test@prixmoai.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | 'facebook' | null>(
    null
  );

  const notice = (location.state as { from?: string; authNotice?: string } | null)?.authNotice;
  const destination =
    (location.state as { from?: string } | null)?.from ||
    (profile?.fullName && profile?.phoneNumber ? '/app/dashboard' : '/onboarding');

  if (session) {
    return (
      <Navigate
        to={destination}
        replace
        state={{
          authNotice: "You're already signed in. Pick up where you left off.",
        }}
      />
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to sign in');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github' | 'facebook') => {
    setError(null);
    setOauthPending(provider);

    try {
      await signInWithOAuth(provider);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to start social sign-in'
      );
    } finally {
      setOauthPending(null);
    }
  };

  return (
    <AuthLayout
      eyebrow="Access workspace"
      title="Sign in and get straight back to production."
      description="Access your brand memory, active generations, scheduler queue, and analytics without losing context."
      highlights={['Gemini text generation', 'Pixazo image generation', 'Scheduler + analytics']}
      aside={
        <div className="auth-aside-stack">
          <Card className="auth-shell__aside-card auth-shell__aside-card--feature">
            <strong>What opens after sign in</strong>
            <p>Generate content, create product visuals, schedule posts, and track what performs from one workspace.</p>
          </Card>
          <Card className="auth-shell__aside-card">
            <strong>Environment check</strong>
            <p>Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` available in the client env for auth to work correctly.</p>
          </Card>
        </div>
      }
    >
      <div className="auth-form-shell">
        <div className="auth-form-shell__header">
          <div>
            <p className="section-eyebrow">Welcome back</p>
            <h2>Continue building with PrixmoAI</h2>
          </div>
          <Link className="auth-form-shell__switch" to="/signup">
            New here? Create account
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="auth-provider-grid">
          <AuthProviderButton
            provider="google"
            label="Continue with Google"
            busy={oauthPending === 'google'}
            disabled={!isConfigured || isInitializing || isSubmitting || oauthPending !== null}
            onClick={() => {
              void handleOAuth('google');
            }}
          />
          <AuthProviderButton
            provider="github"
            label="Continue with GitHub"
            busy={oauthPending === 'github'}
            disabled={!isConfigured || isInitializing || isSubmitting || oauthPending !== null}
            onClick={() => {
              void handleOAuth('github');
            }}
          />
          <AuthProviderButton
            provider="facebook"
            label="Continue with Facebook"
            busy={oauthPending === 'facebook'}
            disabled={!isConfigured || isInitializing || isSubmitting || oauthPending !== null}
            onClick={() => {
              void handleOAuth('facebook');
            }}
          />
        </div>

        <div className="auth-divider">
          <span>or use your email</span>
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
          placeholder="••••••••"
          required
        />

        {!isConfigured ? (
          <ErrorMessage message="Client Supabase env is missing. Add the variables from client/.env.example first." />
        ) : null}
        <ErrorMessage message={error} />

        <Button type="submit" size="lg" disabled={!isConfigured || isSubmitting || isInitializing}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
        {isInitializing ? <LoadingSpinner label="Checking session" /> : null}

        <p className="auth-footer">
          Need an account? <Link to="/signup">Create one</Link>
        </p>
        </form>
      </div>
    </AuthLayout>
  );
};
