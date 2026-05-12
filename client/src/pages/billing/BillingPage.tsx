import { useState, type CSSProperties } from 'react';
import { CurrentPlanBadge } from '../../components/billing/CurrentPlanBadge';
import { PlanCard } from '../../components/billing/PlanCard';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';
import { Card } from '../../components/ui/card';
import { useAuth } from '../../hooks/useAuth';
import { useBilling } from '../../hooks/useBilling';
import { PLAN_DASHBOARD_DETAILS } from '../../lib/constants';
import {
  isSuperAdminUser,
  readStoredSuperAdminTestingTier,
  writeStoredSuperAdminTestingTier,
} from '../../lib/superAdmin';
import { getUsageSnapshot } from '../../lib/usage';
import { formatCompactNumber } from '../../lib/utils';
import type { PlanType } from '../../types';

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

const SUPER_ADMIN_TIER_BEHAVIOR: Record<
  PlanType,
  Array<{ label: string; value: string }>
> = {
  free: [
    { label: 'Images', value: 'Watermark on' },
    { label: 'Queue', value: 'Standard lane' },
    { label: 'Accounts', value: '1 account' },
  ],
  basic: [
    { label: 'Images', value: 'No watermark' },
    { label: 'Queue', value: 'Fast lane' },
    { label: 'Accounts', value: '2 accounts' },
  ],
  pro: [
    { label: 'Images', value: 'No watermark' },
    { label: 'Queue', value: 'Priority lane' },
    { label: 'Accounts', value: '5 accounts' },
  ],
};

export const BillingPage = () => {
  const { user } = useAuth();
  const [superAdminTestingTier, setSuperAdminTestingTier] = useState<PlanType>(() =>
    readStoredSuperAdminTestingTier()
  );
  const { catalog, subscription, error, isLoading, isCheckingOut, startCheckout } =
    useBilling();
  const activePlan = subscription?.plan || catalog?.currentSubscription.plan || 'free';
  const planDetails = PLAN_DASHBOARD_DETAILS[activePlan];
  const resolvedSubscription = subscription || catalog?.currentSubscription;
  const isSuperAdminAccount =
    isSuperAdminUser(user) ||
    resolvedSubscription?.metadata?.superAdmin === true ||
    catalog?.currentSubscription.metadata?.superAdmin === true;
  const effectiveSuperAdminPlan = isSuperAdminAccount ? superAdminTestingTier : activePlan;
  const usageSnapshot = catalog?.usageSnapshot ?? null;
  const hasUsageOverview = Boolean(usageSnapshot);
  const contentGenerationsToday = usageSnapshot?.contentGenerationsToday ?? null;
  const imageGenerationsToday = usageSnapshot?.imageGenerationsToday ?? null;
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
  const allowanceBadgeTitle = isLoading
    ? 'Checking...'
    : overallPercentLeft === null
      ? 'Syncing...'
      : `${overallPercentLeft}%`;
  const allowanceBadgeMeta = isLoading
    ? 'Syncing today'
    : overallPercentLeft === null
      ? 'Waiting for fresh usage'
      : 'Average remaining';
  const remainingSummary = isLoading
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
  const selectedSuperAdminPlanDetails = PLAN_DASHBOARD_DETAILS[effectiveSuperAdminPlan];
  const selectedSuperAdminContentUsage =
    contentGenerationsToday === null
      ? null
      : getUsageSnapshot(
          contentGenerationsToday,
          selectedSuperAdminPlanDetails.contentLimit
        );
  const selectedSuperAdminImageUsage =
    imageGenerationsToday === null
      ? null
      : getUsageSnapshot(
          imageGenerationsToday,
          selectedSuperAdminPlanDetails.imageLimit
        );
  const selectedSuperAdminPercentCandidates = [
    selectedSuperAdminContentUsage?.percentLeft ?? null,
    selectedSuperAdminImageUsage?.percentLeft ?? null,
  ].filter((value): value is number => value !== null);
  const selectedSuperAdminPercentLeft =
    selectedSuperAdminPercentCandidates.length > 0
      ? Math.round(
          selectedSuperAdminPercentCandidates.reduce((sum, value) => sum + value, 0) /
            selectedSuperAdminPercentCandidates.length
        )
      : null;
  const selectedSuperAdminAllowancePercent = selectedSuperAdminPercentLeft ?? 58;
  const selectedSuperAdminAllowanceTone =
    selectedSuperAdminPercentLeft === null
      ? {
          tone: '#83d8ff',
          toneSoft: 'rgba(131, 216, 255, 0.24)',
          border: 'rgba(131, 216, 255, 0.28)',
        }
      : getAllowanceTone(selectedSuperAdminAllowancePercent);
  const selectedSuperAdminAllowanceStyle = {
    '--billing-allowance-fill': `${Math.max(
      0,
      Math.min(100, selectedSuperAdminAllowancePercent)
    )}%`,
    '--billing-allowance-tone': selectedSuperAdminAllowanceTone.tone,
    '--billing-allowance-tone-soft': selectedSuperAdminAllowanceTone.toneSoft,
    '--billing-allowance-border': selectedSuperAdminAllowanceTone.border,
  } as CSSProperties;
  const selectedSuperAdminBehavior =
    SUPER_ADMIN_TIER_BEHAVIOR[effectiveSuperAdminPlan];

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
            <p className="section-eyebrow">
              {isSuperAdminAccount ? 'Super admin account' : 'Current subscription'}
            </p>
            <h3>
              {isSuperAdminAccount
                ? 'Billing is disabled for this account'
                : 'Subscription state'}
            </h3>
          </div>
          {isSuperAdminAccount ? (
            <span className="super-admin-chip super-admin-chip--billing">SA account</span>
          ) : resolvedSubscription ? (
            <CurrentPlanBadge plan={activePlan} />
          ) : null}
        </div>
        {isSuperAdminAccount ? (
          <div className="billing-super-admin">
            <div className="stack-list__item billing-super-admin__access">
              <div className="billing-super-admin__access-head">
                <strong>Access</strong>
                <span className="billing-super-admin__access-chip">Global SA test mode</span>
              </div>
              <span>Pick any tier below and the whole app will behave like that plan for this SA account.</span>
            </div>
            <div className="billing-super-admin__tester">
              <div className="billing-super-admin__tester-head">
                <div className="billing-super-admin__tester-copy">
                  <strong>Tier test mode</strong>
                  <span>Switch the active SA tier and test real Free, Basic, or Pro behavior across PrixmoAI.</span>
                </div>
                <label className="billing-super-admin__tier-select" htmlFor="super-admin-tier">
                  <span>Testing tier</span>
                  <select
                    id="super-admin-tier"
                    value={superAdminTestingTier}
                    onChange={(event) => {
                      const nextPlan = event.target.value as PlanType;
                      setSuperAdminTestingTier(nextPlan);
                      writeStoredSuperAdminTestingTier(nextPlan);
                    }}
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="pro">Pro</option>
                  </select>
                </label>
              </div>
              <div className="billing-super-admin__balance-card billing-super-admin__balance-card--feature">
                <div className="billing-super-admin__balance-head">
                  <div className="billing-super-admin__balance-heading">
                    <strong>Battery juice preview</strong>
                    <span>{selectedSuperAdminPlanDetails.planAllowanceSummary}</span>
                  </div>
                  <span className="billing-super-admin__plan-chip">
                    {effectiveSuperAdminPlan.toUpperCase()}
                  </span>
                </div>
                <div className="billing-super-admin__behavior-strip">
                  {selectedSuperAdminBehavior.map((item) => (
                    <div
                      key={`${effectiveSuperAdminPlan}-${item.label}`}
                      className="billing-super-admin__behavior-pill"
                    >
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="billing-super-admin__tester-body">
                  <div className="billing-super-admin__balance-copy">
                    {selectedSuperAdminContentUsage && selectedSuperAdminImageUsage ? (
                      <>
                        <div className="billing-super-admin__metric-grid">
                          <div className="billing-super-admin__metric">
                            <strong>
                              {selectedSuperAdminContentUsage.remaining === null
                                ? 'Unlimited'
                                : formatCompactNumber(selectedSuperAdminContentUsage.remaining)}
                            </strong>
                            <span>Content left</span>
                          </div>
                          <div className="billing-super-admin__metric">
                            <strong>
                              {selectedSuperAdminImageUsage.remaining === null
                                ? 'Unlimited'
                                : formatCompactNumber(selectedSuperAdminImageUsage.remaining)}
                            </strong>
                            <span>Images left</span>
                          </div>
                        </div>
                        <small className="billing-super-admin__footnote">
                          Based on today&apos;s real usage, this is how the selected tier would drain.
                        </small>
                      </>
                    ) : (
                      <>
                        <div className="billing-super-admin__metric-grid billing-super-admin__metric-grid--pending">
                          <div className="billing-super-admin__metric">
                            <strong>...</strong>
                            <span>Content left</span>
                          </div>
                          <div className="billing-super-admin__metric">
                            <strong>...</strong>
                            <span>Images left</span>
                          </div>
                        </div>
                        <small className="billing-super-admin__footnote">
                          These reference balances will appear when today&apos;s usage data loads.
                        </small>
                      </>
                    )}
                  </div>
                  <div
                    className={`billing-allowance-badge billing-super-admin__allowance-badge ${
                      !hasUsageOverview ? 'billing-allowance-badge--pending' : ''
                    }`}
                    style={selectedSuperAdminAllowanceStyle}
                    aria-label="Tier battery juice remaining"
                  >
                    <span className="billing-allowance-badge__label">Left today</span>
                    <div className="billing-allowance-badge__value">
                      <strong>
                        {selectedSuperAdminPercentLeft === null
                          ? 'Syncing'
                          : `${selectedSuperAdminPercentLeft}%`}
                      </strong>
                      <small>Battery juice for {effectiveSuperAdminPlan}</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : resolvedSubscription ? (
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
          <div
            className={`pricing-grid ${
              isSuperAdminAccount ? 'pricing-grid--super-admin-muted' : ''
            }`}
          >
            {catalog.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentPlan={activePlan}
                isCheckingOut={isCheckingOut}
                isSuperAdminPreview={isSuperAdminAccount}
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
