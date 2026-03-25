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

const OTP_PATTERN = /^[0-9]{8}$/;

export const LoginPage = () => {
  const location = useLocation();
  const {
    session,
    profile,
    signIn,
    requestEmailOtpSignIn,
    verifyEmailOtpSignIn,
    resendSignupConfirmation,
    signInWithOAuth,
    isConfigured,
    isInitializing,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpSubmitting, setIsOtpSubmitting] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [showPasswordAlternative, setShowPasswordAlternative] = useState(false);
  const [hasRequestedOtp, setHasRequestedOtp] = useState(false);
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | 'facebook' | null>(
    null
  );

  const notice = (location.state as { from?: string; authNotice?: string } | null)?.authNotice;
  const destination =
    (location.state as { from?: string } | null)?.from ||
    (profile?.brandName && profile?.fullName && profile?.phoneNumber
      ? '/app/generate'
      : '/onboarding');

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

  const normalizedEmail = email.trim();

  const handleRequestOtp = async () => {
    if (!normalizedEmail) {
      setError('Enter your email first so we know where to send the 8-digit code.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      await requestEmailOtpSignIn(normalizedEmail);
      setHasRequestedOtp(true);
      setShowPasswordAlternative(true);
      setSuccess(`We sent a 8-digit login code to ${normalizedEmail}.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to send login code'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsOtpSubmitting(true);

    try {
      if (!normalizedEmail) {
        throw new Error('Enter your email first.');
      }

      if (!OTP_PATTERN.test(otpCode.trim())) {
        throw new Error('Enter the 8-digit code from your email.');
      }

      await verifyEmailOtpSignIn(normalizedEmail, otpCode.trim());
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to verify login code'
      );
    } finally {
      setIsOtpSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      await signIn(normalizedEmail, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to sign in');
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
        submitError instanceof Error ? submitError.message : 'Failed to start social sign-in'
      );
    } finally {
      setOauthPending(null);
    }
  };

  const handleResendCode = async () => {
    if (!normalizedEmail) {
      setError('Enter your email first so we know where to resend the code.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsResendingCode(true);

    try {
      await requestEmailOtpSignIn(normalizedEmail);
      setHasRequestedOtp(true);
      setSuccess(`Fresh 8-digit code sent to ${normalizedEmail}.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to resend login code'
      );
    } finally {
      setIsResendingCode(false);
    }
  };

  const handleResendVerification = async () => {
    if (!normalizedEmail) {
      setError('Enter your email address first so we know where to resend the verification link.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsResendingCode(true);

    try {
      await resendSignupConfirmation(normalizedEmail);
      setSuccess('Verification link sent again. Open your inbox, confirm your email, then sign in.');
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : 'Failed to resend verification email'
      );
    } finally {
      setIsResendingCode(false);
    }
  };

  const shouldShowVerificationAction =
    Boolean(normalizedEmail) &&
    Boolean(error) &&
    /(confirm|verified|verification)/i.test(error ?? '');

  return (
    <AuthLayout
      eyebrow="Access workspace"
      title="Sign in and get straight back to production."
      description="Start with your email. We send a 8-digit code first, and you can switch to password sign-in anytime below."
      highlights={[
        'Email OTP as the primary path',
        'Password fallback for returning users',
        'Google, GitHub, and Facebook also supported',
      ]}
      aside={
        <div className="auth-aside-stack">
          <Card className="auth-shell__aside-card auth-shell__aside-card--feature">
            <strong>Recommended flow</strong>
            <p>Enter your email, get the 8-digit code, and continue without typing a password unless you want the alternate path.</p>
          </Card>
          <Card className="auth-shell__aside-card">
            <strong>Forgot your username?</strong>
            <p>PrixmoAI signs in with email or social providers, so the email address is all you need to recover access.</p>
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

        <div className="form-stack">
          {notice ? <div className="message">{notice}</div> : null}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@brand.com"
            autoComplete="email"
            required
          />

          <Button
            type="button"
            size="lg"
            disabled={!isConfigured || isSubmitting || isInitializing}
            onClick={() => {
              void handleRequestOtp();
            }}
          >
            {isSubmitting ? 'Sending code...' : 'Continue with email code'}
          </Button>

          {hasRequestedOtp ? (
            <form className="form-stack auth-panel" onSubmit={handleVerifyOtp}>
              <Input
                label="8-digit email code"
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="12345678"
                autoComplete="one-time-code"
                maxLength={8}
                required
              />

              <div className="auth-inline-actions">
                <Button
                  type="submit"
                  size="md"
                  disabled={!isConfigured || isOtpSubmitting || isInitializing}
                >
                  {isOtpSubmitting ? 'Verifying code...' : 'Verify code and sign in'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={isResendingCode}
                  onClick={() => {
                    void handleResendCode();
                  }}
                >
                  {isResendingCode ? 'Sending...' : 'Resend code'}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="auth-divider">
            <span>Alternate approach</span>
          </div>

          {!showPasswordAlternative ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={!normalizedEmail}
              onClick={() => {
                setShowPasswordAlternative(true);
              }}
            >
              Use password instead
            </Button>
          ) : (
            <form className="form-stack auth-panel" onSubmit={handlePasswordSubmit}>
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />

              <div className="auth-row auth-row--between">
                <span className="field__hint">Continue to reset your password for {normalizedEmail || 'your email'} if needed.</span>
                <Link
                  className="auth-inline-link"
                  to={
                    normalizedEmail
                      ? `/forgot-password?email=${encodeURIComponent(normalizedEmail)}`
                      : '/forgot-password'
                  }
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                size="md"
                disabled={!isConfigured || isSubmitting || isInitializing || !normalizedEmail}
              >
                {isSubmitting ? 'Signing in...' : 'Sign in with password'}
              </Button>
            </form>
          )}

          {!isConfigured ? (
            <ErrorMessage message="Client Supabase env is missing. Add the variables from client/.env.example first." />
          ) : null}
          <ErrorMessage message={error} />
          {success ? <div className="message">{success}</div> : null}
          {shouldShowVerificationAction ? (
            <div className="auth-inline-actions">
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={isResendingCode}
                onClick={() => {
                  void handleResendVerification();
                }}
              >
                {isResendingCode ? 'Sending link...' : 'Resend verification email'}
              </Button>
            </div>
          ) : null}

          {isInitializing ? <LoadingSpinner label="Checking session" /> : null}

          <p className="auth-footer">
            Need an account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};
