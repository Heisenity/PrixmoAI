import Lenis from 'lenis';
import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { PageWrapper } from './components/layout/PageWrapper';
import { LoadingSpinner } from './components/shared/LoadingSpinner';

const HomePage = lazy(() =>
  import('./pages/home/HomePage').then((module) => ({
    default: module.HomePage,
  }))
);
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((module) => ({
    default: module.LoginPage,
  }))
);
const SignupPage = lazy(() =>
  import('./pages/auth/SignupPage').then((module) => ({
    default: module.SignupPage,
  }))
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/ForgotPasswordPage').then((module) => ({
    default: module.ForgotPasswordPage,
  }))
);
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/ResetPasswordPage').then((module) => ({
    default: module.ResetPasswordPage,
  }))
);
const OnboardingPage = lazy(() =>
  import('./pages/onboarding/OnboardingPage').then((module) => ({
    default: module.OnboardingPage,
  }))
);
const DashboardPage = lazy(() =>
  import('./pages/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  }))
);
const GeneratePage = lazy(() =>
  import('./pages/generate/GeneratePage').then((module) => ({
    default: module.GeneratePage,
  }))
);
const AnalyticsPage = lazy(() =>
  import('./pages/analytics/AnalyticsPage').then((module) => ({
    default: module.AnalyticsPage,
  }))
);
const SchedulerPage = lazy(() =>
  import('./pages/scheduler/SchedulerPage').then((module) => ({
    default: module.SchedulerPage,
  }))
);
const BillingPage = lazy(() =>
  import('./pages/billing/BillingPage').then((module) => ({
    default: module.BillingPage,
  }))
);
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  }))
);

const SmoothScrollBridge = () => {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.1,
    });

    let frame = 0;

    const raf = (time: number) => {
      lenis.raf(time);
      frame = window.requestAnimationFrame(raf);
    };

    frame = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
};

const RouterTree = () => (
  <BrowserRouter>
    <SmoothScrollBridge />
    <Suspense
      fallback={
        <div className="screen-center">
          <LoadingSpinner label="Loading workspace" />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/app" element={<PageWrapper />}>
            <Route index element={<Navigate to="/app/generate" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="generate" element={<GeneratePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="scheduler" element={<SchedulerPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);

const App = () => (
  <AuthProvider>
    <RouterTree />
  </AuthProvider>
);

export default App;
