export type PlanType = 'free' | 'basic' | 'pro';
export type ApiStatus = 'success' | 'fail' | 'error';
export type ScheduledPostStatus =
  | 'pending'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'cancelled';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';
export type WeeklyDirection = 'up' | 'down' | 'flat';

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
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  industry: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandProfileInput {
  fullName: string;
  username?: string | null;
  avatarUrl?: string | null;
  industry?: string | null;
  targetAudience?: string | null;
  brandVoice?: string | null;
  description?: string | null;
}

export interface ProductInput {
  productName: string;
  productDescription?: string | null;
  productImageUrl?: string | null;
  platform?: string | null;
  goal?: string | null;
  tone?: string | null;
  audience?: string | null;
  keywords?: string[];
}

export interface ReelScript {
  hook: string;
  body: string;
  cta: string;
}

export interface GeneratedContentPack {
  captions: string[];
  hashtags: string[];
  reelScript: ReelScript;
}

export interface GeneratedContent
  extends ProductInput,
    GeneratedContentPack {
  id: string;
  userId: string;
  brandProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGeneratedContentInput
  extends ProductInput,
    GeneratedContentPack {
  brandProfileId?: string | null;
}

export interface GeneratedImage {
  id: string;
  userId: string;
  contentId: string | null;
  sourceImageUrl: string | null;
  generatedImageUrl: string;
  backgroundStyle: string | null;
  prompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGeneratedImageInput {
  contentId?: string | null;
  sourceImageUrl?: string | null;
  generatedImageUrl: string;
  backgroundStyle?: string | null;
  prompt?: string | null;
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
  platform?: string | null;
  caption?: string | null;
  mediaUrl?: string | null;
  scheduledFor: string;
  status?: ScheduledPostStatus;
}

export interface AnalyticsData {
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

export interface CreateAnalyticsInput {
  scheduledPostId?: string | null;
  contentId?: string | null;
  platform?: string | null;
  postExternalId?: string | null;
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  engagementRate?: number | null;
  recordedAt?: string;
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

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
