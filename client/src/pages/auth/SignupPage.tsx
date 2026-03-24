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

const PHONE_NUMBER_PATTERN = /^[0-9+()\-\s]{10,20}$/;

export const SignupPage = () => {
  const location = useLocation();
  const {
    session,
    profile,
    signUp,
    resendSignupConfirmation,
    signInWithOAuth,
    isConfigured,
    isInitializing,
  } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [showVerificationActions, setShowVerificationActions] = useState(false);
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | 'facebook' | null>(
    null
  );

  const notice = (location.state as { authNotice?: string } | null)?.authNotice;
  const destination = profile?.fullName && profile?.phoneNumber ? '/app/generate' : '/onboarding';

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
    setShowVerificationActions(false);
    setIsSubmitting(true);

    try {
      if (!PHONE_NUMBER_PATTERN.test(phoneNumber.trim())) {
        throw new Error('Enter a valid phone number before creating your account.');
      }

      const result = await signUp({
        email,
        password,
        fullName,
        phoneNumber,
      });
      setShowVerificationActions(result.requiresEmailConfirmation);
      setSuccess(
        result.requiresEmailConfirmation
          ? 'Account created. Check your inbox, verify your email, then sign in to continue.'
          : 'Account created successfully. Finalizing your workspace...'
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      setError('Enter your email address first so we know where to resend the verification link.');
      return;
    }

    setError(null);
    setIsResendingVerification(true);

    try {
      await resendSignupConfirmation(email.trim());
      setSuccess('Fresh verification link sent. Check your inbox and spam folder.');
      setShowVerificationActions(true);
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : 'Failed to resend verification email'
      );
    } finally {
      setIsResendingVerification(false);
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
          label="Full name"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Name"
          autoComplete="name"
          required
        />
        <Input
          label="Phone number"
          type="tel"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          placeholder="+91 98765 XXXXX"
          autoComplete="tel"
          pattern="[0-9+()\\-\\s]{10,20}"
          hint="Use a valid phone number format with country code. E.g., +91 98765 XXXXX"
          required
        />
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
          autoComplete="new-password"
          required
        />

        {!isConfigured ? (
          <ErrorMessage message="Client Supabase env is missing. Add the variables from client/.env.example first." />
        ) : null}
        <ErrorMessage message={error} />
        {success ? <div className="message">{success}</div> : null}
        {showVerificationActions ? (
          <div className="auth-inline-actions">
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={isResendingVerification}
              onClick={() => {
                void handleResendVerification();
              }}
            >
              {isResendingVerification ? 'Sending link...' : 'Resend verification email'}
            </Button>
            <Link className="auth-inline-link" to="/login">
              I already verified my email
            </Link>
          </div>
        ) : null}

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
