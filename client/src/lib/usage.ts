export const getUsageSnapshot = (used: number, limit: number | null) => {
  if (limit === null) {
    return {
      used,
      remaining: null,
      percentLeft: null,
    };
  }

  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, limit - safeUsed);
  const percentLeft = limit > 0 ? Math.max(0, Math.round((remaining / limit) * 100)) : 0;

  return {
    used: safeUsed,
    remaining,
    percentLeft,
  };
};

export const getOverallUsageSummary = ({
  contentLimit,
  imageLimit,
  contentUsed,
  imageUsed,
  isLoading,
  hasUsageData = true,
  usageWindowLabel = 'today',
}: {
  contentLimit: number | null;
  imageLimit: number | null;
  contentUsed: number | null;
  imageUsed: number | null;
  isLoading: boolean;
  hasUsageData?: boolean;
  usageWindowLabel?: string;
}) => {
  if (contentLimit === null && imageLimit === null) {
    return 'Unlimited access';
  }

  if (isLoading) {
    return 'Checking limits…';
  }

  if (!hasUsageData || contentUsed === null || imageUsed === null) {
    return 'Syncing limits…';
  }

  const contentUsage = getUsageSnapshot(contentUsed, contentLimit);
  const imageUsage = getUsageSnapshot(imageUsed, imageLimit);
  const overallPercentLeft = Math.round(
    ((contentUsage.percentLeft ?? 0) + (imageUsage.percentLeft ?? 0)) / 2
  );

  return `${overallPercentLeft}% left ${usageWindowLabel}`;
};
