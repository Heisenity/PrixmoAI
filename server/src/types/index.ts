export type PlanType = 'free' | 'basic' | 'pro';
export type ApiStatus = 'success' | 'fail' | 'error';
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
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';
export type WeeklyDirection = 'up' | 'down' | 'flat';
export type ProfileSaveContext = 'onboarding' | 'settings' | 'system';
export type BrandMemoryType =
  | 'brand-profile-summary'
  | 'brand-description'
  | 'brand-voice-note'
  | 'platform-performance-insight'
  | 'user-generation-prompt'
  | 'generated-caption'
  | 'generated-hashtags'
  | 'generated-reel-script'
  | 'image-prompt';
export type BrandMemoryTaskType =
  | 'caption-generation'
  | 'hashtag-generation'
  | 'reel-script-generation'
  | 'image-generation'
  | 'brand-description'
  | 'scheduler-caption-recommendation';
export type BrandMemoryFeedbackEventType =
  | 'accepted'
  | 'rejected'
  | 'regenerated'
  | 'edited'
  | 'scheduled'
  | 'reused'
  | 'performance_promoted'
  | 'performance_demoted'
  | 'schedule_opened';

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  status: ApiStatus;
  message?: string;
  data?: T;
  errors?: ApiErrorDetail[];
}

export interface BrandProfile {
  id: string;
  userId: string;
  brandName: string | null;
  fullName: string;
  phoneNumber: string | null;
  username: string | null;
  avatarUrl: string | null;
  country: string | null;
  language: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  industry: string | null;
  primaryIndustry: string | null;
  secondaryIndustries: string[];
  targetAudience: string | null;
  brandVoice: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandMemoryMatch {
  id: string;
  brandProfileId: string | null;
  sourceTable: string;
  sourceId: string;
  sourceKey: string;
  memoryType: BrandMemoryType | string;
  contentText: string;
  metadata: Record<string, unknown>;
  similarity: number;
  vectorSimilarity?: number;
  keywordScore?: number;
  hybridScore?: number;
  rerankScore?: number;
  qualityScore?: number;
  promotionScore?: number;
  performanceScore?: number;
  reuseCount?: number;
  successfulReuseCount?: number;
  acceptanceCount?: number;
  rejectionCount?: number;
  regenerationCount?: number;
  editCount?: number;
  scheduleUseCount?: number;
  freshnessScore?: number;
  taskPolicyScore?: number;
  compositeScore?: number;
  lastFeedbackAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandMemoryFeedbackEvent {
  id: string;
  userId: string;
  brandProfileId: string | null;
  sourceTable: string;
  sourceId: string;
  sourceKey: string;
  memoryType: BrandMemoryType | string;
  eventType: BrandMemoryFeedbackEventType;
  platform: string | null;
  contentId: string | null;
  generatedImageId: string | null;
  scheduledPostId: string | null;
  scheduledItemId: string | null;
  acceptedFeedbackEventId: string | null;
  usedForScheduler: boolean | null;
  usedSameCaptionForScheduler: boolean | null;
  intensity: number;
  wasAiRecommended: boolean;
  weightDelta: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BrandMemoryGenerationLog {
  id: string;
  userId: string;
  brandProfileId: string | null;
  taskType: BrandMemoryTaskType | string;
  requestContext: string | null;
  provider: string | null;
  rerankProvider: string | null;
  fallbackUsed: boolean;
  retrievalStrategy: string | null;
  queryText: string;
  selectedPlatform: string | null;
  selectedGoal: string | null;
  retrievedMemories: Record<string, unknown>[];
  selectedMemories: Record<string, unknown>[];
  analyticsContext: Record<string, unknown>;
  evaluationSummary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BrandPlatformMemorySnapshot {
  id: string;
  userId: string;
  brandProfileId: string | null;
  platform: string;
  snapshotType: string;
  summaryText: string;
  metrics: Record<string, unknown>;
  topPosts: Record<string, unknown>[];
  signals: Record<string, unknown>;
  sourceWindowStart: string | null;
  sourceWindowEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandProfileInput {
  brandName: string;
  fullName: string;
  phoneNumber?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  country?: string | null;
  language?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  industry?: string | null;
  primaryIndustry?: string | null;
  secondaryIndustries?: string[];
  targetAudience?: string | null;
  brandVoice?: string | null;
  description?: string | null;
}

export interface ProductInput {
  brandName?: string | null;
  useBrandName?: boolean;
  productName: string;
  productDescription?: string | null;
  productImageUrl?: string | null;
  platform?: string | null;
  goal?: string | null;
  tone?: string | null;
  audience?: string | null;
  keywords?: string[];
}

export type RealtimeTrendResearchPurpose =
  | 'caption-generation'
  | 'hashtag-generation'
  | 'reel-script-generation'
  | 'image-generation';

export type TrendSignalSource = 'web' | 'social';

export interface TrendSignalReason {
  label: string;
  weight: number;
}

export interface TrendSignalCandidate {
  id: string;
  source: TrendSignalSource;
  platform: string | null;
  title: string | null;
  text: string;
  url: string | null;
  authorName: string | null;
  hashtags: string[];
  publishedAt: string | null;
  ageHours: number | null;
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    followers: number;
  };
  topicMatchScore: number;
  freshnessScore: number;
  shareRatioScore: number;
  commentIntensityScore: number;
  creatorStreakScore: number;
  sentimentBoostScore: number;
  qualityScore: number;
  viralScore: number;
  reasons: TrendSignalReason[];
}

export interface RealtimeTrendInsight {
  headline: string;
  explanation: string;
  platform: string | null;
  source: TrendSignalSource;
  viralScore: number;
  reasons: TrendSignalReason[];
  referenceUrl: string | null;
}

export interface RealtimeTrendIntelligence {
  purpose: RealtimeTrendResearchPurpose;
  generatedAt: string;
  queryText: string;
  selectedPlatform: string | null;
  selectedGoal: string | null;
  searchQueries: string[];
  scrapedPlatforms: string[];
  summary: string;
  topHashtags: string[];
  insights: RealtimeTrendInsight[];
  topCandidates: TrendSignalCandidate[];
  filteredOutCount: number;
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

export interface GeneratedContentPack {
  captions: CaptionVariant[];
  hashtags: string[];
  reelScript: ReelScript;
}

export interface GeneratedContent
  extends ProductInput,
    GeneratedContentPack {
  id: string;
  userId: string;
  brandProfileId: string | null;
  conversationId: string | null;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
  storagePublicUrl?: string | null;
  storageContentType?: string | null;
  storageSizeBytes?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGeneratedContentInput
  extends ProductInput,
    GeneratedContentPack {
  brandProfileId?: string | null;
  conversationId?: string | null;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
  storagePublicUrl?: string | null;
  storageContentType?: string | null;
  storageSizeBytes?: number | null;
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
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
  storagePublicUrl?: string | null;
  storageContentType?: string | null;
  storageSizeBytes?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGeneratedImageInput {
  contentId?: string | null;
  conversationId?: string | null;
  sourceImageUrl?: string | null;
  generatedImageUrl: string;
  backgroundStyle?: string | null;
  prompt?: string | null;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageObjectKey?: string | null;
  storagePublicUrl?: string | null;
  storageContentType?: string | null;
  storageSizeBytes?: number | null;
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
  accountId: string;
  accountName?: string | null;
  profileUrl?: string | null;
  oauthProvider?: OAuthProvider | null;
  verificationStatus?: SocialAccountVerificationStatus;
  verifiedAt?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateSocialAccountInput
  extends Partial<CreateSocialAccountInput> {}

export interface ScheduledPost {
  id: string;
  userId: string;
  socialAccountId: string;
  contentId: string | null;
  generatedImageId: string | null;
  platform: string | null;
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
  metadata: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
}

export interface UpdateScheduledItemInput
  extends Partial<CreateScheduledItemInput> {
  status?: ScheduledItemStatus;
}

export interface ScheduleCaptionRecommendation {
  recommendedCaption: string;
  selectedVariantIndex: number;
  sourceKey: string | null;
  reasoning: string;
  note: string;
  strategy: 'ai' | 'fallback';
  provider: 'groq' | 'gemini' | 'fallback' | null;
  supportingMemoryIds: string[];
  observabilityLogId: string | null;
}

export interface CreateScheduledPostInput {
  socialAccountId: string;
  contentId?: string | null;
  generatedImageId?: string | null;
  platform?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  mediaType?: SchedulerMediaType | null;
  scheduledFor: string;
  status?: ScheduledPostStatus;
  externalPostId?: string | null;
  publishAttemptedAt?: string | null;
  lastError?: string | null;
}

export interface UpdateScheduledPostRequestInput {
  socialAccountId?: string;
  contentId?: string | null;
  generatedImageId?: string | null;
  platform?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  mediaType?: SchedulerMediaType | null;
  scheduledFor?: string;
  status?: ScheduledPostStatus;
  externalPostId?: string | null;
  publishAttemptedAt?: string | null;
  lastError?: string | null;
}

export interface AnalyticsData {
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

export interface CreateAnalyticsInput {
  scheduledPostId?: string | null;
  contentId?: string | null;
  platform?: string | null;
  postExternalId?: string | null;
  postType?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reactions?: number;
  videoPlays?: number;
  replays?: number;
  exits?: number;
  profileVisits?: number;
  postClicks?: number;
  pageLikes?: number;
  completionRate?: number | null;
  followersAtPostTime?: number | null;
  engagementRate?: number | null;
  publishedTime?: string | null;
  topComments?: string[];
  recordedAt?: string;
}

export interface CreateAnalyticsAudienceSnapshotInput {
  socialAccountId: string;
  platform: string;
  followers?: number;
  impressions?: number;
  reach?: number;
  profileVisits?: number;
  pageLikes?: number;
  ageDistribution?: AnalyticsAudienceBreakdownItem[];
  genderDistribution?: AnalyticsAudienceBreakdownItem[];
  topLocations?: AnalyticsAudienceBreakdownItem[];
  activeHours?: Record<string, number>;
  recordedAt?: string;
}

export interface AnalyticsAudienceSnapshot {
  id: string;
  userId: string;
  socialAccountId: string;
  platform: string;
  followers: number;
  impressions: number;
  reach: number;
  profileVisits: number;
  pageLikes: number;
  ageDistribution: AnalyticsAudienceBreakdownItem[];
  genderDistribution: AnalyticsAudienceBreakdownItem[];
  topLocations: AnalyticsAudienceBreakdownItem[];
  activeHours: Record<string, number>;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
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
  topPost: AnalyticsData | null;
  recentPosts: AnalyticsData[];
}

export interface WeeklyAnalyticsComparison {
  currentWeek: number;
  previousWeek: number;
  percentageChange: number;
  direction: WeeklyDirection;
}

export interface AnalyticsTrendItem {
  value: string;
  count: number;
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

export interface AnalyticsLearningPattern {
  dimension: string;
  label: string;
  sampleSize: number;
  averagePerformanceScore: number;
  lift: number;
  supportingMetrics: Record<string, number>;
  explanation: string;
}

export interface AnalyticsLearningProfile {
  id: string;
  userId: string;
  brandProfileId: string | null;
  platform: string;
  profileType: string;
  summaryText: string;
  recommendationText: string | null;
  metrics: Record<string, unknown>;
  patterns: AnalyticsLearningPattern[];
  weakPatterns: AnalyticsLearningPattern[];
  topContentIds: string[];
  analyticsContext: Record<string, unknown>;
  sourceWindowStart: string | null;
  sourceWindowEnd: string | null;
  lastAnalyzedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsLearningDashboard {
  summary: string;
  topRecommendation: string | null;
  recommendationReason: string | null;
  recommendationAccuracy: number | null;
  recommendationAccuracyLabel: string | null;
  confidence: 'low' | 'medium' | 'high';
  lastAnalyzedAt: string | null;
  isReady: boolean;
  postsConsidered: number;
  minimumPostsRequired: number;
  missingDataMessage: string | null;
  profiles: AnalyticsLearningProfile[];
}

export interface AnalyticsLearningPostSignal {
  id: string;
  userId: string;
  analyticsId: string;
  contentId: string | null;
  scheduledPostId: string | null;
  platform: string;
  sourcePostKey: string;
  performanceScore: number;
  outcomeLabel: 'winning' | 'solid' | 'neutral' | 'weak';
  formatType: string | null;
  captionLengthBucket: string | null;
  hookStyle: string | null;
  ctaStyle: string | null;
  hashtagBucket: string | null;
  topicTags: string[];
  metrics: Record<string, unknown>;
  strategy: Record<string, unknown>;
  userFeedback: Record<string, unknown>;
  publishedTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsLearningRun {
  id: string;
  userId: string;
  triggerSource: string;
  platforms: string[];
  status: 'running' | 'completed' | 'failed';
  postsAnalyzed: number;
  profilesUpdated: number;
  summary: Record<string, unknown>;
  errorMessage: string | null;
  sourceWindowStart: string | null;
  sourceWindowEnd: string | null;
  createdAt: string;
  updatedAt: string;
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
  engagedPostsConsidered: number;
  engagementCoverage: number;
  signalStatus:
    | 'ready'
    | 'not-enough-posts'
    | 'no-engagement'
    | 'low-engagement-coverage'
    | 'no-clear-winner';
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
  learning: AnalyticsLearningDashboard;
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

export interface CreateSubscriptionInput {
  userId: string;
  plan: PlanType;
  status?: SubscriptionStatus;
  monthlyLimit?: number | null;
  currentPeriodEnd?: string | null;
  razorpayCustomerId?: string | null;
  razorpaySubscriptionId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UsageTrackingEvent {
  id: string;
  userId: string;
  featureKey: string;
  usedAt: string;
  metadata: Record<string, unknown>;
}

export interface DeveloperResearchSummary {
  totalUsers: number;
  totalUsageEvents: number;
  totalContentGenerations: number;
  totalImageGenerations: number;
  featureBreakdown: AnalyticsTrendItem[];
  providerBreakdown: AnalyticsTrendItem[];
  topPlatforms: AnalyticsTrendItem[];
  topGoals: AnalyticsTrendItem[];
  topTones: AnalyticsTrendItem[];
  topAudiences: AnalyticsTrendItem[];
  topKeywords: AnalyticsTrendItem[];
  topProducts: AnalyticsTrendItem[];
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
