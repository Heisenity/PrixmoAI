export type ApiStatus = 'success' | 'fail' | 'error';
export type PlanType = 'free' | 'basic' | 'pro';
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
  contentGenerationsThisMonth: number;
  imageGenerationsThisMonth: number;
  analyticsRecordsThisMonth: number;
  topPlatforms: AnalyticsTrendItem[];
  topGoals: AnalyticsTrendItem[];
  topTones: AnalyticsTrendItem[];
  topAudiences: AnalyticsTrendItem[];
  topKeywords: AnalyticsTrendItem[];
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
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAccount {
  id: string;
  userId: string;
  platform: string;
  accountId: string;
  accountName: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown>;
  connectedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSocialAccountInput {
  platform: string;
  accountId: string;
  accountName?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  socialAccountId: string;
  contentId: string | null;
  generatedImageId: string | null;
  platform: string | null;
  caption: string | null;
  mediaUrl: string | null;
  scheduledFor: string;
  status: ScheduledPostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledPostInput {
  socialAccountId: string;
  contentId?: string | null;
  generatedImageId?: string | null;
  platform?: string;
  caption?: string;
  mediaUrl?: string;
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
