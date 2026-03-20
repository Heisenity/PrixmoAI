import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';

export const LoginPage = () => {
  const location = useLocation();
  const { session, signIn, isConfigured, isInitializing } = useAuth();
  const [email, setEmail] = useState('test@prixmoai.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session) {
    return <Navigate to={(location.state as { from?: string } | null)?.from || '/app/dashboard'} replace />;
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

  return (
    <AuthLayout
      eyebrow="Access workspace"
      title="Sign in to your PrixmoAI system."
      aside={
        <Card className="auth-shell__aside-card">
          <strong>Before this works</strong>
          <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the client env.</p>
        </Card>
      }
    >
      <form className="form-stack" onSubmit={handleSubmit}>
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
    </AuthLayout>
  );
};
