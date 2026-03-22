import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { useAuth } from '../../hooks/useAuth';

const OTP_PATTERN = /^[0-9]{8}$/;

export const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    requestPasswordReset,
    verifyPasswordResetOtp,
    updatePassword,
    signOut,
    isConfigured,
  } = useAuth();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [stage, setStage] = useState<'request' | 'verify'>('request');

  const normalizedEmail = email.trim();

  const sendResetCode = async () => {
    if (!normalizedEmail) {
      setError('Enter your email first so we know where to send the verification code.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSendingCode(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setSearchParams({ email: normalizedEmail });
      setStage('verify');
      setSuccess(`Verification code sent to ${normalizedEmail}.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to send password reset code'
      );
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleRequestCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendResetCode();
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!normalizedEmail) {
      setError('Enter your email first.');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      if (!OTP_PATTERN.test(verificationCode.trim())) {
        throw new Error('Enter the 8-digit verification code from your email.');
      }

      if (password.length < 8) {
        throw new Error('Use a password with at least 8 characters.');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match yet.');
      }

      await verifyPasswordResetOtp(normalizedEmail, verificationCode.trim());
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
          : 'Failed to reset password'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Recover access"
      title="Reset your password with the same email you use to sign in."
      description="First confirm the email, then we send a verification code there. After that code is entered correctly, PrixmoAI lets you set a fresh password."
      highlights={[
        'Code goes to the same email address',
        'Password can only change after verification',
        'Username recovery is not needed for PrixmoAI login',
      ]}
    >
      <div className="auth-form-shell">
        <div className="auth-form-shell__header">
          <div>
            <p className="section-eyebrow">Forgot password</p>
            <h2>Recover your workspace</h2>
          </div>
          <Link className="auth-form-shell__switch" to="/login">
            Back to sign in
            <ArrowRight size={16} />
          </Link>
        </div>

        <form className="form-stack" onSubmit={handleRequestCode}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@brand.com"
            autoComplete="email"
            required
          />

          <div className="message">
            Click <strong>Continue</strong> to reset your password for{' '}
            <strong>{normalizedEmail || 'your email address'}</strong>.
          </div>

          {!isConfigured ? (
            <ErrorMessage message="Client Supabase env is missing. Add the variables from client/.env.example first." />
          ) : null}
          <ErrorMessage message={error} />
          {success ? <div className="message">{success}</div> : null}

          <Button type="submit" size="lg" disabled={!isConfigured || isSendingCode}>
            {isSendingCode ? 'Sending verification code...' : 'Continue'}
          </Button>
        </form>

        {stage === 'verify' ? (
          <>
            <div className="auth-divider">
              <span>Verify and reset</span>
            </div>

            <form className="form-stack auth-panel" onSubmit={handleResetPassword}>
              <Input
                label="Verification code"
                type="text"
                inputMode="numeric"
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 8))
                }
                placeholder="12345678"
                autoComplete="one-time-code"
                maxLength={8}
                required
              />
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

              <div className="auth-inline-actions">
                <Button type="submit" size="md" disabled={!isConfigured || isSubmitting}>
                  {isSubmitting ? 'Updating password...' : 'Verify code and update password'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={!isConfigured || isSendingCode}
                  onClick={() => {
                    void sendResetCode();
                  }}
                >
                  {isSendingCode ? 'Sending...' : 'Resend code'}
                </Button>
              </div>
            </form>
          </>
        ) : null}

        <p className="auth-footer">
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </AuthLayout>
  );
};
