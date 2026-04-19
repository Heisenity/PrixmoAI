export type ApiStatus = 'success' | 'fail' | 'error';
export type PlanType = 'free' | 'basic' | 'pro';
export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'x';
export type OAuthProvider = 'meta';
export type SocialAccountVerificationStatus =
  | 'unverified'
  | 'verified'
  | 'expired'
  | 'revoked';
export type GenerateConversationType = 'copy' | 'image' | 'mixed';
export type GenerateConversationRole = 'user' | 'assistant' | 'system';
export type GenerateConversationMessageType =
  | 'text'
  | 'copy'
  | 'image'
  | 'metadata';
export type GeneratedAssetType =
  | 'copy'
  | 'hashtags'
  | 'script'
  | 'image'
  | 'prompt';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';
export type ScheduledPostStatus =
  | 'pending'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'cancelled';
export type ScheduleBatchStatus =
  | 'draft'
  | 'queued'
  | 'partial'
  | 'completed'
  | 'failed';
export type MediaAssetSourceType = 'upload' | 'url' | 'generated';
export type ScheduledItemStatus =
  | 'pending'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';
export type SchedulerMediaType = 'image' | 'video';
export type WeeklyDirection = 'up' | 'down' | 'flat';

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiEnvelope<T = unknown> {
  status: ApiStatus;
  message?: string;
  data?: T;
  errors?: ApiErrorDetail[];
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface BrandProfile {
  id: string;
  userId: string;
  brandName: string | null;
  fullName: string;
  phoneNumber: string | null;
  username: string | null;
  avatarUrl: string | null;
  industry: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthMeResponse {
  user: {
    id: string;
    email?: string;
  };
  profile: BrandProfile | null;
}

export interface SaveProfileInput {
  brandName: string;
  fullName: string;
  phoneNumber?: string;
  username?: string;
  avatarUrl?: string;
  industry?: string;
  targetAudience?: string;
  brandVoice?: string;
  description?: string;
}

export interface ReelScript {
  hook: string;
  body: string;
  cta: string;
}

export interface CaptionVariant {
  hook: string;
  mainCopy: string;
  shortCaption: string;
  cta: string;
}

export interface GeneratedContent {
  id: string;
  userId: string;
  brandProfileId: string | null;
  conversationId: string | null;
  brandName?: string | null;
  productName: string;
  productDescription?: string | null;
  productImageUrl?: string | null;
  platform?: string | null;
  goal?: string | null;
  tone?: string | null;
  audience?: string | null;
  keywords?: string[];
  captions: CaptionVariant[];
  hashtags: string[];
  reelScript: ReelScript;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateContentInput {
  useBrandName?: boolean;
  productName: string;
  productDescription?: string;
  productImageUrl?: string;
  platform?: string;
  goal?: string;
  tone?: string;
  audience?: string;
  keywords?: string[];
}

export interface GeneratedImage {
  id: string;
  userId: string;
  contentId: string | null;
  conversationId: string | null;
  sourceImageUrl: string | null;
  generatedImageUrl: string;
  backgroundStyle: string | null;
  prompt: string | null;
  createdAt: string;
  updatedAt: string;
  provider?: string;
}

export interface SchedulerGeneratedMediaIntent {
  intentId: string;
  generatedImageId: string;
  contentId: string | null;
  conversationId: string | null;
  mediaUrl: string;
  mediaType: SchedulerMediaType;
  prompt: string | null;
  title: string | null;
  caption: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface GenerateImageInput {
  contentId?: string;
  sourceImageUrl?: string;
  useBrandName?: boolean;
  productName: string;
  productDescription?: string;
  backgroundStyle?: string;
  prompt?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

export interface UploadedSourceImage {
  sourceImageUrl: string;
  bucket: string;
  path: string;
  mediaType: SchedulerMediaType;
  contentType: string;
}

export interface AudioTranscriptionSegment {
  start: number | null;
  end: number | null;
  text: string;
}

export interface AudioTranscriptionResult {
  transcript: string;
  detectedLanguage: string | null;
  durationSeconds: number | null;
  segments: AudioTranscriptionSegment[];
}

export interface MediaAsset {
  id: string;
  userId: string;
  sourceType: MediaAssetSourceType;
  mediaType: SchedulerMediaType;
  originalUrl: string | null;
  storageUrl: string;
  thumbnailUrl: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  contentId: string | null;
  generatedImageId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ScheduleBatch {
  id: string;
  userId: string;
  batchName: string | null;
  status: ScheduleBatchStatus;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledItemLog {
  id: string;
  scheduledItemId: string;
  eventType: string;
  message: string;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface ScheduledItem {
  id: string;
  batchId: string;
  userId: string;
  mediaAssetId: string;
  scheduledPostId: string | null;
  platform: SocialPlatform;
  accountId: string;
  socialAccountId: string;
  caption: string | null;
  scheduledAt: string;
  status: ScheduledItemStatus;
  attemptCount: number;
  lastError: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  mediaAsset?: MediaAsset;
  socialAccount?: SocialAccount;
}

export interface ScheduleBatchDetail {
  batch: ScheduleBatch;
  items: ScheduledItem[];
}

export interface CreateMediaAssetInput {
  sourceType: MediaAssetSourceType;
  mediaType: SchedulerMediaType;
  originalUrl?: string | null;
  storageUrl: string;
  thumbnailUrl?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  contentId?: string | null;
  generatedImageId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResolvedExternalMedia {
  sourceUrl: string;
  resolvedUrl: string;
  mediaType: SchedulerMediaType;
  contentType: string;
  wasExtracted: boolean;
}

export interface CreateScheduleBatchInput {
  batchName?: string | null;
  status?: ScheduleBatchStatus;
}

export interface CreateScheduledItemInput {
  mediaAssetId: string;
  socialAccountId: string;
  platform: SocialPlatform;
  accountId: string;
  caption?: string | null;
  scheduledAt: string;
  status?: ScheduledItemStatus;
  scheduledPostId?: string | null;
  attemptCount?: number;
  lastError?: string | null;
  idempotencyKey?: string;
}

export interface UpdateScheduledItemInput
  extends Partial<CreateScheduledItemInput> {
  status?: ScheduledItemStatus;
}

export interface GenerateConversation {
  id: string;
  userId: string;
  title: string;
  lastMessagePreview: string | null;
  type: GenerateConversationType;
  isArchived: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateConversationAsset {
  id: string;
  conversationId: string;
  messageId: string;
  userId: string;
  assetType: GeneratedAssetType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface GenerateConversationMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: GenerateConversationRole;
  content: string | null;
  messageType: GenerateConversationMessageType;
  metadata: Record<string, unknown>;
  generationId: string | null;
  createdAt: string;
  assets: GenerateConversationAsset[];
}

export interface GenerateConversationThread {
  conversation: GenerateConversation;
  messages: GenerateConversationMessage[];
}

export interface AnalyticsTrendItem {
  value: string;
  count: number;
}

export interface AnalyticsSummary {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  posts: number;
  averageEngagement: number;
}

export type AnalyticsPlatformScope = 'all' | 'instagram' | 'facebook';

export interface AnalyticsMetricPoint {
  date: string;
  label: string;
  value: number;
}

export interface AnalyticsMetricValue {
  value: number | null;
  previousValue: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | 'na';
  sparkline: AnalyticsMetricPoint[];
  platformBreakdown?: Partial<Record<Exclude<AnalyticsPlatformScope, 'all'>, number>>;
}

export interface AnalyticsOverviewMetrics {
  impressions: AnalyticsMetricValue;
  reach: AnalyticsMetricValue;
  engagementRate: AnalyticsMetricValue;
  engagements: AnalyticsMetricValue;
  likes: AnalyticsMetricValue;
  comments: AnalyticsMetricValue;
  saves: AnalyticsMetricValue;
  shares: AnalyticsMetricValue;
  newFollowers: AnalyticsMetricValue;
  postsPublished: AnalyticsMetricValue;
}

export interface AnalyticsTrendBreakdown {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reactions: number;
  engagements: number;
}

export interface AnalyticsTrendPoint {
  date: string;
  label: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reactions: number;
  engagements: number;
  platformBreakdown: Partial<
    Record<Exclude<AnalyticsPlatformScope, 'all'>, AnalyticsTrendBreakdown>
  >;
}

export interface AnalyticsPostTrendPoint {
  date: string;
  label: string;
  impressions: number;
  reach: number;
  engagements: number;
}

export interface AnalyticsPostInsight {
  id: string;
  scheduledPostId: string | null;
  contentId: string | null;
  platform: string | null;
  platformLabel: string;
  socialAccountId: string | null;
  socialAccountName: string | null;
  postExternalId: string | null;
  postType: string | null;
  caption: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  publishedTime: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reactions: number;
  videoPlays: number;
  replays: number;
  exits: number;
  profileVisits: number;
  postClicks: number;
  pageLikes: number;
  completionRate: number | null;
  followersAtPostTime: number | null;
  engagements: number;
  engagementRate: number | null;
  performanceScore: number;
  keywords: string[];
  topComments: string[];
  trend: AnalyticsPostTrendPoint[];
}

export interface AnalyticsHeatmapCell {
  day: string;
  dayIndex: number;
  hour: number;
  posts: number;
  averageEngagementRate: number | null;
  intensity: number;
}

export interface AnalyticsBestTimeSlot {
  day: string;
  dayIndex: number;
  hour: number;
  posts: number;
  averageEngagementRate: number;
}

export interface AnalyticsBestTimeInsight {
  hasEnoughData: boolean;
  minimumPostsRequired: number;
  postsConsidered: number;
  summary: string;
  topSlots: AnalyticsBestTimeSlot[];
  heatmap: AnalyticsHeatmapCell[];
}

export interface AnalyticsAudienceBreakdownItem {
  label: string;
  value: number;
}

export interface AnalyticsFollowerTrendPoint {
  date: string;
  label: string;
  value: number;
}

export interface AnalyticsAudienceInsights {
  hasAudienceData: boolean;
  ageDistribution: AnalyticsAudienceBreakdownItem[];
  genderDistribution: AnalyticsAudienceBreakdownItem[];
  ageGenderBreakdown: AnalyticsAudienceBreakdownItem[];
  topLocations: AnalyticsAudienceBreakdownItem[];
  followerGrowthSeries: AnalyticsFollowerTrendPoint[];
  followerGrowthValue: number | null;
  profileVisits: number;
  pageLikes: number;
  activeHoursHeatmap: AnalyticsHeatmapCell[];
  bestTimeSummary: string;
  summaryNotes: string[];
}

export interface AnalyticsInsightCard {
  id: string;
  title: string;
  description: string;
  supportingMetric: string;
  confidence: 'low' | 'medium' | 'high';
  tone: 'positive' | 'neutral' | 'warning';
}

export interface AnalyticsPlatformComparison {
  platform: string;
  label: string;
  posts: number;
  impressions: number;
  reach: number;
  engagements: number;
  engagementRate: number | null;
  followerGrowth: number | null;
  score: number;
}

export interface AnalyticsDashboardDateRange {
  preset: '7d' | '14d' | '28d' | '30d' | 'custom';
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  days: number;
}

export interface AnalyticsDashboard {
  dateRange: AnalyticsDashboardDateRange;
  platformScope: AnalyticsPlatformScope;
  lastUpdatedAt: string | null;
  connectedPlatforms: string[];
  overview: AnalyticsOverviewMetrics;
  trends: {
    impressionsReachSeries: AnalyticsTrendPoint[];
    engagementSeries: AnalyticsTrendPoint[];
  };
  posts: AnalyticsPostInsight[];
  audience: AnalyticsAudienceInsights;
  insights: AnalyticsInsightCard[];
  platformComparison: AnalyticsPlatformComparison[];
  bestTimeToPost: AnalyticsBestTimeInsight;
}

export interface PlatformPerformanceSummary {
  platform: string;
  posts: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalEngagement: number;
  averageEngagementRate: number;
  latestRecordedAt: string | null;
  topPost: AnalyticsRecord | null;
  recentPosts: AnalyticsRecord[];
}

export interface WeeklyAnalyticsComparison {
  currentWeek: number;
  previousWeek: number;
  percentageChange: number;
  direction: WeeklyDirection;
}

export interface GenerationOverview {
  totalGeneratedContent: number;
  totalGeneratedImages: number;
  totalScheduledPosts: number;
  scheduledPostStatusBreakdown: Record<ScheduledPostStatus, number>;
  contentGenerationsToday: number;
  imageGenerationsToday: number;
  contentGenerationsThisMonth: number;
  imageGenerationsThisMonth: number;
  analyticsRecordsThisMonth: number;
  topPlatforms: AnalyticsTrendItem[];
  topGoals: AnalyticsTrendItem[];
  topTones: AnalyticsTrendItem[];
  topAudiences: AnalyticsTrendItem[];
  topKeywords: AnalyticsTrendItem[];
  platformSignals: PlatformPerformanceSummary[];
}

export interface AnalyticsOverview {
  generation: GenerationOverview;
  performance: AnalyticsSummary;
  weeklyComparison: WeeklyAnalyticsComparison;
  bestPostThisWeek: AnalyticsRecord | null;
}

export interface AnalyticsRecord {
  id: string;
  userId: string;
  scheduledPostId: string | null;
  contentId: string | null;
  platform: string | null;
  postExternalId: string | null;
  postType: string | null;
  caption: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reactions: number;
  videoPlays: number;
  replays: number;
  exits: number;
  profileVisits: number;
  postClicks: number;
  pageLikes: number;
  completionRate: number | null;
  followersAtPostTime: number | null;
  engagementRate: number | null;
  publishedTime: string | null;
  topComments: string[];
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAccount {
  id: string;
  userId: string;
  platform: SocialPlatform;
  accountId: string;
  accountName: string | null;
  profileUrl: string | null;
  oauthProvider: OAuthProvider | null;
  verificationStatus: SocialAccountVerificationStatus;
  verifiedAt: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
  connectedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSocialAccountInput {
  platform: SocialPlatform;
  accountId?: string;
  profileUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PendingFacebookPageCandidate {
  pageId: string;
  accountId: string;
  accountName: string;
  profileUrl: string | null;
  alreadyConnected: boolean;
  linkedInstagramUsername: string | null;
}

export interface PendingMetaFacebookPageSelection {
  selectionId: string;
  expiresAt: string;
  pages: PendingFacebookPageCandidate[];
}

export type MetaOAuthPopupResult =
  | {
      status: 'success';
      message: string;
    }
  | {
      status: 'error';
      message: string;
    }
  | {
      status: 'select_facebook_pages';
      message: string;
      selectionId: string;
    };

export interface ScheduledPost {
  id: string;
  userId: string;
  socialAccountId: string;
  contentId: string | null;
  generatedImageId: string | null;
  platform: SocialPlatform | null;
  caption: string | null;
  mediaUrl: string | null;
  mediaType: SchedulerMediaType | null;
  scheduledFor: string;
  status: ScheduledPostStatus;
  externalPostId: string | null;
  publishAttemptedAt: string | null;
  lastError: string | null;
  publishedAt: string | null;
  canEdit: boolean;
  canCancel: boolean;
  actionBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledPostInput {
  socialAccountId: string;
  contentId?: string | null;
  generatedImageId?: string | null;
  platform?: SocialPlatform;
  caption?: string;
  mediaUrl?: string;
  mediaType?: SchedulerMediaType | null;
  scheduledFor: string;
  status?: ScheduledPostStatus;
}

export interface BillingPlan {
  id: PlanType;
  displayName: string;
  description: string;
  amountInPaise: number;
  currency: string;
  interval: number;
  period: 'monthly' | 'yearly';
  monthlyLimit: number | null;
  isFree: boolean;
  checkoutEnabled: boolean;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: PlanType;
  status: SubscriptionStatus;
  monthlyLimit: number | null;
  currentPeriodEnd: string | null;
  razorpayCustomerId: string | null;
  razorpaySubscriptionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BillingCatalogResponse {
  currentSubscription: Subscription;
  plans: BillingPlan[];
}

export interface HomeMetric {
  label: string;
  value: number;
  suffix?: string;
}
