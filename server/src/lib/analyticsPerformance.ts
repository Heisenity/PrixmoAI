type AnalyticsPerformanceInput = {
  id: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  impressions: number;
  reach: number;
  engagements: number;
  engagementRate: number | null;
  followersAtPostTime?: number | null;
  publishedTime?: string | null;
};

export type AnalyticsPerformanceScore = {
  id: string;
  score: number;
  hasSignal: boolean;
  weightedInteractionRate: number;
  engagementRateRatio: number;
  likeRate: number;
  commentRate: number;
  saveRate: number;
  shareRate: number;
  normalizedReach: number;
  normalizedImpressions: number;
};

const SCORE_WEIGHTS = {
  weightedInteractionRate: 0.4,
  engagementRateRatio: 0.2,
  shareRate: 0.12,
  saveRate: 0.1,
  commentRate: 0.08,
  likeRate: 0.05,
  normalizedReach: 0.03,
  normalizedImpressions: 0.02,
} as const;

const TOTAL_WEIGHT = Object.values(SCORE_WEIGHTS).reduce(
  (total, value) => total + value,
  0
);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const normalizePercentLikeValue = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }

  return value > 1 ? value / 100 : value;
};

const normalizeSeriesValue = (value: number, min: number, max: number) => {
  if (max === min) {
    return max > 0 ? 1 : 0;
  }

  return clamp01((value - min) / (max - min));
};

const toPublishedTimeValue = (value: string | null | undefined) => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildAnalyticsPerformanceScores = (
  inputs: AnalyticsPerformanceInput[]
): AnalyticsPerformanceScore[] => {
  const prepared = inputs.map((input) => {
    const normalizer =
      input.reach > 0
        ? input.reach
        : (input.followersAtPostTime ?? 0) > 0
          ? (input.followersAtPostTime as number)
          : input.impressions > 0
            ? input.impressions
            : 0;
    const safeNormalizer = Math.max(normalizer, 1);
    const likeRate = input.likes / safeNormalizer;
    const commentRate = input.comments / safeNormalizer;
    const saveRate = input.saves / safeNormalizer;
    const shareRate = input.shares / safeNormalizer;
    const engagementRateRatio =
      input.engagementRate !== null
        ? normalizePercentLikeValue(input.engagementRate)
        : input.engagements / safeNormalizer;
    const weightedInteractionRate =
      normalizer > 0
        ? (input.likes + input.comments * 2 + input.saves * 3 + input.shares * 4) /
          safeNormalizer
        : 0;
    const hasSignal =
      input.likes > 0 ||
      input.comments > 0 ||
      input.saves > 0 ||
      input.shares > 0 ||
      input.engagements > 0 ||
      input.impressions > 0 ||
      input.reach > 0;

    return {
      ...input,
      normalizer,
      likeRate,
      commentRate,
      saveRate,
      shareRate,
      engagementRateRatio,
      weightedInteractionRate,
      hasSignal,
    };
  });

  const impressionValues = prepared.map((entry) => entry.impressions);
  const reachValues = prepared.map((entry) => entry.reach);
  const minImpressions = Math.min(...impressionValues, 0);
  const maxImpressions = Math.max(...impressionValues, 0);
  const minReach = Math.min(...reachValues, 0);
  const maxReach = Math.max(...reachValues, 0);

  return prepared.map((entry) => {
    const normalizedImpressions = normalizeSeriesValue(
      entry.impressions,
      minImpressions,
      maxImpressions
    );
    const normalizedReach = normalizeSeriesValue(entry.reach, minReach, maxReach);
    const score =
      entry.hasSignal
        ? (entry.weightedInteractionRate * SCORE_WEIGHTS.weightedInteractionRate +
            entry.engagementRateRatio * SCORE_WEIGHTS.engagementRateRatio +
            entry.shareRate * SCORE_WEIGHTS.shareRate +
            entry.saveRate * SCORE_WEIGHTS.saveRate +
            entry.commentRate * SCORE_WEIGHTS.commentRate +
            entry.likeRate * SCORE_WEIGHTS.likeRate +
            normalizedReach * SCORE_WEIGHTS.normalizedReach +
            normalizedImpressions * SCORE_WEIGHTS.normalizedImpressions) /
          TOTAL_WEIGHT
        : 0;

    return {
      id: entry.id,
      score: Number((score * 100).toFixed(4)),
      hasSignal: entry.hasSignal,
      weightedInteractionRate: Number(entry.weightedInteractionRate.toFixed(6)),
      engagementRateRatio: Number(entry.engagementRateRatio.toFixed(6)),
      likeRate: Number(entry.likeRate.toFixed(6)),
      commentRate: Number(entry.commentRate.toFixed(6)),
      saveRate: Number(entry.saveRate.toFixed(6)),
      shareRate: Number(entry.shareRate.toFixed(6)),
      normalizedReach: Number(normalizedReach.toFixed(6)),
      normalizedImpressions: Number(normalizedImpressions.toFixed(6)),
    };
  });
};

export const compareAnalyticsPerformanceScores = <
  T extends AnalyticsPerformanceScore & { likes: number; comments: number; saves: number; shares: number; reach: number; impressions: number; publishedTime?: string | null; id: string }
>(
  left: T,
  right: T
) => {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.weightedInteractionRate !== left.weightedInteractionRate) {
    return right.weightedInteractionRate - left.weightedInteractionRate;
  }

  if (right.engagementRateRatio !== left.engagementRateRatio) {
    return right.engagementRateRatio - left.engagementRateRatio;
  }

  if (right.shares !== left.shares) {
    return right.shares - left.shares;
  }

  if (right.saves !== left.saves) {
    return right.saves - left.saves;
  }

  if (right.comments !== left.comments) {
    return right.comments - left.comments;
  }

  if (right.likes !== left.likes) {
    return right.likes - left.likes;
  }

  if (right.reach !== left.reach) {
    return right.reach - left.reach;
  }

  if (right.impressions !== left.impressions) {
    return right.impressions - left.impressions;
  }

  const timeDelta =
    toPublishedTimeValue(right.publishedTime) - toPublishedTimeValue(left.publishedTime);

  if (timeDelta !== 0) {
    return timeDelta;
  }

  return left.id.localeCompare(right.id);
};
