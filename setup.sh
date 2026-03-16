#!/bin/bash

# Root files
touch .gitignore .env.example README.md package.json

# CLIENT
mkdir -p client/public
touch client/public/logo.svg client/public/favicon.ico

mkdir -p client/src/pages/auth client/src/pages/onboarding client/src/pages/dashboard \
  client/src/pages/generate client/src/pages/scheduler client/src/pages/analytics \
  client/src/pages/billing client/src/pages/settings

touch client/src/pages/auth/LoginPage.tsx client/src/pages/auth/SignupPage.tsx
touch client/src/pages/onboarding/OnboardingPage.tsx
touch client/src/pages/dashboard/DashboardPage.tsx
touch client/src/pages/generate/GeneratePage.tsx
touch client/src/pages/scheduler/SchedulerPage.tsx
touch client/src/pages/analytics/AnalyticsPage.tsx
touch client/src/pages/billing/BillingPage.tsx
touch client/src/pages/settings/SettingsPage.tsx

mkdir -p client/src/components/ui client/src/components/layout \
  client/src/components/generate client/src/components/scheduler \
  client/src/components/analytics client/src/components/billing \
  client/src/components/shared

touch client/src/components/ui/{button,input,card,modal,toast,badge,tabs,select,skeleton}.tsx
touch client/src/components/layout/{Navbar,Sidebar,PageWrapper,AuthLayout}.tsx
touch client/src/components/generate/{ProductUploadForm,CaptionCard,CaptionList,HashtagDisplay,ReelScript,GeneratedImage,BackgroundSelector,RegenerateButton}.tsx
touch client/src/components/scheduler/{CalendarView,PostCard,ScheduleModal,ConnectAccountButton}.tsx
touch client/src/components/analytics/{StatsCard,BestPostWidget,PostMetricsRow,WeeklyScoreCard}.tsx
touch client/src/components/billing/{PlanCard,CurrentPlanBadge}.tsx
touch client/src/components/shared/{LoadingSpinner,ErrorMessage,EmptyState,UsageMeter,ProtectedRoute}.tsx

mkdir -p client/src/hooks client/src/store client/src/lib client/src/types
touch client/src/hooks/{useAuth,useContent,useImages,useScheduler,useAnalytics,useBilling,useBrandProfile}.ts
touch client/src/store/{authStore,contentStore,uiStore}.ts
touch client/src/lib/{axios,utils,constants}.ts
touch client/src/types/index.ts
touch client/src/main.tsx client/src/App.tsx client/src/index.css

touch client/.env client/.env.example client/index.html client/vite.config.ts \
  client/tailwind.config.ts client/tsconfig.json client/package.json

# SERVER
mkdir -p server/src/routes server/src/controllers server/src/middleware \
  server/src/ai/prompts server/src/db/migrations server/src/db/queries \
  server/src/services server/src/types server/src/config

touch server/src/index.ts

touch server/src/routes/{auth,content,image,scheduler,analytics,billing}.routes.ts
touch server/src/controllers/{auth,content,image,scheduler,analytics,billing}.controller.ts
touch server/src/middleware/{auth,validate,rateLimit,planLimit,errorHandler}.middleware.ts

touch server/src/ai/gemini.ts server/src/ai/imageGen.ts
touch server/src/ai/prompts/{caption,hashtag,script}.prompt.ts

touch server/src/db/supabase.ts server/src/db/schema.sql
touch server/src/db/migrations/{001_init,002_content,003_scheduler,004_analytics,005_billing}.sql
touch server/src/db/queries/{users,brandProfiles,content,images,scheduledPosts,analytics,subscriptions}.ts

touch server/src/services/{meta,razorpay,r2}.service.ts
touch server/src/types/index.ts
touch server/src/config/constants.ts

touch server/.env server/.env.example server/tsconfig.json server/nodemon.json server/package.json

# GitHub Actions
mkdir -p .github/workflows
touch .github/workflows/ci.yml .github/workflows/migrate.yml

echo "✅ Project structure created!"
