import {
  CircleHelp,
  ChevronDown,
  Download,
  Facebook,
  Filter,
  Image as ImageIcon,
  Instagram,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AudienceDonutChart,
  DualLineChart,
  EngagementHeatmap,
  FollowerGrowthChart,
  StackedEngagementChart,
} from '../../components/analytics/AnalyticsCharts';
import { AnalyticsKpiCard } from '../../components/analytics/AnalyticsKpiCard';
import { AnalyticsPostDrawer } from '../../components/analytics/AnalyticsPostDrawer';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorMessage } from '../../components/shared/ErrorMessage';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { useAnalyticsDashboard } from '../../hooks/useAnalyticsDashboard';
import { getUserFacingTimeZone } from '../../lib/timezone';
import { formatDateTime, formatPercentage } from '../../lib/utils';
import type {
  AnalyticsDashboard,
  AnalyticsPlatformScope,
  AnalyticsPostInsight,
} from '../../types';

type AnalyticsSelectablePlatform = Exclude<AnalyticsPlatformScope, 'all'>;
type AnalyticsKpiKey = Exclude<keyof AnalyticsDashboard['overview'], 'shares'>;
type CockpitDataState = 'good' | 'medium' | 'low';
type RecommendationCockpitCard = {
  id: string;
  title: string;
  metric: string;
  detail: string | null;
  status: CockpitDataState;
  statusLabel: string;
  delta: string;
  hint: string;
  previewPost: AnalyticsPostInsight | null;
  meta: string | null;
  tone: 'positive' | 'warning' | 'neutral';
};

const DATE_PRESETS = [
  { id: '7d', label: '7d' },
  { id: '14d', label: '14d' },
  { id: '28d', label: '28d' },
  { id: '30d', label: '30d' },
  { id: 'custom', label: 'Custom' },
] as const;

const PLATFORM_OPTIONS: Array<{ id: AnalyticsSelectablePlatform; label: string }> = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
];

const KPI_TITLES: Array<{
  key: AnalyticsKpiKey;
  label: string;
}> = [
  { key: 'impressions', label: 'Total Impressions' },
  { key: 'reach', label: 'Total Reach' },
  { key: 'engagements', label: 'Total Engagements' },
  { key: 'engagementRate', label: 'Engagement Rate' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'saves', label: 'Saves' },
  { key: 'newFollowers', label: 'New Followers' },
  { key: 'postsPublished', label: 'Posts Published' },
] as const;

const KPI_TOOLTIPS: Record<AnalyticsKpiKey, string> = {
  impressions:
    'How many total times your posts were shown in this date range. One account can create multiple impressions.',
  reach:
    'How many unique accounts saw your posts at least once in this date range.',
  engagementRate:
    'How efficiently your content performed: total engagements divided by total reach.',
  engagements:
    'The total number of likes, comments, saves, and reactions across your published posts.',
  likes:
    'The total number of likes collected across published posts in this date range.',
  comments:
    'The total number of comments left on your published posts in this date range.',
  saves:
    'The total number of times people saved your posts where the platform provides save data.',
  newFollowers:
    'Net follower growth during this period compared with the previous matching period.',
  postsPublished:
    'How many posts were actually published in this date range, not just scheduled.',
};

const POSTS_PER_PAGE = 10;

const LAST_UPDATED_DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: getUserFacingTimeZone(),
});

const POST_PREVIEW_DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: getUserFacingTimeZone(),
});

const getRelativeLastUpdated = (value: string | null, now = Date.now()) => {
  if (!value) {
    return 'Not analyzed yet';
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return 'Not analyzed yet';
  }

  const diffMs = Math.max(0, now - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return 'Updated just now';
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `Updated ${diffHours} hr ago`;
  }

  return `Updated ${LAST_UPDATED_DATE_FORMATTER.format(new Date(timestamp))}`;
};

const getRelativeLearningUpdated = (value: string | null, now = Date.now()) => {
  const label = getRelativeLastUpdated(value, now);

  if (label === 'Not analyzed yet') {
    return 'Not learned yet';
  }

  if (label === 'Updated just now') {
    return 'Learned just now';
  }

  return label.replace(/^Updated /, 'Learned ');
};

const getPlatformIcon = (platform: string | null) =>
  platform === 'instagram' ? <Instagram size={14} /> : <Facebook size={14} />;

const getLearningPlatformIcon = (platform: string) => {
  const normalized = platform.trim().toLowerCase();

  if (normalized === 'instagram') {
    return <Instagram size={14} />;
  }

  if (normalized === 'facebook') {
    return <Facebook size={14} />;
  }

  return <Sparkles size={14} />;
};

const formatPostType = (value: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Post';

const formatCompactNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return Intl.NumberFormat('en-US', {
    notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(value);
};

const formatPostPreviewDate = (value: string | null | undefined) => {
  if (!value) {
    return 'Publish time not saved';
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return 'Publish time not saved';
  }

  return POST_PREVIEW_DATE_FORMATTER.format(timestamp);
};

const formatPlatformName = (value: string | null) => {
  if (!value) {
    return 'Platform';
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'instagram':
      return 'Instagram';
    case 'facebook':
      return 'Facebook';
    case 'linkedin':
      return 'LinkedIn';
    case 'youtube':
      return 'YouTube';
    case 'reddit':
      return 'Reddit';
    case 'x':
      return 'X';
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
};

const truncateText = (value: string | null | undefined, maxLength: number) => {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';

  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const formatRecommendationAccuracy = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return `${Math.round(value)}% match confidence`;
};

const getCoverageState = (ratio: number): CockpitDataState => {
  if (ratio >= 0.75) {
    return 'good';
  }

  if (ratio >= 0.6) {
    return 'medium';
  }

  return 'low';
};

const getStateLabel = (state: CockpitDataState) => {
  switch (state) {
    case 'good':
      return 'Enough data';
    case 'medium':
      return 'Signal building';
    default:
      return 'Not enough data';
  }
};

const describeBestPostReason = (post: AnalyticsPostInsight) => {
  if (post.shares > 0 || post.saves > 0) {
    if (post.shares >= post.saves) {
      return 'People are sharing this post more than your other recent posts.';
    }

    return 'People are saving this post more than your other recent posts.';
  }

  if (post.comments > 0) {
    return 'It is pulling more comments than your other recent posts.';
  }

  if ((post.engagementRate ?? 0) > 0) {
    return 'It has the strongest overall engagement rate in this view.';
  }

  if (post.reach > 0) {
    return 'It is reaching more people than your other recent posts.';
  }

  if (post.impressions > 0) {
    return 'It is getting the most repeat views so far.';
  }

  return 'It is the strongest post PrixmoAI can confirm right now.';
};

const getBestPostTitle = (post: AnalyticsPostInsight) =>
  `Top ${formatPostType(post.postType).toLowerCase()} post`;

const getBestPostCaptionPreview = (post: AnalyticsPostInsight, maxLength = 78) =>
  post.caption?.trim()
    ? truncateText(post.caption, maxLength)
    : 'No caption saved for this post.';

const AnalyticsPostThumbnail = ({
  post,
  className,
}: {
  post: AnalyticsPostInsight;
  className?: string;
}) => {
  const sources = [post.thumbnailUrl, post.mediaUrl]
    .filter((value, index, array) => array.indexOf(value) === index)
    .filter((value): value is string => Boolean(value));
  const [sourceIndex, setSourceIndex] = useState(0);
  const activeSource = sources[sourceIndex] ?? null;

  useEffect(() => {
    setSourceIndex(0);
  }, [post.id, post.thumbnailUrl, post.mediaUrl]);

  return (
    <div
      className={className}
      role="img"
      aria-label={post.caption || `${formatPostType(post.postType)} preview`}
    >
      {activeSource ? (
        <img
          src={activeSource}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
            setSourceIndex((current) => current + 1);
          }}
        />
      ) : (
        <ImageIcon size={18} />
      )}
    </div>
  );
};

const HOOK_STYLE_HELP: Record<string, { title: string; lines: string[] }> = {
  statement: {
    title: 'What is a statement hook?',
    lines: [
      'A statement hook opens with a clear direct line instead of a question.',
      'Example: “Most brands lose attention in the first 3 seconds.”',
    ],
  },
  'how-to': {
    title: 'What is a how-to hook?',
    lines: [
      'A how-to hook opens by teaching something quickly.',
      'Example: “How to make your posts easier to save.”',
    ],
  },
  question: {
    title: 'What is a question hook?',
    lines: [
      'A question hook starts by asking the audience something.',
      'Example: “Are your posts getting ignored after publishing?”',
    ],
  },
  'number-led': {
    title: 'What is a number-led hook?',
    lines: [
      'A number-led hook starts with a number, list, or count.',
      'Example: “3 caption fixes that lift saves.”',
    ],
  },
  'command-led': {
    title: 'What is a command-led hook?',
    lines: [
      'A command-led hook starts by telling the audience to do something.',
      'Example: “Stop writing captions like this.”',
    ],
  },
  'audience-led': {
    title: 'What is an audience-led hook?',
    lines: [
      'An audience-led hook calls out a specific group first.',
      'Example: “Founders, this post is for you.”',
    ],
  },
};

const formatLearningLabel = (dimension: string, value: string) => {
  const normalizedValue = value.trim().toLowerCase();

  switch (dimension) {
    case 'caption_length':
      return `${value.charAt(0).toUpperCase() + value.slice(1)} captions`;
    case 'hook_style':
      if (normalizedValue === 'unknown') {
        return 'Hook style not detected';
      }
      return `${value.charAt(0).toUpperCase() + value.slice(1)} hooks`;
    case 'cta_style':
      return `${value.charAt(0).toUpperCase() + value.slice(1)} CTAs`;
    case 'hashtag_density':
      return `${value.charAt(0).toUpperCase() + value.slice(1)} hashtag usage`;
    case 'format':
      return `${value.charAt(0).toUpperCase() + value.slice(1)} formats`;
    case 'goal':
      return `${value} goals`;
    case 'tone':
      return `${value} tone`;
    case 'topic':
      return `${value} topics`;
    default:
      return value;
  }
};

const getSortValue = (post: AnalyticsPostInsight, key: string) => {
  switch (key) {
    case 'impressions':
      return post.impressions;
    case 'reach':
      return post.reach;
    case 'likes':
      return post.likes;
    case 'comments':
      return post.comments;
    case 'saves':
      return post.saves;
    case 'engagementRate':
      return post.engagementRate ?? 0;
    case 'date':
      return new Date(post.publishedTime || 0).getTime();
    default:
      return post.performanceScore;
  }
};

const EXPORT_TIME_ZONE = getUserFacingTimeZone();
const EXPORT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: EXPORT_TIME_ZONE,
});

const EXPORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  timeZone: EXPORT_TIME_ZONE,
});

const formatExportDate = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return EXPORT_DATE_FORMATTER.format(date);
};

const formatExportDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return `${EXPORT_DATE_TIME_FORMATTER.format(date)} ${EXPORT_TIME_ZONE}`;
};

const formatExportNumber = (value: number | null | undefined, fractionDigits = 0) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
};

const formatExportPercent = (value: number | null | undefined, fractionDigits = 1) =>
  value === null || value === undefined || Number.isNaN(value)
    ? '—'
    : `${(value * 100).toFixed(fractionDigits)}%`;

const formatExportMetricValue = (
  key: keyof AnalyticsDashboard['overview'],
  value: number | null
) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  return key === 'engagementRate'
    ? formatExportPercent(value)
    : formatExportNumber(value, Number.isInteger(value) ? 0 : 2);
};

const sanitizeExportFileSegment = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'analytics';

const buildAnalyticsExportFileName = (
  dashboard: AnalyticsDashboard | null,
  extension: 'csv' | 'pdf'
) => {
  const scope = sanitizeExportFileSegment(dashboard?.platformScope ?? 'all');
  const start = dashboard?.dateRange.start?.slice(0, 10) ?? 'current';
  const end = dashboard?.dateRange.end?.slice(0, 10) ?? 'view';

  return `prixmoai-analytics-${scope}-${start}-to-${end}.${extension}`;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

type CsvCell = string | number | null | undefined;
type CsvRow = CsvCell[];

const csvEscape = (value: CsvCell) => {
  const normalized =
    value === null || value === undefined
      ? ''
      : String(value).replace(/\r?\n|\r/g, ' ').trim();

  return `"${normalized.replace(/"/g, '""')}"`;
};

const exportAnalyticsCsv = (
  dashboard: AnalyticsDashboard | null,
  posts: AnalyticsPostInsight[]
) => {
  const rows: CsvRow[] = [];
  const addSection = (title: string) => {
    if (rows.length) {
      rows.push([]);
    }

    rows.push([title]);
  };
  const addRows = (nextRows: CsvRow[]) => rows.push(...nextRows);
  const exportedAt = new Date().toISOString();

  addRows([
    ['PrixmoAI Analytics Report'],
    ['Exported At', formatExportDateTime(exportedAt)],
    ['Timezone', EXPORT_TIME_ZONE],
  ]);

  if (dashboard) {
    addRows([
      ['Platform Scope', formatPlatformName(dashboard.platformScope)],
      [
        'Date Range',
        `${formatExportDate(dashboard.dateRange.start)} to ${formatExportDate(
          dashboard.dateRange.end
        )}`,
      ],
      ['Dashboard Last Updated', formatExportDateTime(dashboard.lastUpdatedAt)],
      ['Connected Platforms', dashboard.connectedPlatforms.map(formatPlatformName).join(', ') || '—'],
    ]);

    const overviewRows: CsvRow[] = (
      [
        ...KPI_TITLES,
        { key: 'shares', label: 'Shares' },
      ] as Array<{ key: keyof AnalyticsDashboard['overview']; label: string }>
    ).map(({ key, label }) => {
      const metric = dashboard.overview[key];

      return [
        label,
        formatExportMetricValue(key, metric.value),
        formatExportMetricValue(key, metric.previousValue),
        metric.changePercent !== null ? `${metric.changePercent.toFixed(1)}%` : '—',
        metric.direction,
      ];
    });

    addSection('Overview Metrics');
    addRows([
      ['Metric', 'Current Value', 'Previous Value', 'Change vs Previous', 'Direction'],
      ...overviewRows,
    ]);

    addSection('Learning & Recommendation');
    addRows([
      ['Field', 'Value'],
      ['Learning Ready', dashboard.learning.isReady ? 'Yes' : 'No'],
      ['Posts Considered', dashboard.learning.postsConsidered],
      ['Minimum Posts Required', dashboard.learning.minimumPostsRequired],
      ['Confidence', dashboard.learning.confidence],
      ['Last Learned', formatExportDateTime(dashboard.learning.lastAnalyzedAt)],
      ['Summary', sanitizeLearningCopy(dashboard.learning.summary)],
      ['Recommendation', sanitizeLearningCopy(dashboard.learning.topRecommendation ?? '—')],
      ['Recommendation Reason', sanitizeLearningCopy(dashboard.learning.recommendationReason ?? '—')],
      ['Recommendation Accuracy', dashboard.learning.recommendationAccuracyLabel ?? '—'],
    ]);

    addSection('Winning Patterns');
    addRows([
      ['Dimension', 'Label', 'Sample Size', 'Avg Score', 'Lift', 'Explanation'],
      ...dashboard.learning.profiles.flatMap((profile) =>
        profile.patterns.map((pattern) => [
          profile.platform,
          formatLearningLabel(pattern.dimension, pattern.label),
          pattern.sampleSize,
          pattern.averagePerformanceScore,
          `${(pattern.lift * 100).toFixed(1)}%`,
          sanitizeLearningCopy(pattern.explanation),
        ])
      ),
    ]);

    addSection('Weak Patterns');
    addRows([
      ['Platform', 'Pattern', 'Sample Size', 'Avg Score', 'Lift', 'Explanation'],
      ...dashboard.learning.profiles.flatMap((profile) =>
        profile.weakPatterns.map((pattern) => [
          profile.platform,
          formatLearningLabel(pattern.dimension, pattern.label),
          pattern.sampleSize,
          pattern.averagePerformanceScore,
          `${(pattern.lift * 100).toFixed(1)}%`,
          sanitizeLearningCopy(pattern.explanation),
        ])
      ),
    ]);

    addSection('Best Time To Post');
    addRows([
      ['Field', 'Value'],
      ['Status', dashboard.bestTimeToPost.signalStatus],
      ['Summary', dashboard.bestTimeToPost.summary],
      ['Posts Considered', dashboard.bestTimeToPost.postsConsidered],
      ['Engaged Posts Considered', dashboard.bestTimeToPost.engagedPostsConsidered],
      ['Engagement Coverage', `${dashboard.bestTimeToPost.engagementCoverage.toFixed(1)}%`],
      ['Minimum Posts Required', dashboard.bestTimeToPost.minimumPostsRequired],
    ]);
    addRows([
      [],
      ['Top Slot', 'Day', 'Hour', 'Posts', 'Average Engagement Rate'],
      ...dashboard.bestTimeToPost.topSlots.map((slot, index) => [
        index + 1,
        slot.day,
        `${String(slot.hour).padStart(2, '0')}:00`,
        slot.posts,
        formatExportPercent(slot.averageEngagementRate),
      ]),
    ]);

    addSection('Platform Comparison');
    addRows([
      ['Platform', 'Posts', 'Impressions', 'Reach', 'Engagements', 'Engagement Rate', 'Follower Growth', 'Score'],
      ...dashboard.platformComparison.map((platform) => [
        platform.label,
        platform.posts,
        platform.impressions,
        platform.reach,
        platform.engagements,
        formatExportPercent(platform.engagementRate),
        platform.followerGrowth ?? '—',
        platform.score,
      ]),
    ]);

    addSection('Trend Data');
    addRows([
      ['Date', 'Label', 'Impressions', 'Reach', 'Likes', 'Comments', 'Saves', 'Shares', 'Reactions', 'Engagements'],
      ...dashboard.trends.engagementSeries.map((point) => [
        formatExportDate(point.date),
        point.label,
        point.impressions,
        point.reach,
        point.likes,
        point.comments,
        point.saves,
        point.shares,
        point.reactions,
        point.engagements,
      ]),
    ]);

    addSection('Audience');
    addRows([
      ['Field', 'Value'],
      ['Has Audience Data', dashboard.audience.hasAudienceData ? 'Yes' : 'No'],
      ['Follower Growth', dashboard.audience.followerGrowthValue ?? '—'],
      ['Profile Visits', dashboard.audience.profileVisits],
      ['Page Likes', dashboard.audience.pageLikes],
      ['Best Time Summary', dashboard.audience.bestTimeSummary],
      ['Summary Notes', dashboard.audience.summaryNotes.join(' | ') || '—'],
      ['Top Age Segment', dashboard.audience.ageDistribution[0]?.label ?? '—'],
      ['Top Gender Segment', dashboard.audience.genderDistribution[0]?.label ?? '—'],
      ['Top Location', dashboard.audience.topLocations[0]?.label ?? '—'],
    ]);
  }

  addSection('Post Performance');
  addRows([
    [
      'Platform',
      'Account',
      'Post Type',
      'Published Time',
      'Caption',
      'Impressions',
      'Reach',
      'Likes',
      'Comments',
      'Saves',
      'Shares',
      'Reactions',
      'Engagements',
      'Engagement Rate',
      'Performance Score',
      'Video Plays',
      'Profile Visits',
      'Post Clicks',
      'External Post ID',
      'Media URL',
    ],
    ...posts.map((post) => [
      post.platformLabel,
      post.socialAccountName ?? '—',
      formatPostType(post.postType),
      formatExportDateTime(post.publishedTime),
      post.caption ?? '',
      post.impressions,
      post.reach,
      post.likes,
      post.comments,
      post.saves,
      post.shares,
      post.reactions,
      post.engagements,
      formatExportPercent(post.engagementRate),
      post.performanceScore.toFixed(4),
      post.videoPlays,
      post.profileVisits,
      post.postClicks,
      post.postExternalId ?? '—',
      post.mediaUrl ?? '—',
    ]),
  ]);

  const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}`;

  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    buildAnalyticsExportFileName(dashboard, 'csv')
  );
};

const hasMeaningfulPostSignal = (post: AnalyticsPostInsight) =>
  post.performanceScore > 0 ||
  post.impressions > 0 ||
  post.reach > 0 ||
  post.engagements > 0 ||
  post.likes > 0 ||
  post.comments > 0 ||
  post.saves > 0 ||
  post.shares > 0;

type PdfCell = string | number | null | undefined;
type PdfTableRow = PdfCell[];

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_MARGIN_X = 42;
const PDF_MARGIN_TOP = 46;
const PDF_MARGIN_BOTTOM = 46;

const toPdfText = (value: PdfCell, fallback = '') =>
  (value === null || value === undefined ? fallback : String(value))
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapePdfString = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const wrapPdfText = (value: PdfCell, width: number, fontSize: number) => {
  const text = toPdfText(value, '—');
  const maxChars = Math.max(8, Math.floor(width / (fontSize * 0.52)));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxChars) {
      current = next;
      return;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length > maxChars) {
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      current = '';
      return;
    }

    current = word;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : ['—'];
};

const buildPdfBlob = (pageCommands: string[][]) => {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  pageCommands.forEach((commands) => {
    const stream = commands.join('\n');
    const contentObjectId = objects.length + 1;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

    const pageObjectId = objects.length + 1;
    pageObjectIds.push(pageObjectId);
    objects.push(
      [
        '<< /Type /Page',
        '/Parent 2 0 R',
        `/MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}]`,
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>',
        `/Contents ${contentObjectId} 0 R`,
        '>>',
      ].join(' ')
    );
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
};

const exportAnalyticsPdf = (
  dashboard: AnalyticsDashboard | null,
  posts: AnalyticsPostInsight[]
) => {
  const pages: string[][] = [[]];
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN_TOP;

  const currentPage = () => pages[pages.length - 1];

  const addPage = () => {
    pages.push([]);
    y = PDF_PAGE_HEIGHT - PDF_MARGIN_TOP;
  };

  const ensureSpace = (height: number) => {
    if (y - height < PDF_MARGIN_BOTTOM) {
      addPage();
    }
  };

  const addText = (
    value: PdfCell,
    {
      x = PDF_MARGIN_X,
      width = PDF_PAGE_WIDTH - PDF_MARGIN_X * 2,
      fontSize = 10,
      lineHeight = fontSize + 4,
      bold = false,
      color = '0.12 0.16 0.22',
      before = 0,
      after = 0,
      maxLines = Infinity,
    }: {
      x?: number;
      width?: number;
      fontSize?: number;
      lineHeight?: number;
      bold?: boolean;
      color?: string;
      before?: number;
      after?: number;
      maxLines?: number;
    } = {}
  ) => {
    const lines = wrapPdfText(value, width, fontSize);
    const visibleLines =
      lines.length > maxLines
        ? [...lines.slice(0, Math.max(0, maxLines - 1)), `${lines[maxLines - 1]}...`]
        : lines;
    ensureSpace(before + visibleLines.length * lineHeight + after);
    y -= before;
    visibleLines.forEach((line) => {
      currentPage().push(
        `BT /${bold ? 'F2' : 'F1'} ${fontSize} Tf ${color} rg ${x} ${y} Td (${escapePdfString(
          line
        )}) Tj ET`
      );
      y -= lineHeight;
    });
    y -= after;
  };

  const addRule = () => {
    ensureSpace(12);
    currentPage().push(
      `0.83 0.88 0.95 RG ${PDF_MARGIN_X} ${y} m ${
        PDF_PAGE_WIDTH - PDF_MARGIN_X
      } ${y} l S`
    );
    y -= 12;
  };

  const addSectionTitle = (title: string) => {
    addText(title.toUpperCase(), {
      fontSize: 10,
      lineHeight: 13,
      bold: true,
      color: '0.05 0.45 0.63',
      before: 14,
      after: 4,
    });
  };

  const addTable = (
    headers: string[],
    rows: PdfTableRow[],
    widths: number[],
    options: { fontSize?: number; maxLines?: number } = {}
  ) => {
    const fontSize = options.fontSize ?? 8;
    const lineHeight = fontSize + 3;
    const cellPadding = 5;
    const maxLines = options.maxLines ?? 3;
    const tableWidth = widths.reduce((sum, width) => sum + width, 0);

    const drawRow = (cells: PdfTableRow, isHeader = false) => {
      const wrappedCells = cells.map((cell, index) =>
        wrapPdfText(cell, widths[index] - cellPadding * 2, fontSize).slice(
          0,
          isHeader ? 1 : maxLines
        )
      );
      const rowHeight =
        Math.max(...wrappedCells.map((lines) => lines.length)) * lineHeight +
        cellPadding * 2;
      ensureSpace(rowHeight + 2);

      if (isHeader) {
        currentPage().push(
          `0.90 0.95 0.98 rg ${PDF_MARGIN_X} ${y - rowHeight + 3} ${tableWidth} ${rowHeight} re f`
        );
      }

      let x = PDF_MARGIN_X;
      wrappedCells.forEach((lines, cellIndex) => {
        currentPage().push(
          `0.83 0.88 0.95 RG ${x} ${y - rowHeight + 3} ${widths[cellIndex]} ${rowHeight} re S`
        );
        lines.forEach((line, lineIndex) => {
          currentPage().push(
            `BT /${isHeader ? 'F2' : 'F1'} ${fontSize} Tf ${
              isHeader ? '0.09 0.14 0.22' : '0.22 0.26 0.34'
            } rg ${x + cellPadding} ${
              y - cellPadding - fontSize - lineIndex * lineHeight
            } Td (${escapePdfString(line)}) Tj ET`
          );
        });
        x += widths[cellIndex];
      });

      y -= rowHeight;
    };

    drawRow(headers, true);
    rows.forEach((row) => drawRow(row));
    y -= 4;
  };

  const exportedAt = new Date().toISOString();
  addText('PrixmoAI Analytics Report', {
    fontSize: 20,
    lineHeight: 25,
    bold: true,
    color: '0.06 0.12 0.20',
    after: 4,
  });
  addText(`Exported ${formatExportDateTime(exportedAt)}`, {
    fontSize: 9,
    lineHeight: 12,
    color: '0.38 0.44 0.54',
  });

  if (dashboard) {
    addText(
      `${formatPlatformName(dashboard.platformScope)} scope | ${formatExportDate(
        dashboard.dateRange.start
      )} to ${formatExportDate(dashboard.dateRange.end)} | Last updated ${formatExportDateTime(
        dashboard.lastUpdatedAt
      )}`,
      { fontSize: 9, lineHeight: 12, color: '0.38 0.44 0.54', after: 2 }
    );
  }
  addRule();

  if (dashboard) {
    addSectionTitle('Overview Metrics');
    addTable(
      ['Metric', 'Current', 'Previous', 'Change'],
      (
        [
          ...KPI_TITLES,
          { key: 'shares', label: 'Shares' },
        ] as Array<{ key: keyof AnalyticsDashboard['overview']; label: string }>
      ).map(({ key, label }) => {
        const metric = dashboard.overview[key];

        return [
          label,
          formatExportMetricValue(key, metric.value),
          formatExportMetricValue(key, metric.previousValue),
          metric.changePercent !== null ? `${metric.changePercent.toFixed(1)}%` : '—',
        ];
      }),
      [180, 110, 110, 110],
      { fontSize: 8.5, maxLines: 2 }
    );

    addSectionTitle('Learning & Recommendation');
    addTable(
      ['Field', 'Value'],
      [
        ['Confidence', dashboard.learning.confidence],
        ['Posts analyzed', dashboard.learning.postsConsidered],
        ['Last learned', formatExportDateTime(dashboard.learning.lastAnalyzedAt)],
        ['Recommendation', sanitizeLearningCopy(dashboard.learning.topRecommendation ?? '—')],
        ['Reason', sanitizeLearningCopy(dashboard.learning.recommendationReason ?? '—')],
        ['Accuracy', dashboard.learning.recommendationAccuracyLabel ?? '—'],
      ],
      [145, 365],
      { fontSize: 8.5, maxLines: 4 }
    );

    addSectionTitle('Best Time To Post');
    addTable(
      ['Field', 'Value'],
      [
        ['Status', dashboard.bestTimeToPost.signalStatus],
        ['Summary', dashboard.bestTimeToPost.summary],
        ['Posts considered', dashboard.bestTimeToPost.postsConsidered],
        ['Engaged posts', dashboard.bestTimeToPost.engagedPostsConsidered],
        ['Engagement coverage', `${dashboard.bestTimeToPost.engagementCoverage.toFixed(1)}%`],
      ],
      [145, 365],
      { fontSize: 8.5, maxLines: 4 }
    );

    if (dashboard.bestTimeToPost.topSlots.length) {
      addTable(
        ['Rank', 'Day', 'Time', 'Posts', 'Avg engagement'],
        dashboard.bestTimeToPost.topSlots.slice(0, 10).map((slot, index) => [
          index + 1,
          slot.day,
          `${String(slot.hour).padStart(2, '0')}:00`,
          slot.posts,
          formatExportPercent(slot.averageEngagementRate),
        ]),
        [58, 112, 112, 86, 142],
        { fontSize: 8.5, maxLines: 2 }
      );
    }

    addSectionTitle('Platform Snapshot');
    addTable(
      ['Platform', 'Posts', 'Impressions', 'Reach', 'Engagement rate', 'Score'],
      dashboard.platformComparison.map((platform) => [
        platform.label,
        platform.posts,
        formatExportNumber(platform.impressions),
        formatExportNumber(platform.reach),
        formatExportPercent(platform.engagementRate),
        formatExportNumber(platform.score, 2),
      ]),
      [92, 62, 96, 92, 118, 50],
      { fontSize: 8.5, maxLines: 2 }
    );

    addSectionTitle('Audience');
    addTable(
      ['Field', 'Value'],
      [
        ['Follower growth', dashboard.audience.followerGrowthValue ?? '—'],
        ['Profile visits', dashboard.audience.profileVisits],
        ['Top audience', dashboard.audience.ageDistribution[0]?.label ?? '—'],
        ['Top location', dashboard.audience.topLocations[0]?.label ?? '—'],
        ['Notes', dashboard.audience.summaryNotes.join(' | ') || '—'],
      ],
      [145, 365],
      { fontSize: 8.5, maxLines: 4 }
    );
  }

  addSectionTitle('Post Performance');
  if (!posts.length) {
    addText('No posts are available in the current analytics view.', {
      fontSize: 10,
      lineHeight: 14,
      color: '0.38 0.44 0.54',
    });
  } else {
    addTable(
      [
        'Platform',
        'Account',
        'Published',
        'Caption',
        'Impr.',
        'Reach',
        'Likes',
        'Com.',
        'Saves',
        'Shares',
        'ER',
      ],
      posts.map((post) => [
        post.platformLabel,
        post.socialAccountName ?? '—',
        formatExportDateTime(post.publishedTime),
        post.caption ?? '—',
        post.impressions,
        post.reach,
        post.likes,
        post.comments,
        post.saves,
        post.shares,
        formatExportPercent(post.engagementRate),
      ]),
      [54, 58, 76, 114, 36, 36, 32, 32, 34, 36, 42],
      { fontSize: 7.2, maxLines: 3 }
    );
  }

  pages.forEach((commands, index) => {
    commands.push(
      `BT /F1 8 Tf 0.45 0.50 0.58 rg ${PDF_MARGIN_X} 28 Td (${escapePdfString(
        `PrixmoAI Analytics | Page ${index + 1} of ${pages.length}`
      )}) Tj ET`
    );
  });

  downloadBlob(buildPdfBlob(pages), buildAnalyticsExportFileName(dashboard, 'pdf'));
};

const AnalyticsSkeleton = () => (
  <div className="analytics-dashboard">
    <div className="analytics-dashboard__hero analytics-dashboard__hero--skeleton" />
    <div className="analytics-kpi-grid">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className="analytics-skeleton analytics-skeleton--card" />
      ))}
    </div>
    <div className="analytics-chart-grid">
      <div className="analytics-skeleton analytics-skeleton--chart" />
      <div className="analytics-skeleton analytics-skeleton--chart" />
    </div>
    <div className="analytics-skeleton analytics-skeleton--table" />
  </div>
);

const AnalyticsUnlockPanel = ({
  title,
  description,
  progressLabel,
}: {
  title: string;
  description: string;
  progressLabel: string;
}) => (
  <Card className="analytics-panel analytics-panel--compact analytics-panel--insight-banner analytics-panel--neutral">
    <div className="analytics-panel__header">
      <div>
        <p className="section-eyebrow">Better analytics</p>
        <h3>{title}</h3>
      </div>
    </div>
    <div className="analytics-blank-state analytics-blank-state--panel">
      {description}
    </div>
    <div className="analytics-insight-banner__meta">
      <AnalyticsInfoChip
        tooltipTitle="Progress"
        tooltipLines={[
          'This counts published scheduler posts in this analytics view.',
          'Better analytics unlock after 6 posts.',
        ]}
      >
        {progressLabel}
      </AnalyticsInfoChip>
      <AnalyticsInfoChip
        tooltipTitle="What is live now"
        tooltipLines={[
          'Basic metrics are already live below.',
          'Likes, comments, saves, reach, impressions, and engagement still keep updating.',
        ]}
      >
        Post performance basics are already live below
      </AnalyticsInfoChip>
    </div>
  </Card>
);

const sanitizeLearningCopy = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }

  const normalized = value.trim();

  if (!normalized) {
    return '';
  }

  if (/lean into unknown hooks next/i.test(normalized)) {
    return 'Try a few different opening lines next so PrixmoAI can find what works best for your brand.';
  }

  const recommendationMatch = normalized.match(
    /^Lean into (.+?) next, because they are outperforming the current (.+?) baseline for this brand\.?$/i
  );

  if (recommendationMatch) {
    const label = recommendationMatch[1].trim();
    const platform = recommendationMatch[2].trim();
    const easyLabel = sanitizeLearningCopy(label);

    if (/hook/i.test(easyLabel) && /unclear|not clearly detected/i.test(easyLabel)) {
      return `Try a few different opening lines next. Posts without a clear opening style are doing better than your usual ${platform} results.`;
    }

    return `Try more ${easyLabel} next. They are doing better than your usual ${platform} results.`;
  }

  return normalized
    .replace(/\bunknown hooks\b/gi, 'hooks that are not clearly detected yet')
    .replace(
      /posts where the opening hook could not be clearly detected for this brand/gi,
      'posts with mixed opening lines for this brand'
    )
    .replace(
      /opening hook could not be clearly detected/gi,
      'opening line style is still mixed'
    )
    .replace(
      /posts where PrixmoAI could not clearly detect the opening hook/gi,
      'posts with different opening lines'
    )
    .replace(
      /posts where the opening hook could not be clearly detected/gi,
      'posts with different opening lines'
    )
    .replace(/Hook style not detected/gi, 'Hook style still unclear')
    .replace(/\bLean into\b/gi, 'Try')
    .replace(
      /Keep testing instagram posts with a consistent cadence so PrixmoAI can lock onto a stronger winner for this brand\./gi,
      'Need a few more strong posts before PrixmoAI can suggest the next post with confidence.'
    );
};

const AnalyticsInfoChip = ({
  children,
  tooltipTitle,
  tooltipLines,
  accent = false,
  actionIcon,
  actionLabel,
  onAction,
}: {
  children: React.ReactNode;
  tooltipTitle?: string;
  tooltipLines?: string[];
  accent?: boolean;
  actionIcon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) => {
  const hasTooltip = Boolean(tooltipLines?.length);
  const hasAction = Boolean(actionIcon && onAction);

  return (
    <span
      className={`analytics-learning-chip ${accent ? 'analytics-learning-chip--confidence' : ''} ${
        hasTooltip ? 'analytics-learning-chip--has-tooltip' : ''
      }`}
      tabIndex={hasTooltip ? 0 : undefined}
      aria-label={
        hasTooltip ? `${tooltipTitle ?? 'Details'}. ${tooltipLines?.join(' ')}` : undefined
      }
    >
      <span>{children}</span>
      {hasAction ? (
        <button
          type="button"
          className="analytics-learning-chip__action"
          aria-label={actionLabel ?? 'Refresh'}
          title={actionLabel ?? 'Refresh'}
          onClick={(event) => {
            event.stopPropagation();
            onAction?.();
          }}
        >
          {actionIcon}
        </button>
      ) : null}
      {hasTooltip ? (
        <span className="analytics-learning-chip__tooltip" role="tooltip">
          <strong>{tooltipTitle ?? 'Details'}</strong>
          {tooltipLines?.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      ) : null}
    </span>
  );
};

const AnalyticsConfidenceChip = ({
  confidence,
}: {
  confidence: string;
}) => (
  <AnalyticsInfoChip
    accent
    tooltipTitle="Confidence guide"
    tooltipLines={[
      'Low: learning is not ready yet.',
      'Medium: 6 to 11 published posts are in this view.',
      'High: 12 or more published posts are in this view.',
    ]}
  >
    {confidence} confidence
  </AnalyticsInfoChip>
);

const InlineTooltipIcon = ({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) => (
  <span className="analytics-inline-tooltip" tabIndex={0} aria-label={`${title}. ${lines.join(' ')}`}>
    <CircleHelp size={13} />
    <span className="analytics-inline-tooltip__panel" role="tooltip">
      <strong>{title}</strong>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  </span>
);

const LearningPatternTitle = ({
  dimension,
  label,
}: {
  dimension: string;
  label: string;
}) => {
  const help = dimension === 'hook_style' ? HOOK_STYLE_HELP[label.trim().toLowerCase()] : null;

  return (
    <span className="analytics-learning-pattern__title">
      <span>{formatLearningLabel(dimension, label)}</span>
      {help ? <InlineTooltipIcon title={help.title} lines={help.lines} /> : null}
    </span>
  );
};

const AnalyticsMetricInfoCard = ({
  label,
  value,
  tooltipTitle,
  tooltipLines,
}: {
  label: string;
  value: string;
  tooltipTitle: string;
  tooltipLines: string[];
}) => (
  <article className="analytics-learning-metric analytics-learning-metric--has-tooltip" tabIndex={0}>
    <span>{label}</span>
    <strong>{value}</strong>
    <span className="analytics-learning-metric__tooltip" role="tooltip">
      <strong>{tooltipTitle}</strong>
      {tooltipLines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  </article>
);

export const AnalyticsPage = () => {
  const [preset, setPreset] = useState<'7d' | '14d' | '28d' | '30d' | 'custom'>('30d');
  const [platformScope, setPlatformScope] = useState<AnalyticsSelectablePlatform>('instagram');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [postTypeFilter, setPostTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState('performanceScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedPost, setSelectedPost] = useState<AnalyticsPostInsight | null>(null);
  const [audienceExpanded, setAudienceExpanded] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [emptyPlatformModal, setEmptyPlatformModal] = useState<AnalyticsSelectablePlatform | null>(null);
  const [platformProbeInFlight, setPlatformProbeInFlight] = useState<AnalyticsSelectablePlatform | null>(null);
  const [learningPlatform, setLearningPlatform] = useState<string | null>(null);

  const {
    dashboard,
    isLoading,
    isRefreshing,
    isLearningRefreshing,
    lastUpdatedTime,
    error,
    refresh,
    previewDashboard,
    getCachedDashboard,
  } =
    useAnalyticsDashboard({
    preset,
    platform: platformScope,
    start: customStart,
    end: customEnd,
  });
  const [relativeTimestampNow, setRelativeTimestampNow] = useState(() => Date.now());

  const scopedPosts = useMemo(
    () => dashboard?.posts ?? [],
    [dashboard?.posts]
  );

  const supportedPostTypes = useMemo(
    () =>
      [
        ...new Set(
          scopedPosts
            .map((post) => post.postType)
            .filter((postType): postType is string => Boolean(postType))
        ),
      ].sort(),
    [scopedPosts]
  );

  useEffect(() => {
    if (postTypeFilter !== 'all' && !supportedPostTypes.includes(postTypeFilter)) {
      setPostTypeFilter('all');
    }
  }, [postTypeFilter, supportedPostTypes]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRelativeTimestampNow(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setPostsPage(1);
  }, [searchQuery, postTypeFilter, sortKey, sortDirection, dashboard?.platformScope, dashboard?.dateRange.start, dashboard?.dateRange.end]);

  useEffect(() => {
    if (!dashboard?.connectedPlatforms.length) {
      return;
    }

    const availablePlatforms = dashboard.connectedPlatforms.filter(
      (platform): platform is AnalyticsSelectablePlatform =>
        platform === 'instagram' || platform === 'facebook'
    );

    if (!availablePlatforms.includes(platformScope) && availablePlatforms[0]) {
      setPlatformScope(availablePlatforms[0]);
    }
  }, [dashboard?.connectedPlatforms, platformScope]);

  const filteredPosts = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return [...scopedPosts]
      .filter((post) =>
        postTypeFilter === 'all' ? true : (post.postType || 'post') === postTypeFilter
      )
      .filter((post) =>
        normalizedSearch
          ? `${post.caption || ''} ${post.keywords.join(' ')} ${post.platformLabel}`
              .toLowerCase()
              .includes(normalizedSearch)
          : true
      )
      .sort((left, right) => {
        const leftValue = getSortValue(left, sortKey);
        const rightValue = getSortValue(right, sortKey);

        if (leftValue === rightValue) {
          return 0;
        }

        return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      });
  }, [postTypeFilter, scopedPosts, searchQuery, sortDirection, sortKey]);

  const totalPostPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
  const paginatedPosts = useMemo(
    () =>
      filteredPosts.slice(
        (postsPage - 1) * POSTS_PER_PAGE,
        postsPage * POSTS_PER_PAGE
      ),
    [filteredPosts, postsPage]
  );

  useEffect(() => {
    if (postsPage > totalPostPages) {
      setPostsPage(totalPostPages);
    }
  }, [postsPage, totalPostPages]);

  const availablePlatforms = useMemo(
    () =>
      new Set(
        (dashboard?.connectedPlatforms ?? []).filter(
          (platform): platform is AnalyticsSelectablePlatform =>
            platform === 'instagram' || platform === 'facebook'
        )
      ),
    [dashboard?.connectedPlatforms]
  );
  const activePlatformLabel =
    platformScope === 'instagram' ? 'Instagram' : 'Facebook';
  const visibleInsights = useMemo(
    () => (dashboard?.insights ?? []).filter((insight) => insight.id !== 'best-platform'),
    [dashboard?.insights]
  );
  const learningProfiles = useMemo(
    () => dashboard?.learning.profiles ?? [],
    [dashboard?.learning.profiles]
  );
  const learningIsReady = dashboard?.learning.isReady ?? false;
  const learningMinimumPosts = dashboard?.learning.minimumPostsRequired ?? 6;
  const learningPostsConsidered = dashboard?.learning.postsConsidered ?? 0;
  const learningPostsRemaining = Math.max(
    learningMinimumPosts - learningPostsConsidered,
    0
  );
  const selectedPlatformUnavailable =
    dashboard?.connectedPlatforms.length
      ? !availablePlatforms.has(platformScope)
      : false;
  const relativeLastUpdatedLabel = useMemo(
    () => getRelativeLastUpdated(lastUpdatedTime, relativeTimestampNow),
    [lastUpdatedTime, relativeTimestampNow]
  );
  const relativeLearningUpdatedLabel = useMemo(
    () => {
      if (!learningIsReady) {
        return `Unlocks at ${learningMinimumPosts} posts`;
      }

      return dashboard?.learning.lastAnalyzedAt
        ? getRelativeLearningUpdated(
            dashboard.learning.lastAnalyzedAt,
            relativeTimestampNow
          )
        : 'Waiting for next learning refresh';
    },
    [
      dashboard?.learning.lastAnalyzedAt,
      learningIsReady,
      learningMinimumPosts,
      relativeTimestampNow,
    ]
  );

  useEffect(() => {
    if (!learningProfiles.length) {
      if (learningPlatform !== null) {
        setLearningPlatform(null);
      }
      return;
    }

    if (
      !learningPlatform ||
      !learningProfiles.some((profile) => profile.platform === learningPlatform)
    ) {
      setLearningPlatform(learningProfiles[0].platform);
    }
  }, [learningPlatform, learningProfiles]);

  const activeLearningProfile = useMemo(
    () =>
      learningProfiles.find((profile) => profile.platform === learningPlatform) ??
      learningProfiles[0] ??
      null,
    [learningPlatform, learningProfiles]
  );
  const activeLearningPatterns = useMemo(
    () =>
      (activeLearningProfile?.patterns ?? []).filter(
        (pattern) =>
          !(
            pattern.dimension === 'hook_style' &&
            pattern.label.trim().toLowerCase() === 'unknown'
          )
      ),
    [activeLearningProfile?.patterns]
  );
  const activeWeakPatterns = useMemo(
    () =>
      (activeLearningProfile?.weakPatterns ?? []).filter(
        (pattern) =>
          !(
            pattern.dimension === 'hook_style' &&
            pattern.label.trim().toLowerCase() === 'unknown'
          )
      ),
    [activeLearningProfile?.weakPatterns]
  );
  const activeLearningMetrics = activeLearningProfile?.metrics ?? {};
  const activeLearningWinningGoal = useMemo(() => {
    const winningGoals = activeLearningProfile?.analyticsContext.winningGoals;
    return Array.isArray(winningGoals) && typeof winningGoals[0] === 'string'
      ? winningGoals[0]
      : null;
  }, [activeLearningProfile?.analyticsContext.winningGoals]);
  const activeLearningWinningTone = useMemo(() => {
    const winningTones = activeLearningProfile?.analyticsContext.winningTones;
    return Array.isArray(winningTones) && typeof winningTones[0] === 'string'
      ? winningTones[0]
      : null;
  }, [activeLearningProfile?.analyticsContext.winningTones]);
  const activeLearningWinningFormat = useMemo(() => {
    const formatPattern = activeLearningPatterns.find(
      (pattern) => pattern.dimension === 'format'
    );
    return formatPattern?.label ?? null;
  }, [activeLearningPatterns]);
  const activeLearningTopPost = useMemo(() => {
    if (!activeLearningProfile) {
      return null;
    }

    return (
      dashboard?.posts.find(
        (post) =>
          hasMeaningfulPostSignal(post) &&
          Boolean(post.contentId) &&
          activeLearningProfile.topContentIds.includes(post.contentId as string)
      ) ??
      dashboard?.posts.find(
        (post) =>
          hasMeaningfulPostSignal(post) &&
          post.platform?.toLowerCase() === activeLearningProfile.platform.toLowerCase()
      ) ??
      null
    );
  }, [activeLearningProfile, dashboard?.posts]);
  const postsAnalyzedCount = learningPostsConsidered;
  const learningProgressPercent =
    learningMinimumPosts && learningPostsConsidered > 0
      ? Math.min(
          100,
          Math.round(
            ((Math.min(learningPostsConsidered, learningMinimumPosts) /
              learningMinimumPosts) *
              100)
          )
        )
      : 0;
  const bestTimeSignalReady = Boolean(
    learningIsReady && dashboard?.bestTimeToPost.hasEnoughData
  );
  const bestFormatPattern = useMemo(
    () => activeLearningPatterns.find((pattern) => pattern.dimension === 'format') ?? null,
    [activeLearningPatterns]
  );
  const topRecommendationReason = useMemo(
    () => {
      if (!learningIsReady) {
        return sanitizeLearningCopy(
          dashboard?.learning.missingDataMessage ??
            `Publish ${learningMinimumPosts} posts to unlock learned recommendations.`
        );
      }

      return sanitizeLearningCopy(
        dashboard?.learning.recommendationReason ??
          activeLearningPatterns[0]?.explanation ??
          activeWeakPatterns[0]?.explanation ??
          (activeLearningTopPost
            ? `${formatPlatformName(activeLearningTopPost.platform)} ${formatPostType(
                activeLearningTopPost.postType
              ).toLowerCase()} is currently the clearest signal in this view.`
            : null) ??
          dashboard?.bestTimeToPost.summary ??
          'PrixmoAI is still gathering enough evidence to explain this recommendation more confidently.'
      );
    },
    [
      activeLearningPatterns,
      activeWeakPatterns,
      activeLearningTopPost,
      dashboard?.learning.missingDataMessage,
      dashboard?.learning.recommendationReason,
      dashboard?.bestTimeToPost.summary,
      learningIsReady,
      learningMinimumPosts,
    ]
  );
  const recommendationAccuracyLabel = useMemo(
    () => formatRecommendationAccuracy(dashboard?.learning.recommendationAccuracy),
    [dashboard?.learning.recommendationAccuracy]
  );
  const whatDataIsMissing = useMemo(() => {
    if (!dashboard) {
      return 'Analytics data has not loaded yet.';
    }

    if (!learningIsReady) {
      return (
        dashboard.learning.missingDataMessage ??
        `Post ${learningMinimumPosts} published posts so PrixmoAI can learn safely.`
      );
    }

    if (!dashboard.bestTimeToPost.hasEnoughData) {
      return dashboard.bestTimeToPost.summary;
    }

    if (!activeLearningPatterns.length) {
      return 'More winning and weak patterns will appear after more posts are analyzed.';
    }

    return 'Current learning coverage is healthy for this platform.';
  }, [
    activeLearningPatterns.length,
    dashboard,
    learningIsReady,
    learningMinimumPosts,
  ]);
  const recommendationCockpitCards = useMemo<RecommendationCockpitCard[]>(() => {
    if (!dashboard) {
      return [];
    }

    const topPost = activeLearningTopPost;
    const growthMetric = dashboard.overview.newFollowers;
    const bestFormatCoverage =
      bestFormatPattern?.sampleSize && postsAnalyzedCount > 0
        ? bestFormatPattern.sampleSize / postsAnalyzedCount
        : 0;
    const bestFormatState = learningIsReady
      ? bestFormatPattern
        ? getCoverageState(bestFormatCoverage)
        : ('low' as const)
      : ('low' as const);
    const bestFormatStatus = learningIsReady
      ? bestFormatPattern
        ? getStateLabel(bestFormatState)
        : 'Not enough data'
      : 'Not enough data';
    const bestTimeSignalStatus = dashboard.bestTimeToPost.signalStatus;
    const bestTimeState: CockpitDataState = !learningIsReady
      ? 'low'
      : bestTimeSignalReady
        ? 'good'
        : bestTimeSignalStatus === 'no-engagement' ||
            bestTimeSignalStatus === 'not-enough-posts'
          ? 'low'
          : 'medium';
    const growthState: CockpitDataState =
      growthMetric.direction === 'up'
        ? 'good'
        : growthMetric.direction === 'flat'
          ? 'medium'
          : 'low';

    return [
      {
        id: 'best-post',
        title: 'Best post',
        metric: topPost ? getBestPostTitle(topPost) : 'No best post yet',
        detail: topPost ? getBestPostCaptionPreview(topPost, 82) : null,
        status: topPost ? 'good' : 'low',
        statusLabel: topPost ? 'Enough data' : 'Not enough data',
        delta: topPost
          ? `${formatCompactNumber(topPost.impressions)} impressions`
          : 'Keep posting more content to unlock a best post.',
        hint: topPost
          ? describeBestPostReason(topPost)
          : 'Keep posting more content and PrixmoAI will show the strongest post here.',
        previewPost: topPost,
        meta: topPost
          ? `${formatPlatformName(topPost.platform)} • ${formatPostPreviewDate(
              topPost.publishedTime
            )}`
          : null,
        tone: topPost ? ('positive' as const) : ('warning' as const),
      },
      {
        id: 'best-format',
        title: 'Best format',
        metric: learningIsReady
          ? activeLearningWinningFormat ?? 'Format signal forming'
          : 'Format signal forming',
        detail: null,
        status: bestFormatState,
        statusLabel: bestFormatStatus,
        delta: bestFormatPattern
          ? `${bestFormatPattern.sampleSize} posts sampled • ${Math.round(
              bestFormatCoverage * 100
            )}% coverage`
          : !learningIsReady
            ? `${learningPostsRemaining} more posts needed`
            : 'No clear format winner yet',
        hint:
          bestFormatPattern
            ? `This format has the strongest overall response for this brand right now.`
            : !learningIsReady
              ? 'Post more tracked content so PrixmoAI can compare your formats safely.'
              : 'PrixmoAI needs a stronger format gap before it can name one clear winner.',
        previewPost: null,
        meta: null,
        tone:
          bestFormatState === 'good'
            ? ('positive' as const)
            : bestFormatState === 'medium'
              ? ('neutral' as const)
              : ('warning' as const),
      },
      {
        id: 'best-time',
        title: 'Best time',
        metric: bestTimeSignalReady
          ? dashboard.bestTimeToPost.topSlots[0]
            ? `${dashboard.bestTimeToPost.topSlots[0].day} ${String(
                dashboard.bestTimeToPost.topSlots[0].hour
              ).padStart(2, '0')}:00`
            : 'Emerging'
          : learningIsReady
            ? 'Timing signal forming'
            : `${learningPostsConsidered} of ${learningMinimumPosts} collected`,
        detail: null,
        status: bestTimeState,
        statusLabel: getStateLabel(bestTimeState),
        delta: bestTimeSignalReady
          ? `${formatPercentage(
              dashboard.bestTimeToPost.topSlots[0]?.averageEngagementRate ?? 0
            )} avg engagement`
          : learningIsReady
            ? bestTimeSignalStatus === 'no-engagement'
              ? 'No engaged posts yet'
              : bestTimeSignalStatus === 'low-engagement-coverage'
                ? `${Math.round(
                    dashboard.bestTimeToPost.engagementCoverage * 100
                  )}% of posts have engagement`
                : dashboard.bestTimeToPost.summary
            : `${learningPostsRemaining} more posts needed`,
        hint: bestTimeSignalReady
          ? 'This time slot is giving your posts the best average response so far.'
          : learningIsReady
            ? dashboard.bestTimeToPost.summary
            : 'Post more tracked content so PrixmoAI can learn your best posting time.',
        previewPost: null,
        meta: null,
        tone: bestTimeSignalReady
          ? ('positive' as const)
          : learningIsReady
            ? ('neutral' as const)
            : ('warning' as const),
      },
      {
        id: 'growth-trend',
        title: 'Growth trend',
        metric:
          dashboard.audience.followerGrowthValue !== null
            ? `${formatCompactNumber(dashboard.audience.followerGrowthValue)} followers`
            : 'No follower baseline yet',
        detail: null,
        status: growthState,
        statusLabel:
          growthMetric.direction === 'up'
            ? 'Enough data'
            : growthMetric.direction === 'flat'
              ? 'Signal building'
              : 'Not enough data',
        delta:
          growthMetric.changePercent !== null
            ? `${growthMetric.changePercent > 0 ? '+' : ''}${growthMetric.changePercent.toFixed(1)}% vs previous period`
            : 'Need a previous baseline',
        hint:
          growthMetric.direction === 'up'
            ? 'Audience momentum is improving. Keep reinforcing the content themes that are already landing.'
            : growthMetric.direction === 'down'
              ? 'Growth has softened. Try stronger hooks, clearer value, and tighter timing.'
              : 'Follower growth is still too early or too flat to call confidently.',
        previewPost: null,
        meta: null,
        tone:
          growthMetric.direction === 'up'
            ? ('positive' as const)
            : growthMetric.direction === 'down'
              ? ('warning' as const)
              : ('neutral' as const),
      },
    ];
  }, [
    activeLearningTopPost,
    activeLearningWinningFormat,
    bestFormatPattern,
    dashboard,
    learningMinimumPosts,
    learningPostsConsidered,
    learningPostsRemaining,
    learningIsReady,
    bestTimeSignalReady,
    postsAnalyzedCount,
  ]);
  const advancedAnalyticsUnlockTitle = `Better analytics unlock after ${learningMinimumPosts} scheduler-posted posts.`;
  const advancedAnalyticsUnlockDescription = `PrixmoAI needs at least ${learningMinimumPosts} published posts from Scheduler in this selected analytics view before it enables trend charts, timing recommendations, audience breakdowns, and deeper strategy insights with stronger confidence.`;
  const advancedAnalyticsProgressLabel = `${learningPostsConsidered} of ${learningMinimumPosts} posts collected`;
  const handlePlatformChange = useCallback(
    async (nextPlatform: AnalyticsSelectablePlatform) => {
      if (nextPlatform === platformScope || platformProbeInFlight) {
        return;
      }

      const cachedDashboard = getCachedDashboard({ platform: nextPlatform });

      if (cachedDashboard) {
        if (!cachedDashboard.posts.length) {
          setEmptyPlatformModal(nextPlatform);
          return;
        }

        setPlatformScope(nextPlatform);
        return;
      }

      setPlatformProbeInFlight(nextPlatform);

      try {
        const nextDashboard = await previewDashboard({ platform: nextPlatform });

        if (!nextDashboard?.posts.length) {
          setEmptyPlatformModal(nextPlatform);
          return;
        }

        setPlatformScope(nextPlatform);
      } catch {
        setEmptyPlatformModal(nextPlatform);
      } finally {
        setPlatformProbeInFlight(null);
      }
    },
    [getCachedDashboard, platformProbeInFlight, platformScope, previewDashboard]
  );

  if (isLoading && !dashboard) {
    return <AnalyticsSkeleton />;
  }

  if (!isLoading && dashboard && selectedPlatformUnavailable) {
    return <AnalyticsSkeleton />;
  }

  if (!isLoading && dashboard && !dashboard.connectedPlatforms.length) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Connect Instagram or Facebook first"
          description="Analytics needs connected publishing accounts before PrixmoAI can summarize what is working."
          action={
            <Link to="/app/scheduler" className="button button--primary button--sm">
              Connect channels
            </Link>
          }
        />
      </div>
    );
  }

  if (!isLoading && dashboard && !dashboard.posts.length) {
    return (
      <div className="page-stack">
        <ErrorMessage message={error} />
        <div className="analytics-dashboard">
          <section className="analytics-dashboard__hero">
            <div>
              <p className="section-eyebrow">Analytics intelligence</p>
              <h2>Understand what is working on {activePlatformLabel}.</h2>
              <p>
                PrixmoAI will fill this dashboard as soon as your published {activePlatformLabel.toLowerCase()} posts start returning performance data.
              </p>
            </div>
          </section>
          <EmptyState
            title={`No ${activePlatformLabel} analytics yet`}
            description={`Published ${activePlatformLabel.toLowerCase()} posts with tracked metrics will appear here with trends, best-time recommendations, and content insights.`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <ErrorMessage message={error} />

      <div className="analytics-dashboard">
        <section className="analytics-dashboard__hero">
          <div className="analytics-header">
            <p className="section-eyebrow">Analytics</p>
            <div className="analytics-header__copy">
              <h2>Read what is working, not just what was posted.</h2>
              <p className="analytics-header__description">
                Independent {activePlatformLabel} reporting for post performance, audience growth, timing insights, and content recommendations.
              </p>
            </div>

            <div className="analytics-toolbar">
              <div className="analytics-toolbar__filters">
                <div className="analytics-toolbar__group">
                  {DATE_PRESETS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`analytics-pill ${preset === option.id ? 'analytics-pill--active' : ''}`}
                      onClick={() => setPreset(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                  {preset === 'custom' ? (
                    <div className="analytics-dashboard__custom-range">
                      <Input
                        type="date"
                        value={customStart}
                        onChange={(event) => setCustomStart(event.target.value)}
                      />
                      <Input
                        type="date"
                        value={customEnd}
                        onChange={(event) => setCustomEnd(event.target.value)}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="analytics-toolbar__group">
                  {PLATFORM_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`analytics-pill ${platformScope === option.id ? 'analytics-pill--active' : ''}`}
                      disabled={platformProbeInFlight !== null}
                      onClick={() => {
                        void handlePlatformChange(option.id);
                      }}
                    >
                      {platformProbeInFlight === option.id ? 'Checking…' : option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="analytics-toolbar__actions">
                <div className={`analytics-export ${exportOpen ? 'analytics-export--open' : ''}`}>
                  <button
                    type="button"
                    className="analytics-pill analytics-pill--icon"
                    onClick={() => setExportOpen((value) => !value)}
                  >
                    <Download size={14} />
                    Export
                    <ChevronDown size={14} />
                  </button>
                  {exportOpen ? (
                    <div className="analytics-export__menu">
                      <button type="button" onClick={() => {
                        exportAnalyticsCsv(dashboard, filteredPosts);
                        setExportOpen(false);
                      }}>
                        CSV
                      </button>
                      <button type="button" onClick={() => {
                        exportAnalyticsPdf(dashboard, filteredPosts);
                        setExportOpen(false);
                      }}>
                        PDF
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="analytics-refresh-control">
                  <button
                    type="button"
                    className="analytics-pill analytics-pill--icon"
                    disabled={isRefreshing}
                    onClick={() => {
                      setExportOpen(false);
                      void refresh({ sync: true });
                    }}
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'analytics-icon-spin' : ''} />
                    {isRefreshing ? 'Refreshing' : 'Refresh'}
                  </button>
                  <span className="analytics-dashboard__last-updated">
                    {relativeLastUpdatedLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="analytics-learning-shell">
          <Card className="analytics-learning-hero">
            <div className="analytics-learning-hero__copy">
              <div className="analytics-learning-hero__eyebrow">
                <Sparkles size={14} />
                <span>Learning loop</span>
              </div>
              <h3>Your content is getting smarter for this brand.</h3>
              <p>
                {sanitizeLearningCopy(
                  dashboard?.learning.summary ??
                    'PrixmoAI is still collecting enough published-post data to learn what works best for your brand.'
                )}
              </p>
              <div className="analytics-learning-hero__meta">
                {learningIsReady ? (
                  <AnalyticsConfidenceChip confidence={dashboard?.learning.confidence ?? 'low'} />
                ) : (
                  <AnalyticsInfoChip
                    tooltipTitle="Learning progress"
                    tooltipLines={[
                      'This counts published scheduler posts in this analytics view.',
                      'Learning unlocks after 6 posts.',
                    ]}
                  >
                    {learningPostsConsidered} of {learningMinimumPosts} posts collected
                  </AnalyticsInfoChip>
                )}
                <AnalyticsInfoChip
                  tooltipTitle="Last learning update"
                  tooltipLines={[
                    'This shows when PrixmoAI last recalculated learning for this view.',
                    'Click the refresh icon here to refresh only recommendations and learning memory.',
                  ]}
                  actionIcon={<RefreshCw size={12} className={isLearningRefreshing ? 'analytics-icon-spin' : ''} />}
                  actionLabel="Refresh learning"
                  onAction={() => {
                    void refresh({ learningOnly: true });
                  }}
                >
                  {relativeLearningUpdatedLabel}
                </AnalyticsInfoChip>
                {learningIsReady && activeLearningProfile ? (
                  <AnalyticsInfoChip
                    tooltipTitle="Platform scope"
                    tooltipLines={[
                      'This learning summary is for one platform only.',
                      `Right now it is showing ${formatPlatformName(activeLearningProfile.platform)}.`,
                    ]}
                  >
                    Applies to {formatPlatformName(activeLearningProfile.platform)}
                  </AnalyticsInfoChip>
                ) : null}
              </div>
            </div>

	            <div className="analytics-learning-hero__spotlight">
	              <div className="analytics-learning-hero__spotlight-card">
	                <div className="analytics-learning-hero__spotlight-top">
	                  <span>Recommended next move</span>
	                </div>
                <strong>
                  {learningIsReady
                    ? sanitizeLearningCopy(
                        dashboard?.learning.topRecommendation ??
                          'Publish a few tracked posts to unlock a stronger recommendation.'
                      )
                    : `Publish ${learningPostsRemaining} more ${
                        learningPostsRemaining === 1 ? 'post' : 'posts'
                      } to unlock a smarter recommendation.`}
                </strong>
                <p className="analytics-learning-hero__spotlight-note">
                  {sanitizeLearningCopy(topRecommendationReason)}
                </p>
                <div className="analytics-learning-next__chips">
                  {learningIsReady && recommendationAccuracyLabel ? (
                    <AnalyticsInfoChip
                      tooltipTitle="Recommendation accuracy"
                      tooltipLines={[
                        'This uses MAPE to compare the recommendation against real post results.',
                        'Higher means PrixmoAI is seeing a more reliable next-post pattern.',
                      ]}
                    >
                      {recommendationAccuracyLabel}
                    </AnalyticsInfoChip>
                  ) : null}
                  {learningIsReady && activeLearningWinningGoal ? (
                    <AnalyticsInfoChip
                      tooltipTitle="Best goal right now"
                      tooltipLines={[
                        'This is the content goal that is connecting best in this view right now.',
                      ]}
                    >
                      Best goal: {activeLearningWinningGoal}
                    </AnalyticsInfoChip>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          <div className="analytics-learning-decision-grid">
            <Card className="analytics-learning-card analytics-learning-card--positive">
              <div className="analytics-learning-card__header">
                <div>
                  <p className="section-eyebrow">What’s working</p>
                  <h4>Winning patterns</h4>
                </div>
              </div>
              {learningIsReady && activeLearningPatterns.length ? (
                <div className="analytics-learning-pattern-list">
                  {activeLearningPatterns.slice(0, 3).map((pattern) => (
                    <article key={`${pattern.dimension}-${pattern.label}`} className="analytics-learning-pattern">
                      <strong>
                        <LearningPatternTitle dimension={pattern.dimension} label={pattern.label} />
                      </strong>
                      <p>{sanitizeLearningCopy(pattern.explanation)}</p>
                      <small>Based on {pattern.sampleSize} posts</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="analytics-learning-empty">
                  {learningIsReady
                    ? 'Publish more tracked posts to surface strong winning patterns here.'
                    : `Winning patterns unlock after ${learningMinimumPosts} published posts in this analytics view.`}
                </div>
              )}
            </Card>

            <Card className="analytics-learning-card analytics-learning-card--warning">
              <div className="analytics-learning-card__header">
                <div>
                  <p className="section-eyebrow">What to avoid</p>
                  <h4>Weak patterns</h4>
                </div>
              </div>
              {learningIsReady && activeWeakPatterns.length ? (
                <div className="analytics-learning-pattern-list">
                  {activeWeakPatterns.slice(0, 3).map((pattern) => (
                    <article key={`${pattern.dimension}-${pattern.label}`} className="analytics-learning-pattern">
                      <strong>
                        <LearningPatternTitle dimension={pattern.dimension} label={pattern.label} />
                      </strong>
                      <p>{sanitizeLearningCopy(pattern.explanation)}</p>
                      <small>Based on {pattern.sampleSize} posts</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="analytics-learning-empty">
                  {learningIsReady
                    ? 'No weak signal stands out yet. PrixmoAI will flag softer patterns once enough data accumulates.'
                    : 'Weak-pattern alerts will appear after PrixmoAI has enough post history to compare winners and weaker ideas safely.'}
                </div>
              )}
            </Card>

            <Card className="analytics-learning-card analytics-learning-card--neutral">
              <div className="analytics-learning-card__header">
                <div>
                  <p className="section-eyebrow">Next best post</p>
                  <h4>What PrixmoAI suggests next</h4>
                </div>
              </div>
              <div className="analytics-learning-next">
                <strong>
                  {learningIsReady
                    ? sanitizeLearningCopy(
                        dashboard?.learning.topRecommendation ??
                          'Need a little more clean data before PrixmoAI can suggest the next post.'
                      )
                    : `Publish ${learningPostsRemaining} more ${
                        learningPostsRemaining === 1 ? 'post' : 'posts'
                      } to unlock your next-post recommendation.`}
                </strong>
                <div className="analytics-learning-next__chips">
                  {learningIsReady && activeLearningWinningFormat ? (
                    <AnalyticsInfoChip
                      tooltipTitle="Best format"
                      tooltipLines={[
                        'This is the format that looks strongest so far.',
                        'It updates as more published posts are analyzed.',
                      ]}
                    >
                      Best format: {activeLearningWinningFormat}
                    </AnalyticsInfoChip>
                  ) : null}
                  {learningIsReady && activeLearningWinningTone ? (
                    <AnalyticsInfoChip
                      tooltipTitle="Tone fit"
                      tooltipLines={[
                        'This is the tone that is matching audience response best right now.',
                      ]}
                    >
                      Tone fit: {activeLearningWinningTone}
                    </AnalyticsInfoChip>
                  ) : null}
                  {learningIsReady && activeLearningWinningGoal ? (
                    <AnalyticsInfoChip
                      tooltipTitle="Goal fit"
                      tooltipLines={[
                        'This is the goal that is performing best in this view right now.',
                      ]}
                    >
                      Goal fit: {activeLearningWinningGoal}
                    </AnalyticsInfoChip>
                  ) : null}
                  {!learningIsReady ? (
                    <AnalyticsInfoChip
                      tooltipTitle="Learning progress"
                      tooltipLines={[
                        'This counts published scheduler posts in this analytics view.',
                        'Learning unlocks after 6 posts.',
                      ]}
                    >
                      {learningPostsConsidered} of {learningMinimumPosts} posts collected
                    </AnalyticsInfoChip>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>

          <Card className="analytics-learning-platforms">
            <div className="analytics-learning-platforms__header">
              <div>
                <p className="section-eyebrow">Platform learning</p>
                <h4>What PrixmoAI has learned by platform</h4>
              </div>
            </div>

            {learningIsReady && learningProfiles.length ? (
              <>
                <div className="analytics-learning-platform-tabs">
                  {learningProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={`analytics-learning-platform-tab ${
                        activeLearningProfile?.id === profile.id
                          ? 'analytics-learning-platform-tab--active'
                          : ''
                      }`}
                      onClick={() => setLearningPlatform(profile.platform)}
                    >
                      {getLearningPlatformIcon(profile.platform)}
                      <span>{formatPlatformName(profile.platform)}</span>
                    </button>
                  ))}
                </div>

                {activeLearningProfile ? (
                  <div className="analytics-learning-platform-grid">
                    <article className="analytics-learning-panel">
                      <div className="analytics-learning-panel__header">
                        <strong>Winning patterns</strong>
                        <AnalyticsInfoChip
                          tooltipTitle="Last update"
                          tooltipLines={[
                            'This shows when PrixmoAI last checked this platform learning.',
                            'It refreshes after analytics sync or when you refresh manually.',
                          ]}
                        >
                          {relativeLearningUpdatedLabel}
                        </AnalyticsInfoChip>
                      </div>
                      <div className="analytics-learning-pattern-list analytics-learning-pattern-list--dense">
                        {activeLearningPatterns.slice(0, 5).map((pattern) => (
                          <article key={`${pattern.dimension}-${pattern.label}`} className="analytics-learning-pattern analytics-learning-pattern--inline">
                            <div>
                              <strong>
                                <LearningPatternTitle dimension={pattern.dimension} label={pattern.label} />
                              </strong>
                              <p>{sanitizeLearningCopy(pattern.explanation)}</p>
                            </div>
                            <small>{pattern.sampleSize} posts</small>
                          </article>
                        ))}
                      </div>
                    </article>

                    <article className="analytics-learning-panel">
                      <div className="analytics-learning-panel__header">
                        <strong>Platform snapshot</strong>
                        <AnalyticsInfoChip
                          tooltipTitle="Platform"
                          tooltipLines={[
                            'These numbers are only for this platform.',
                          ]}
                        >
                          {formatPlatformName(activeLearningProfile.platform)}
                        </AnalyticsInfoChip>
                      </div>
                      <div className="analytics-learning-metric-grid">
                        <AnalyticsMetricInfoCard
                          label="Avg score"
                          value={Number(activeLearningMetrics.averagePerformanceScore ?? 0).toFixed(2)}
                          tooltipTitle="Average score"
                          tooltipLines={[
                            'This is the overall strength of recent posts for this platform.',
                            'A higher number usually means the posts are landing better.',
                          ]}
                        />
                        <AnalyticsMetricInfoCard
                          label="Avg engagement"
                          value={`${Number(activeLearningMetrics.averageEngagementRate ?? 0).toFixed(1)}%`}
                          tooltipTitle="Average engagement"
                          tooltipLines={[
                            'This shows how much people interact with your posts on average.',
                            'It includes actions like likes, comments, saves, and shares.',
                          ]}
                        />
                        <AnalyticsMetricInfoCard
                          label="Avg shares"
                          value={`${Number(activeLearningMetrics.averageShareRate ?? 0).toFixed(1)}%`}
                          tooltipTitle="Average shares"
                          tooltipLines={[
                            'This shows how often people share your posts on average.',
                          ]}
                        />
                        <AnalyticsMetricInfoCard
                          label="Avg saves"
                          value={`${Number(activeLearningMetrics.averageSaveRate ?? 0).toFixed(1)}%`}
                          tooltipTitle="Average saves"
                          tooltipLines={[
                            'This shows how often people save your posts on average.',
                          ]}
                        />
                      </div>
                    </article>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="analytics-learning-empty analytics-learning-empty--panel">
                {`Platform learning unlocks after ${learningMinimumPosts} published posts in this analytics view. Likes, shares, saves, impressions, engagement, and follower metrics will continue updating before that.`}
              </div>
            )}
          </Card>

          <Card className="analytics-learning-dna">
            <div className="analytics-learning-dna__header">
              <div>
                <p className="section-eyebrow">Top performing post DNA</p>
                <h4>Why the strongest post likely worked</h4>
              </div>
            </div>

            {learningIsReady && activeLearningTopPost ? (
              <div className="analytics-learning-dna__body">
                <div className="analytics-learning-dna__copy">
                  <div className="analytics-learning-dna__postline">
                    <AnalyticsPostThumbnail
                      post={activeLearningTopPost}
                      className="analytics-learning-dna__thumb"
                    />
                    <div className="analytics-learning-dna__postmeta">
                      <strong>{getBestPostTitle(activeLearningTopPost)}</strong>
                      <span className="analytics-learning-dna__postdetail">
                        {formatPlatformName(activeLearningTopPost.platform)} •{' '}
                        {formatPostPreviewDate(activeLearningTopPost.publishedTime)}
                      </span>
                    </div>
                  </div>
                  {activeLearningTopPost.caption ? (
                    <span
                      className={`analytics-learning-dna__caption ${
                        activeLearningTopPost.caption.length > 88
                          ? 'analytics-learning-dna__caption--has-tooltip'
                          : ''
                      }`}
                      tabIndex={activeLearningTopPost.caption.length > 88 ? 0 : undefined}
                    >
                      Caption: {truncateText(activeLearningTopPost.caption, 88)}
                      {activeLearningTopPost.caption.length > 88 ? (
                        <span className="analytics-learning-dna__caption-tooltip" role="tooltip">
                          {activeLearningTopPost.caption}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="analytics-learning-dna__caption">
                      Caption: No caption saved for this post.
                    </span>
                  )}
                </div>
                <div className="analytics-learning-dna__metrics">
                  <span>Format: {formatPostType(activeLearningTopPost.postType)}</span>
                  <span>Impressions: {activeLearningTopPost.impressions.toLocaleString()}</span>
                  <span>Reach: {activeLearningTopPost.reach.toLocaleString()}</span>
                  <span>Engagement: {formatPercentage(activeLearningTopPost.engagementRate)}</span>
                  <span>Comments: {activeLearningTopPost.comments.toLocaleString()}</span>
                  <span>Saves: {activeLearningTopPost.saves.toLocaleString()}</span>
                  <span>Shares: {activeLearningTopPost.shares.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="analytics-learning-empty analytics-learning-empty--panel">
                {learningIsReady
                  ? 'No post yet to show. PrixmoAI will display your top-performing post here once one post clearly leads on engagement, saves, shares, reach, impressions, and comments.'
                  : `Top-post DNA unlocks after ${learningMinimumPosts} published posts in this analytics view.`}
              </div>
            )}
          </Card>
        </section>

        <section className="analytics-kpi-grid">
          {dashboard
            ? KPI_TITLES.map((item) => (
                <AnalyticsKpiCard
                  key={item.key}
                  title={item.label}
                  metric={dashboard.overview[item.key]}
                  tooltip={KPI_TOOLTIPS[item.key]}
                />
              ))
            : null}
        </section>

        {dashboard ? (
          <>
            {learningIsReady ? (
              <section className="analytics-chart-grid">
                <DualLineChart
                  title="Impressions and reach over time"
                  subtitle={activePlatformLabel}
                  points={dashboard.trends.impressionsReachSeries}
                />
                <StackedEngagementChart
                  title="Engagement breakdown over time"
                  subtitle="Likes, comments, saves, and reactions"
                  points={dashboard.trends.engagementSeries}
                />
              </section>
            ) : (
              <section className="analytics-chart-grid">
                <AnalyticsUnlockPanel
                  title={advancedAnalyticsUnlockTitle}
                  description={advancedAnalyticsUnlockDescription}
                  progressLabel={advancedAnalyticsProgressLabel}
                />
                <AnalyticsUnlockPanel
                  title="Trend charts will appear here next."
                  description="Once PrixmoAI has enough posted samples, this section will chart reach, impressions, engagement mix, and performance momentum with much stronger confidence."
                  progressLabel={advancedAnalyticsProgressLabel}
                />
              </section>
            )}

            <section className="analytics-insights-grid">
              <div className="analytics-recommendations-layout">
                <Card className="analytics-panel analytics-panel--compact analytics-panel--recommendations-cockpit">
                  <div className="analytics-panel__header">
                    <div>
                      <p className="section-eyebrow">Decision cockpit</p>
                      <h3>What should you post next?</h3>
                    </div>
                  </div>
                  <div className="analytics-insights-board analytics-insights-board--cockpit">
                    {recommendationCockpitCards.map((insight) => (
                    <article
                      key={insight.id}
                      className={`analytics-insight-card analytics-insight-card--${insight.tone} analytics-insight-card--cockpit analytics-insight-card--data-${insight.status}`}
                    >
                      <div className="analytics-insight-card__top">
                        <strong>{insight.title}</strong>
                        <span className={`analytics-insight-card__status analytics-insight-card__status--${insight.status}`}>
                          {insight.statusLabel}
                        </span>
                      </div>
                      {insight.previewPost ? (
                        <div className="analytics-insight-card__post-preview">
                          <AnalyticsPostThumbnail
                            post={insight.previewPost}
                            className="analytics-insight-card__thumb"
                          />
                          <div className="analytics-insight-card__post-copy">
                            <div className="analytics-insight-card__metric">{insight.metric}</div>
                            {insight.meta ? (
                              <span className="analytics-insight-card__meta">{insight.meta}</span>
                            ) : null}
                            {insight.detail ? (
                              <span className="analytics-insight-card__detail">{insight.detail}</span>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="analytics-insight-card__metric">{insight.metric}</div>
                      )}
                      <p>{sanitizeLearningCopy(insight.hint)}</p>
                      <small>{insight.delta}</small>
                    </article>
                    ))}
                  </div>
                </Card>

                <Card className="analytics-panel analytics-panel--compact analytics-panel--strategy">
                  <div className="analytics-panel__header">
                    <div>
                      <p className="section-eyebrow">Strategy panel</p>
                      <h3>Why PrixmoAI is recommending this</h3>
                    </div>
                  </div>

                  <div className="analytics-recommendations-rail">
                    <article className="analytics-recommendations-rail__hero">
                      <span>Current recommendation</span>
                      <strong>
                        {learningIsReady
                          ? sanitizeLearningCopy(
                              dashboard.learning.topRecommendation ??
                                'Need a little more clean data before PrixmoAI can suggest the next post.'
                            )
                          : `Publish ${learningPostsRemaining} more ${
                              learningPostsRemaining === 1 ? 'post' : 'posts'
                            } to unlock your next recommendation.`}
                      </strong>
                      <p>{sanitizeLearningCopy(topRecommendationReason)}</p>
                    </article>

                    <article className="analytics-recommendations-rail__callout">
                      <span>What data is missing</span>
                      <strong>{whatDataIsMissing}</strong>
                      {!learningIsReady ? (
                        <>
                          <div className="analytics-recommendations-rail__progress">
                            <div
                              className="analytics-recommendations-rail__progress-fill"
                              style={{ width: `${learningProgressPercent}%` }}
                            />
                          </div>
                          <small>
                            {learningPostsConsidered} of {learningMinimumPosts} posts collected for learning unlock
                          </small>
                        </>
                      ) : (
                        <small>
                          {bestTimeSignalReady
                            ? 'Timing confidence is unlocked for this platform.'
                            : 'Timing confidence is unlocked, but PrixmoAI is still waiting for a clearer posting-time winner.'}
                        </small>
                      )}
                    </article>

                    <div className="analytics-recommendations-rail__stats analytics-recommendations-rail__stats--stacked">
                      <article className="analytics-recommendations-rail__stat">
                        <span>{learningIsReady ? 'Recommendation accuracy' : 'Learning unlock'}</span>
                        <strong>
                          {learningIsReady
                            ? recommendationAccuracyLabel ?? dashboard.learning.confidence
                            : `${learningPostsConsidered}/${learningMinimumPosts}`}
                        </strong>
                      </article>
                      <article className="analytics-recommendations-rail__stat">
                        <span>Best format</span>
                        <strong>
                          {learningIsReady
                            ? activeLearningWinningFormat ?? 'Emerging'
                            : 'Locked'}
                        </strong>
                      </article>
                      <article className="analytics-recommendations-rail__stat">
                        <span>Best time signal</span>
                        <strong>
                          {bestTimeSignalReady
                            ? dashboard.bestTimeToPost.topSlots[0]
                              ? `${dashboard.bestTimeToPost.topSlots[0].day} ${String(
                                  dashboard.bestTimeToPost.topSlots[0].hour
                                ).padStart(2, '0')}:00`
                              : 'Emerging'
                            : learningIsReady
                              ? 'No clear winner yet'
                              : 'Locked'}
                        </strong>
                      </article>
                      <article className="analytics-recommendations-rail__stat">
                        <span>{learningIsReady ? 'Posts analyzed' : 'Posts collected'}</span>
                        <strong>{postsAnalyzedCount}</strong>
                      </article>
                    </div>

                    <div className="analytics-recommendations-rail__signals">
                      {learningIsReady && activeLearningWinningGoal ? (
                        <AnalyticsInfoChip
                          tooltipTitle="Goal signal"
                          tooltipLines={[
                            'This is the strongest goal signal PrixmoAI sees right now.',
                          ]}
                        >
                          Goal: {activeLearningWinningGoal}
                        </AnalyticsInfoChip>
                      ) : null}
                      {learningIsReady && activeLearningWinningTone ? (
                        <AnalyticsInfoChip
                          tooltipTitle="Tone signal"
                          tooltipLines={[
                            'This is the tone that is connecting best right now.',
                          ]}
                        >
                          Tone: {activeLearningWinningTone}
                        </AnalyticsInfoChip>
                      ) : null}
                    </div>

                    <div className="analytics-recommendations-rail__actions">
                      <Link to="/app/generate" className="button button--primary button--sm">
                        Generate next post
                      </Link>
                    </div>
                  </div>
                </Card>
              </div>
            </section>

            <section className="analytics-content-section">
              <div className="analytics-content-section__header">
                <div>
                  <p className="section-eyebrow">Content performance</p>
                  <h3>Post-level performance and sortable insights</h3>
                </div>
                <div className="analytics-content-section__filters">
                  <label className="analytics-search">
                    <Search size={14} />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search caption, hashtag, keyword"
                    />
                  </label>
                  <label className="analytics-select">
                    <Filter size={14} />
                    <select value={postTypeFilter} onChange={(event) => setPostTypeFilter(event.target.value)}>
                      <option value="all">All post types</option>
                      {supportedPostTypes.map((postType) => (
                        <option key={postType} value={postType}>
                          {formatPostType(postType)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <Card className="analytics-table-card">
                <div className="analytics-table-wrap">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Thumbnail</th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('date');
                            setSortDirection((current) => (sortKey === 'date' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Date
                          </button>
                        </th>
                        <th>Platform</th>
                        <th>Post type</th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('impressions');
                            setSortDirection((current) => (sortKey === 'impressions' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Impressions
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('reach');
                            setSortDirection((current) => (sortKey === 'reach' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Reach
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('likes');
                            setSortDirection((current) => (sortKey === 'likes' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Likes
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('comments');
                            setSortDirection((current) => (sortKey === 'comments' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Comments
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('saves');
                            setSortDirection((current) => (sortKey === 'saves' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Saves
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => {
                            setSortKey('engagementRate');
                            setSortDirection((current) => (sortKey === 'engagementRate' && current === 'desc' ? 'asc' : 'desc'));
                          }}>
                            Engagement %
                          </button>
                        </th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPosts.length ? (
                        paginatedPosts.map((post, index) => (
                          <tr key={post.id} className={index % 2 === 0 ? 'is-even' : ''}>
                            <td>
                              <button type="button" className="analytics-table__thumb" onClick={() => setSelectedPost(post)}>
                                {post.thumbnailUrl ? (
                                  <>
                                    <img src={post.thumbnailUrl} alt={post.caption || post.id} />
                                    {(post.postType === 'video' || post.postType === 'reel') ? (
                                      <span className="analytics-table__thumb-badge">
                                        <Play size={11} />
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="analytics-table__thumb-placeholder">PX</span>
                                )}
                              </button>
                            </td>
                            <td>
                              <div className="analytics-table__date">
                                <strong>{post.publishedTime ? formatDateTime(post.publishedTime) : '—'}</strong>
                                <span>{post.socialAccountName || 'Connected account'}</span>
                              </div>
                            </td>
                            <td>
                              <span className="analytics-table__platform">
                                {getPlatformIcon(post.platform)}
                                {post.platformLabel}
                              </span>
                            </td>
                            <td>{formatPostType(post.postType)}</td>
                            <td>{post.impressions.toLocaleString()}</td>
                            <td>{post.reach.toLocaleString()}</td>
                            <td>{post.likes.toLocaleString()}</td>
                            <td>{post.comments.toLocaleString()}</td>
                            <td>{post.saves.toLocaleString()}</td>
                            <td>{formatPercentage(post.engagementRate)}</td>
                            <td>
                              <button type="button" className="analytics-table__action" onClick={() => setSelectedPost(post)}>
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={11} className="analytics-table__empty">
                            No posts match the current analytics filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredPosts.length ? (
                  <div className="analytics-table__pagination">
                    <span>
                      Showing {(postsPage - 1) * POSTS_PER_PAGE + 1}-
                      {Math.min(postsPage * POSTS_PER_PAGE, filteredPosts.length)} of{' '}
                      {filteredPosts.length}
                    </span>
                    <div className="analytics-table__pagination-controls">
                      <button
                        type="button"
                        className="analytics-pill analytics-pill--icon"
                        disabled={postsPage <= 1}
                        onClick={() => setPostsPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      <span>
                        Page {postsPage} of {totalPostPages}
                      </span>
                      <button
                        type="button"
                        className="analytics-pill analytics-pill--icon"
                        disabled={postsPage >= totalPostPages}
                        onClick={() =>
                          setPostsPage((page) => Math.min(totalPostPages, page + 1))
                        }
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </Card>
            </section>

            <section className="analytics-audience-section">
              <button
                type="button"
                className="analytics-audience-section__toggle"
                onClick={() => setAudienceExpanded((value) => !value)}
              >
                <div>
                  <p className="section-eyebrow">Audience insights</p>
                  <h3>Best time, activity heatmap, and growth clues</h3>
                </div>
                <ChevronDown size={18} className={audienceExpanded ? 'is-open' : ''} />
              </button>
              {audienceExpanded && !learningIsReady ? (
                <div className="analytics-audience-grid">
                  <AnalyticsUnlockPanel
                    title={advancedAnalyticsUnlockTitle}
                    description="Best posting time, follower-trend charts, activity heatmaps, and audience demographic breakdowns unlock after PrixmoAI has at least 6 published posts to learn from in this selected analytics view."
                    progressLabel={advancedAnalyticsProgressLabel}
                  />
                </div>
              ) : audienceExpanded ? (
                <div className="analytics-audience-grid">
                  <Card className="analytics-panel analytics-panel--wide">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Best time to post</p>
                        <h3>{dashboard.bestTimeToPost.summary}</h3>
                      </div>
                    </div>
                    {!learningIsReady ? (
                      <div className="analytics-blank-state analytics-blank-state--panel">
                        {`Post at least ${learningMinimumPosts} published posts to unlock the timing heatmap and posting-time confidence.`}
                      </div>
                    ) : null}
                    {learningIsReady && !bestTimeSignalReady ? (
                      <div className="analytics-heatmap-note">
                        <strong>No best time yet.</strong>
                        <span>
                          {dashboard.bestTimeToPost.summary}
                        </span>
                      </div>
                    ) : null}
                    {learningIsReady ? (
                      <EngagementHeatmap
                        cells={dashboard.bestTimeToPost.heatmap}
                        muted={!bestTimeSignalReady}
                      />
                    ) : null}
                    <div className="analytics-top-slots">
                      {bestTimeSignalReady ? (
                        dashboard.bestTimeToPost.topSlots.map((slot) => (
                          <article key={`${slot.day}-${slot.hour}`} className="analytics-top-slot">
                            <strong>{slot.day}</strong>
                            <span>
                              {String(slot.hour).padStart(2, '0')}:00 · {formatPercentage(slot.averageEngagementRate)}
                            </span>
                          </article>
                        ))
                      ) : (
                        <div className="analytics-top-slots analytics-top-slots--insight">
                          <article className="analytics-top-slot">
                            <strong>{learningIsReady ? 'Posts checked' : 'Progress'}</strong>
                            <span>
                              {learningIsReady
                                ? `${learningPostsConsidered} published posts were checked for timing patterns.`
                                : `${learningPostsConsidered} of ${learningMinimumPosts} published posts collected for timing unlock.`}
                            </span>
                          </article>
                          <article className="analytics-top-slot">
                            <strong>What this means</strong>
                            <span>
                              {learningIsReady
                                ? dashboard.bestTimeToPost.summary
                                : 'PrixmoAI needs a few more posted samples before timing guidance becomes reliable.'}
                            </span>
                          </article>
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Follower growth</p>
                        <h3>Growth trend across the selected range</h3>
                      </div>
                    </div>
                    <FollowerGrowthChart points={dashboard.audience.followerGrowthSeries} />
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Age distribution</p>
                        <h3>Which age groups are growing fastest</h3>
                      </div>
                    </div>
                    <AudienceDonutChart
                      items={
                        dashboard.audience.ageDistribution.length
                          ? dashboard.audience.ageDistribution
                          : dashboard.audience.ageGenderBreakdown
                      }
                    />
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Gender distribution</p>
                        <h3>Who is responding most right now</h3>
                      </div>
                    </div>
                    <AudienceDonutChart
                      items={
                        dashboard.audience.genderDistribution.length
                          ? dashboard.audience.genderDistribution
                          : dashboard.audience.ageGenderBreakdown
                      }
                    />
                  </Card>

                  <Card className="analytics-panel analytics-panel--wide">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Active hours</p>
                        <h3>When your audience is most active</h3>
                      </div>
                    </div>
                    <EngagementHeatmap
                      cells={dashboard.audience.activeHoursHeatmap}
                      valueLabel="activity blocks"
                    />
                  </Card>

                  <Card className="analytics-panel">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Top locations</p>
                        <h3>Where your audience is strongest</h3>
                      </div>
                    </div>
                    {dashboard.audience.topLocations.length ? (
                      <div className="analytics-location-list">
                        {dashboard.audience.topLocations.map((location) => {
                          const maxLocationValue = dashboard.audience.topLocations[0]?.value || 1;
                          const width = Math.max(8, (location.value / maxLocationValue) * 100);

                          return (
                            <article key={location.label} className="analytics-location-row">
                              <div className="analytics-location-row__top">
                                <span>{location.label}</span>
                                <strong>{location.value.toLocaleString()}</strong>
                              </div>
                              <div className="analytics-location-row__bar">
                                <span style={{ width: `${width}%` }} />
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="analytics-blank-state">Location insights will appear once platform audience data is available.</div>
                    )}
                  </Card>

                  <Card className="analytics-panel analytics-panel--compact">
                    <div className="analytics-panel__header">
                      <div>
                        <p className="section-eyebrow">Audience summary</p>
                        <h3>Compact growth summary</h3>
                      </div>
                    </div>
                    <div className="analytics-summary-stack">
                      <div className="analytics-summary-stat">
                        <span>Follower growth</span>
                        <strong>
                          {dashboard.audience.followerGrowthValue !== null
                            ? dashboard.audience.followerGrowthValue.toLocaleString()
                            : '—'}
                        </strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Top audience</span>
                        <strong>
                          {dashboard.audience.ageDistribution[0]?.label ||
                            dashboard.audience.genderDistribution[0]?.label ||
                            dashboard.audience.ageGenderBreakdown[0]?.label ||
                            'Unavailable'}
                        </strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Profile visits</span>
                        <strong>{dashboard.audience.profileVisits.toLocaleString()}</strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Page likes</span>
                        <strong>{dashboard.audience.pageLikes.toLocaleString()}</strong>
                      </div>
                      <div className="analytics-summary-stat">
                        <span>Top location</span>
                        <strong>
                          {dashboard.audience.topLocations[0]?.label || 'Unavailable'}
                        </strong>
                      </div>
                    </div>
                    <div className="analytics-summary-notes">
                      {dashboard.audience.summaryNotes.map((note) => (
                        <article key={note} className="analytics-summary-note">
                          <Sparkles size={14} />
                          <span>{note}</span>
                        </article>
                      ))}
                    </div>
                  </Card>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>

      {emptyPlatformModal ? (
        <div className="generated-image-lightbox analytics-empty-modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="generated-image-lightbox__backdrop"
            aria-label="Close empty platform analytics dialog"
            onClick={() => setEmptyPlatformModal(null)}
          />
          <aside className="generated-image-lightbox__panel analytics-empty-modal__panel">
            <div className="analytics-empty-modal__header">
              <div>
                <p className="section-eyebrow">No analytics yet</p>
                <h3>No posts yet on {emptyPlatformModal === 'instagram' ? 'Instagram' : 'Facebook'}</h3>
              </div>
              <button
                type="button"
                className="generated-image-card__action"
                onClick={() => setEmptyPlatformModal(null)}
                aria-label="Close empty platform analytics dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div className="analytics-empty-modal__body">
              <p>
                You haven&apos;t published any posts on{' '}
                {emptyPlatformModal === 'instagram' ? 'Instagram' : 'Facebook'} yet.
                Publish a post or connect your {emptyPlatformModal === 'instagram' ? 'Instagram' : 'Facebook'} account to see analytics.
              </p>
            </div>
            <div className="analytics-empty-modal__actions">
              <Link
                to="/app/scheduler"
                className="button button--secondary button--sm"
                onClick={() => setEmptyPlatformModal(null)}
              >
                Connect Account
              </Link>
              <Link
                to="/app/generate"
                className="button button--primary button--sm"
                onClick={() => setEmptyPlatformModal(null)}
              >
                Create Post
              </Link>
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => setEmptyPlatformModal(null)}
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <AnalyticsPostDrawer
        post={selectedPost}
        isOpen={Boolean(selectedPost)}
        onClose={() => setSelectedPost(null)}
      />
    </div>
  );
};
