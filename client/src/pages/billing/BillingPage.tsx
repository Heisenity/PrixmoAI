import type { CSSProperties } from 'react';
import { CurrentPlanBadge } from '../../components/billing/CurrentPlanBadge';
import { PlanCard } from '../../components/billing/PlanCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Card } from '../../components/ui/card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { useBilling } from '../../hooks/useBilling';
import { PLAN_DASHBOARD_DETAILS } from '../../lib/constants';
import { getUsageSnapshot } from '../../lib/usage';
import { formatCompactNumber } from '../../lib/utils';

const getAllowanceTone = (percent: number) => {
  if (percent < 10) {
    return {
      tone: '#8f1f1f',
      toneSoft: 'rgba(143, 31, 31, 0.42)',
      border: 'rgba(171, 56, 56, 0.48)',
    };
  }

  if (percent < 20) {
    return {
      tone: '#e35757',
      toneSoft: 'rgba(227, 87, 87, 0.36)',
      border: 'rgba(227, 87, 87, 0.42)',
    };
  }

  if (percent < 50) {
    return {
      tone: '#e0a12e',
      toneSoft: 'rgba(224, 161, 46, 0.34)',
      border: 'rgba(224, 161, 46, 0.4)',
    };
  }

  if (percent < 60) {
    return {
      tone: '#efe08a',
      toneSoft: 'rgba(239, 224, 138, 0.3)',
      border: 'rgba(239, 224, 138, 0.38)',
    };
  }

  return {
    tone: '#61e0a8',
    toneSoft: 'rgba(97, 224, 168, 0.3)',
    border: 'rgba(97, 224, 168, 0.36)',
  };
};

export const BillingPage = () => {
  const { catalog, subscription, error, isLoading, isCheckingOut, startCheckout } =
    useBilling();
  const { overview, isLoading: isAnalyticsLoading } = useAnalytics();
  const activePlan = subscription?.plan || catalog?.currentSubscription.plan || 'free';
  const planDetails = PLAN_DASHBOARD_DETAILS[activePlan];
  const resolvedSubscription = subscription || catalog?.currentSubscription;
  const generationOverview = overview?.generation ?? null;
  const hasUsageOverview = Boolean(generationOverview);
  const contentGenerationsToday = generationOverview?.contentGenerationsToday ?? null;
  const imageGenerationsToday = generationOverview?.imageGenerationsToday ?? null;
  const contentUsage = contentGenerationsToday !== null
    ? getUsageSnapshot(
        contentGenerationsToday,
        planDetails.contentLimit
      )
    : null;
  const imageUsage = imageGenerationsToday !== null
    ? getUsageSnapshot(
        imageGenerationsToday,
        planDetails.imageLimit
      )
    : null;
  const percentCandidates = [
    contentUsage?.percentLeft ?? null,
    imageUsage?.percentLeft ?? null,
  ].filter((value): value is number => value !== null);
  const overallPercentLeft =
    hasUsageOverview && percentCandidates.length > 0
      ? Math.round(
          percentCandidates.reduce((sum, value) => sum + value, 0) /
            percentCandidates.length
        )
      : null;
  const allowanceBadgeTitle = isAnalyticsLoading
    ? 'Checking...'
    : overallPercentLeft === null
      ? 'Syncing...'
      : `${overallPercentLeft}%`;
  const allowanceBadgeMeta = isAnalyticsLoading
    ? 'Syncing today'
    : overallPercentLeft === null
      ? 'Waiting for fresh usage'
      : 'Average remaining';
  const remainingSummary = isAnalyticsLoading
    ? 'Loading today’s allowance...'
    : !hasUsageOverview
      ? 'Waiting for the latest usage snapshot...'
      : [
        contentUsage?.remaining === null
          ? 'Unlimited content left'
          : `${formatCompactNumber(contentUsage?.remaining ?? 0)} content left`,
        imageUsage?.remaining === null
          ? 'Unlimited images left'
          : `${formatCompactNumber(imageUsage?.remaining ?? 0)} images left`,
      ].join(' • ');
  const allowancePercent = overallPercentLeft ?? 58;
  const allowanceTone =
    overallPercentLeft === null
      ? {
          tone: '#83d8ff',
          toneSoft: 'rgba(131, 216, 255, 0.24)',
          border: 'rgba(131, 216, 255, 0.28)',
        }
      : getAllowanceTone(allowancePercent);
  const allowanceBadgeStyle = {
    '--billing-allowance-fill': `${Math.max(0, Math.min(100, allowancePercent))}%`,
    '--billing-allowance-tone': allowanceTone.tone,
    '--billing-allowance-tone-soft': allowanceTone.toneSoft,
    '--billing-allowance-border': allowanceTone.border,
  } as CSSProperties;

  if (isLoading && !catalog) {
    return (
      <Card className="dashboard-panel">
        <div className="screen-center">
          <LoadingSpinner label="Loading billing" />
        </div>
      </Card>
    );
  }

  return (
    <div className="page-stack">
      <ErrorMessage message={error} />

      <Card className="dashboard-panel">
        <div className="dashboard-panel__header">
          <div className="billing-subscription-summary__heading">
            <p className="section-eyebrow">Current subscription</p>
            <h3>Subscription state</h3>
          </div>
          {resolvedSubscription ? <CurrentPlanBadge plan={activePlan} /> : null}
        </div>
        {resolvedSubscription ? (
          <div className="stack-list">
            <div className="stack-list__item">
              <strong>Status</strong>
              <span>{resolvedSubscription.status}</span>
            </div>
            <div className="stack-list__item stack-list__item--inline billing-daily-allowance">
              <div className="billing-daily-allowance__copy">
                <strong>Daily allowance</strong>
                <span>{planDetails.planAllowanceSummary}</span>
                <small>{remainingSummary}</small>
              </div>
              <div
                className={`billing-allowance-badge ${
                  !hasUsageOverview ? 'billing-allowance-badge--pending' : ''
                }`}
                style={allowanceBadgeStyle}
                aria-label="Daily allowance remaining"
              >
                <span className="billing-allowance-badge__label">Left today</span>
                <div className="billing-allowance-badge__value">
                  <strong>{allowanceBadgeTitle}</strong>
                  <small>{allowanceBadgeMeta}</small>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No active subscription yet"
            description="You are currently on the free plan. Choose a plan below whenever you are ready."
          />
        )}
      </Card>

      {catalog?.plans.length ? (
        <>
          <div className="pricing-grid">
            {catalog.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentPlan={activePlan}
                isCheckingOut={isCheckingOut}
                onCheckout={(selectedPlan) => {
                  void startCheckout(selectedPlan);
                }}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="Billing catalog unavailable"
          description="Plans are not loading right now. Once the billing catalog responds, this page will populate automatically."
        />
      )}
    </div>
  );
};
