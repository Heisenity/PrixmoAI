import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthCosmicBackground } from '../../components/auth/AuthCosmicBackground';
import { AuthProviderButton } from '../../components/auth/AuthProviderButton';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

const PHONE_NUMBER_PATTERN = /^[0-9+()\-\s]{10,20}$/;
const SIGNUP_OTP_PATTERN = /^[0-9]{6,8}$/;
const SIGNUP_OTP_RESEND_COOLDOWN_MS = 30_000;
const PENDING_SIGNUP_STORAGE_KEY = 'prixmoai.auth.pending-signup';

type PendingSignupState = {
  email: string;
  fullName: string;
  phoneNumber: string;
  resendAvailableAt: number;
};

const readPendingSignupState = (): PendingSignupState | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(PENDING_SIGNUP_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingSignupState;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.fullName !== 'string' ||
      typeof parsed.phoneNumber !== 'string' ||
      typeof parsed.resendAvailableAt !== 'number'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const persistPendingSignupState = (state: PendingSignupState | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!state) {
    window.sessionStorage.removeItem(PENDING_SIGNUP_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(PENDING_SIGNUP_STORAGE_KEY, JSON.stringify(state));
};

export const SignupPage = () => {
  const location = useLocation();
  const {
    session,
    profile,
    signUp,
    verifySignupOtp,
    resendSignupConfirmation,
    signInWithOAuth,
    isConfigured,
    isInitializing,
  } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [pendingSignup, setPendingSignup] = useState<PendingSignupState | null>(null);
  const [resendCountdownSeconds, setResendCountdownSeconds] = useState(0);
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | 'facebook' | null>(
    null
  );

  const notice = (location.state as { authNotice?: string } | null)?.authNotice;
  const destination =
    profile?.brandName && profile?.fullName && profile?.phoneNumber
      ? '/app/generate'
      : '/onboarding';
  const isOtpStep = Boolean(pendingSignup);

  useEffect(() => {
    const restoredState = readPendingSignupState();

    if (!restoredState) {
      return;
    }

    setPendingSignup(restoredState);
    setFullName(restoredState.fullName);
    setPhoneNumber(restoredState.phoneNumber);
    setEmail(restoredState.email);
  }, []);

  useEffect(() => {
    if (!pendingSignup) {
      setResendCountdownSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = Math.max(0, pendingSignup.resendAvailableAt - Date.now());
      setResendCountdownSeconds(Math.ceil(remainingMs / 1000));
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pendingSignup]);

  const writePendingSignup = (nextState: PendingSignupState | null) => {
    setPendingSignup(nextState);
    persistPendingSignupState(nextState);
  };

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
      const normalizedEmail = email.trim().toLowerCase();
      const trimmedFullName = fullName.trim();
      const trimmedPhoneNumber = phoneNumber.trim();

      if (!PHONE_NUMBER_PATTERN.test(trimmedPhoneNumber)) {
        throw new Error('Enter a valid phone number before creating your account.');
      }

      const result = await signUp({
        email: normalizedEmail,
        password,
        fullName: trimmedFullName,
        phoneNumber: trimmedPhoneNumber,
      });

      if (!result.requiresEmailConfirmation) {
        setSuccess('Account created successfully. Finalizing your workspace...');
        return;
      }

      const nextPendingState: PendingSignupState = {
        email: normalizedEmail,
        fullName: trimmedFullName,
        phoneNumber: trimmedPhoneNumber,
        resendAvailableAt: Date.now() + SIGNUP_OTP_RESEND_COOLDOWN_MS,
      };

      writePendingSignup(nextPendingState);
      setOtpCode('');
      setSuccess(`We sent a verification code to ${normalizedEmail}. Enter it here to finish your signup.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsVerifyingOtp(true);

    try {
      if (!pendingSignup?.email) {
        throw new Error('Start with your email and password first so we know what to verify.');
      }

      if (!SIGNUP_OTP_PATTERN.test(otpCode.trim())) {
        throw new Error('Enter the code from your email so we can finish verifying this signup.');
      }

      await verifySignupOtp(pendingSignup.email, otpCode.trim());
      writePendingSignup(null);
      setOtpCode('');
      setPassword('');
      setSuccess('Email verified. Finalizing your workspace...');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to verify your email code'
      );
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingSignup?.email) {
      setError('Start the signup first so we know where to resend the verification code.');
      return;
    }

    if (resendCountdownSeconds > 0) {
      setError(`Hold up for ${resendCountdownSeconds}s and then we can send a fresh code.`);
      return;
    }

    setError(null);
    setIsResendingVerification(true);

    try {
      await resendSignupConfirmation(pendingSignup.email);
      const nextPendingState = {
        ...pendingSignup,
        resendAvailableAt: Date.now() + SIGNUP_OTP_RESEND_COOLDOWN_MS,
      };

      writePendingSignup(nextPendingState);
      setSuccess(`Fresh verification code sent to ${pendingSignup.email}.`);
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : 'Failed to resend verification code'
      );
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleChangeEmail = () => {
    writePendingSignup(null);
    setOtpCode('');
    setPassword('');
    setError(null);
    setSuccess('Update your details and we’ll send a fresh code to the right inbox.');
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
      background={<AuthCosmicBackground />}
      hideIntro
      showBrandMark={false}
    >
      <div className="auth-form-shell login-page__shell">
        <div className="auth-form-shell__header login-page__header">
          <div className="login-page__header-copy">
            <p className="section-eyebrow">Create account</p>
            <h2 className="login-page__title">
              <span className="login-page__title-line">Start building</span>
              <span className="login-page__title-line">with PrixmoAI</span>
            </h2>
            <p className="login-page__subtitle">
              Create your account with a provider or email and set up the workspace
              that holds your brand memory, generation history, analytics, and queue.
            </p>
          </div>
          <Link className="auth-form-shell__switch" to="/login">
            Already have access? Sign in
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
          <span>{isOtpStep ? 'verify your email' : 'or create with email'}</span>
        </div>

        {!isOtpStep ? (
          <form className="form-stack" onSubmit={handleSubmit}>
            {notice ? <div className="message">{notice}</div> : null}

            <Input
              label="Full name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your full name"
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
              hint="Use a real phone number with country code so your workspace profile is ready to go."
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@brand.com"
              autoComplete="email"
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
            <ErrorMessage message={error} showRawInDev />
            {success ? <div className="message">{success}</div> : null}

            <Button
              type="submit"
              size="lg"
              className="auth-action-button"
              disabled={!isConfigured || isSubmitting || isInitializing}
            >
              {isSubmitting ? 'Creating workspace...' : 'Create account'}
            </Button>
            {isInitializing ? <LoadingSpinner label="Checking session" /> : null}

            <p className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </form>
        ) : (
          <form className="form-stack" onSubmit={handleVerifyOtp}>
            {notice ? <div className="message">{notice}</div> : null}

            <Input
              label="Email"
              type="email"
              value={pendingSignup?.email ?? ''}
              readOnly
              autoComplete="email"
            />
            <Input
              label="Verification code"
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(event) =>
                setOtpCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 8))
              }
              placeholder="Enter the code from your email"
              autoComplete="one-time-code"
              hint="Drop in the code from your inbox to prove this email is really yours."
              required
            />

            <ErrorMessage message={error} showRawInDev />
            {success ? <div className="message">{success}</div> : null}

            <div className="auth-inline-actions">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="auth-action-button"
                disabled={isResendingVerification || resendCountdownSeconds > 0}
                onClick={() => {
                  void handleResendVerification();
                }}
              >
                {isResendingVerification
                  ? 'Sending code...'
                  : resendCountdownSeconds > 0
                    ? `Resend in ${resendCountdownSeconds}s`
                    : 'Resend code'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="auth-action-button"
                onClick={handleChangeEmail}
              >
                Change email
              </Button>
            </div>

            <Button
              type="submit"
              size="lg"
              className="auth-action-button"
              disabled={!isConfigured || isVerifyingOtp || isInitializing}
            >
              {isVerifyingOtp ? 'Verifying code...' : 'Verify email and continue'}
            </Button>
            {isInitializing ? <LoadingSpinner label="Checking session" /> : null}

            <p className="auth-footer">
              Wrong route? <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </AuthLayout>
  );
};
