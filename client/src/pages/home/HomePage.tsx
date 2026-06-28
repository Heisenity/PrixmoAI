import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Camera,
  Check,
  CircleX,
  ImagePlus,
  Play,
  Quote,
  Sparkles,
  Star,
  Upload,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/home.css';
import { BlackHoleCanvas } from '../../components/home/BlackHoleCanvas';
import { Footer } from '../../components/layout/Footer';
import { Navbar } from '../../components/layout/Navbar';
import { Badge } from '../../components/ui/badge';
import { buttonClassName } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useAuth } from '../../hooks/useAuth';
import { APP_NAME } from '../../lib/constants';
import { cn } from '../../lib/utils';

const socialProofItems = [
  'Clothing Brands',
  'Restaurants',
  'Salons',
  'Ecommerce Sellers',
  'Gyms',
  'Home Decor',
] as const;

type HeroOutputId =
  | 'strategy'
  | 'content'
  | 'reel'
  | 'influencer'
  | 'schedule'
  | 'insights';

type HeroAgentCardDefinition = {
  id: HeroOutputId;
  agent: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  restOffset: { x: number; y: number };
  floatDuration: number;
  floatDelay: number;
  hideOnMobile?: boolean;
};

const heroAgentCards: readonly HeroAgentCardDefinition[] = [
  {
    id: 'content',
    agent: 'Content Agent',
    title: 'Caption Generated',
    detail: 'Instagram • Ready to post',
    icon: Sparkles,
    restOffset: { x: -126, y: -118 },
    floatDuration: 9.4,
    floatDelay: 0.2,
  },
  {
    id: 'strategy',
    agent: 'Strategy Agent',
    title: 'Campaign Plan Ready',
    detail: '7-day content strategy',
    icon: BarChart3,
    restOffset: { x: 126, y: -118 },
    floatDuration: 11.2,
    floatDelay: 0.6,
  },
  {
    id: 'reel',
    agent: 'Reel Agent',
    title: 'Reel Created',
    detail: 'Hook + CTA optimized',
    icon: WandSparkles,
    restOffset: { x: -148, y: -6 },
    floatDuration: 10.4,
    floatDelay: 1,
    hideOnMobile: true,
  },
  {
    id: 'schedule',
    agent: 'Scheduling Agent',
    title: 'Post Scheduled',
    detail: 'Today • 7:30 PM',
    icon: CalendarClock,
    restOffset: { x: 122, y: 116 },
    floatDuration: 12.4,
    floatDelay: 1.2,
  },
  {
    id: 'influencer',
    agent: 'Influencer Agent',
    title: 'AI Influencer Activated',
    detail: 'UGC promo ready',
    icon: Star,
    restOffset: { x: 148, y: 4 },
    floatDuration: 8.8,
    floatDelay: 0.8,
    hideOnMobile: true,
  },
  {
    id: 'insights',
    agent: 'Insights Agent',
    title: 'Content Gap Detected',
    detail: 'Your competitors missed this trend',
    icon: BarChart3,
    restOffset: { x: -122, y: 114 },
    floatDuration: 10.8,
    floatDelay: 1.4,
    hideOnMobile: true,
  },
] as const;

type HeroSequencePhase =
  | 'idle'
  | 'absorbingInputs'
  | 'whiteHoleFlash'
  | 'emittingOutputs'
  | 'returnToBlackhole';

type HeroUserInputDefinition = {
  id: string;
  text: string;
  restOffset: { x: number; y: number };
  spiralTurns: number;
  power: number;
  hideOnMobile?: boolean;
};

const heroUserInputs: readonly HeroUserInputDefinition[] = [
  {
    id: 'saree-leads',
    text: 'Need more leads for my saree business',
    restOffset: { x: -136, y: -112 },
    spiralTurns: 0.36,
    power: 1.72,
  },
  {
    id: 'product-reels',
    text: 'Create reels for my new product launch',
    restOffset: { x: 136, y: -104 },
    spiralTurns: -0.32,
    power: 1.86,
  },
  {
    id: 'instagram-marketing',
    text: 'Help me market on Instagram',
    restOffset: { x: -154, y: -8 },
    spiralTurns: 0.28,
    power: 1.68,
    hideOnMobile: true,
  },
  {
    id: 'better-engagement',
    text: 'I want better engagement this week',
    restOffset: { x: 148, y: 10 },
    spiralTurns: -0.38,
    power: 1.78,
  },
  {
    id: 'festive-offer',
    text: 'Promote my festive offer',
    restOffset: { x: -132, y: 104 },
    spiralTurns: 0.3,
    power: 1.7,
    hideOnMobile: true,
  },
  {
    id: 'brand-content',
    text: 'Need content for my brand',
    restOffset: { x: 132, y: 112 },
    spiralTurns: -0.34,
    power: 1.74,
  },
] as const;

const HERO_IDLE_MS = 1600;
const HERO_INPUT_READ_MS = 2000;
const HERO_INPUT_TRAVEL_MS = 1200;
const HERO_INPUT_DURATION_MS = HERO_INPUT_READ_MS + HERO_INPUT_TRAVEL_MS;
const HERO_INPUT_HOLD_MS = HERO_INPUT_READ_MS;
const HERO_INPUT_STEP_MS = HERO_INPUT_DURATION_MS + 180;
const HERO_PROCESS_MS = 450;
const HERO_WHITE_HOLE_MS = 650;
const HERO_EMIT_MS = 980;
const HERO_EMIT_STAGGER_MS = 180;
const HERO_RETURN_IDLE_MS = 6000;
const HERO_EVENT_HORIZON_RADIUS = 54;
const HERO_TIDAL_RADIUS = 118;
const HERO_INPUT_FRAME_COUNT = 60;

const getAngleToCenter = ({ x, y }: { x: number; y: number }) =>
  (Math.atan2(y, x) * 180) / Math.PI;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const buildHeroInputMotion = ({
  power,
  restOffset,
  spiralTurns,
}: HeroUserInputDefinition) => {
  const startRadius = Math.sqrt(restOffset.x ** 2 + restOffset.y ** 2);
  const startAngle = Math.atan2(restOffset.y, restOffset.x);
  const x: number[] = [];
  const y: number[] = [];
  const scale: number[] = [];
  const scaleX: number[] = [];
  const scaleY: number[] = [];
  const opacity: number[] = [];
  const rotate: number[] = [];
  const filter: string[] = [];
  const tailOpacity: number[] = [];
  const tailScaleX: number[] = [];
  const tailScaleY: number[] = [];
  const tailFilter: string[] = [];
  const spiralOpacity: number[] = [];
  const spiralScale: number[] = [];
  const spiralRotate: number[] = [];
  const times: number[] = [];
  const holdRatio = HERO_INPUT_HOLD_MS / HERO_INPUT_DURATION_MS;
  const holdFrameCount = Math.max(2, Math.round(HERO_INPUT_FRAME_COUNT * holdRatio));
  const travelFrameCount = Math.max(HERO_INPUT_FRAME_COUNT - holdFrameCount, 2);

  for (let index = 0; index < HERO_INPUT_FRAME_COUNT; index += 1) {
    const isHolding = index < holdFrameCount;
    const travelT = isHolding
      ? 0
      : (index - holdFrameCount) / Math.max(travelFrameCount - 1, 1);
    const curveT = Math.pow(travelT, 1.45);
    const radius = startRadius * Math.pow(Math.max(0, 1 - curveT), power);
    const stretchProgress = clampNumber(
      (HERO_TIDAL_RADIUS - radius) / Math.max(HERO_TIDAL_RADIUS - HERO_EVENT_HORIZON_RADIUS, 1),
      0,
      1,
    );
    const stretchCurve = Math.pow(stretchProgress, 2.2);
    const theta =
      startAngle + spiralTurns * Math.PI * 2 * (travelT + 0.24 * stretchCurve);
    const point = {
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
      radius,
    };
    const collapseProgress = clampNumber((travelT - 0.82) / 0.18, 0, 1);
    const collapseCurve = Math.pow(collapseProgress, 1.45);
    const angleToCenter = (Math.atan2(-point.y, -point.x) * 180) / Math.PI;

    if (isHolding) {
      times.push((index / Math.max(holdFrameCount - 1, 1)) * holdRatio);
    } else {
      times.push(
        holdRatio +
          ((index - holdFrameCount) / Math.max(travelFrameCount - 1, 1)) *
            (1 - holdRatio),
      );
    }

    x.push(point.x);
    y.push(point.y);
    scale.push(clampNumber(1 - 0.08 * travelT - 0.26 * stretchCurve - 0.58 * collapseCurve, 0.05, 1));
    scaleX.push(1 + 2.05 * stretchCurve + 0.85 * collapseCurve);
    scaleY.push(clampNumber(1 - 0.78 * stretchCurve - 0.36 * collapseCurve, 0.04, 1));
    opacity.push(clampNumber(1 - 0.38 * stretchCurve - 0.62 * collapseCurve, 0, 1));
    rotate.push(angleToCenter * clampNumber(travelT * 1.18, 0, 1));
    filter.push(`blur(${(1.6 * stretchCurve + 4.4 * collapseCurve).toFixed(2)}px)`);
    tailOpacity.push(clampNumber(0.08 + 0.82 * stretchCurve - 0.26 * collapseCurve, 0, 0.94));
    tailScaleX.push(0.82 + 2.8 * stretchCurve + 0.92 * collapseCurve);
    tailScaleY.push(clampNumber(0.92 - 0.7 * stretchCurve - 0.24 * collapseCurve, 0.12, 0.92));
    tailFilter.push(`blur(${(8 + 9 * stretchCurve + 3 * collapseCurve).toFixed(2)}px)`);
    spiralOpacity.push(
      clampNumber((stretchCurve - 0.05) * 1.3 + 0.42 * collapseCurve, 0, 0.98),
    );
    spiralScale.push(0.74 + 0.54 * stretchCurve + 0.36 * collapseCurve);
    spiralRotate.push(28 * travelT + 190 * stretchCurve + 120 * collapseCurve);
  }

  return {
    filter,
    opacity,
    rotate,
    scale,
    scaleX,
    scaleY,
    tailFilter,
    tailOpacity,
    tailScaleX,
    tailScaleY,
    spiralOpacity,
    spiralRotate,
    spiralScale,
    times,
    x,
    y,
  };
};

const problemCards = [
  {
    icon: Camera,
    title: 'Expensive Shoots',
    copy:
      'Professional product shoots cost Rs 15,000 to Rs 40,000 per session. Too expensive for most small businesses.',
  },
  {
    icon: CalendarClock,
    title: 'No Time to Post',
    copy:
      'You run the business, manage staff, and serve customers. Who has time to write captions every single day?',
  },
  {
    icon: BarChart3,
    title: 'Poor Engagement',
    copy:
      'Posting random content with no strategy gets zero reach and zero customers. Your competitors keep growing while you stay invisible.',
  },
] as const;

const howItWorksSteps = [
  {
    icon: Upload,
    title: 'Upload Your Product',
    copy:
      'Take a photo of your product on your phone. Upload it to PrixmoAI. Tell us your brand tone and what you want to achieve.',
  },
  {
    icon: WandSparkles,
    title: 'AI Creates Everything',
    copy:
      'PrixmoAI generates 3 caption options, 15 realtime trending hashtags, a reel script, a professional product image and a professional video instantly.',
  },
  {
    icon: CalendarClock,
    title: 'Schedule and Relax',
    copy:
      'Pick your favourite caption, choose a date, and PrixmoAI posts directly to Instagram and Facebook at the perfect time.',
  },
] as const;

const featureCards = [
  {
    icon: WandSparkles,
    title: 'AI Caption Generator',
    copy:
      'Get 3 caption variants in short, medium, and story format written in your exact brand voice for every single product.',
  },
  {
    icon: ImagePlus,
    title: 'Product Image Enhancer',
    copy:
      'Transform your phone photos into studio-quality product visuals with professional backgrounds instantly.',
  },
  {
    icon: Sparkles,
    title: 'Smart Hashtag Generator',
    copy:
      'Get 15 perfectly researched hashtags tailored to your industry, audience, and platform for maximum reach.',
  },
  {
    icon: ArrowRight,
    title: 'Reel Script & Video Generator',
    copy:
      'Turn your product into ready to post reels that drive results.',
  },
  {
    icon: CalendarClock,
    title: 'Auto Scheduler',
    copy:
      'Connect Instagram and Facebook and schedule your posts to go live at the perfect time automatically.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    copy:
      'See which posts get the most reach, likes, and comments so you know exactly what content works for you.',
  },
] as const;

const pricingPlans: Array<{
  id: 'free' | 'basic' | 'pro';
  name: string;
  price: string;
  cadence: string;
  description: string;
  cta: string;
  badge?: string;
  features: Array<{ label: string; included: boolean }>;
}> = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    cadence: '/ month',
    description: 'Try PrixmoAI and create your first content',
    cta: 'Get Started Free',
    features: [
      { label: '15 AI captions for engagement / day', included: true },
      { label: '5 product image generations / day', included: true },
      { label: 'Watermarked images', included: true },
      { label: 'Trending Hashtag generator', included: true },
      { label: ' Reel script generator / day', included: true },
      { label: 'Schedule 1 account', included: true },
      { label: 'Analytics', included: false },
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: '₹499',
    cadence: '/ month',
    description: 'For creators and growing businesses',
    cta: 'Start Basic Plan',
    badge: 'Most Popular',
    features: [
      { label: '25 AI captions for engagement / day', included: true },
      { label: '15 product image generations / day', included: true },
       {label: 'No watermark', included: true },
      { label: 'Trending Hashtag generator', included: true },
      { label: '15 Reel script generator / day', included: true },
      { label: 'Schedule 2 social account', included: true },
      { label: 'Basic analytics', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹999',
    cadence: '/ month',
    description: 'Made for brands playing at the next level',
    cta: 'Start Pro Plan',
    features: [
      { label: '60 AI captions for engagement / day', included: true },
      { label: '35 high-speed image generations / day', included: true },
      
      { label: 'Trending Hashtag generator', included: true },
      { label: '30 Reel scripts / day', included: true },
      { label: 'Schedule 5 social accounts', included: true },
      { label: 'Advanced analytics dashboard', included: true },
      { label: 'Caption keyword optimizer', included: true },
      { label: 'Priority support', included: true },
      
    ],
  },
] as const;

const testimonials = [
  {
    name: 'Priya S.',
    role: 'Clothing Brand Owner, Jaipur',
    quote:
      'Pehle product shoot ke liye Rs 20,000 kharch karte the. Ab PrixmoAI se 10 minutes mein professional photos aur captions ready ho jaate hain. Best investment for my boutique.',
  },
  {
    name: 'Rahul M.',
    role: 'Restaurant Owner, Mumbai',
    quote:
      'My Instagram reach went from 200 to 5,000 in one month just by using PrixmoAI consistently. The captions feel natural and Indian, not like a robot wrote them.',
  },
  {
    name: 'Anjali K.',
    role: 'Salon Owner, Bangalore',
    quote:
      'As a salon owner I have zero time for social media. PrixmoAI schedules everything for me. I just upload photos on Sunday and the whole week is sorted automatically.',
  },
] as const;

const audienceCards = [
  {
    title: 'Clothing & Fashion',
    copy: 'Launch new drops faster with polished images, festival-ready captions, and stronger daily consistency.',
  },
  {
    title: 'Restaurants & Food',
    copy: 'Turn new dishes and offers into high-frequency posts without spending every evening writing content.',
  },
  {
    title: 'Salons & Beauty',
    copy: 'Showcase transformations, book more appointments, and keep your Instagram active even during busy weeks.',
  },
  {
    title: 'Ecommerce Sellers',
    copy: 'Upgrade plain catalogue photos into premium-looking assets that convert better on social and marketplaces.',
  },
  {
    title: 'Gyms & Fitness',
    copy: 'Create daily motivation, offer-led campaigns, and clean before-after storytelling without a content team.',
  },
  {
    title: 'Home Decor',
    copy: 'Present collections with premium styling and captions that feel aspirational, not copied from competitors.',
  },
] as const;

const stats = [
  { value: '500+', label: 'Businesses Using PrixmoAI' },
  { value: '4.8 / 5', label: 'Average Rating' },
  { value: '10x', label: 'Faster Content Creation' },
  { value: '₹0', label: 'To Start Today' },
] as const;

const faqItems = [
  {
    question: 'Do I need to know anything about marketing?',
    answer:
      'Not at all. Just upload your product photo, tell us your brand tone, and PrixmoAI handles the content system automatically.',
  },
  {
    question: 'Will the captions sound Indian and natural?',
    answer:
      'Yes. PrixmoAI is designed for Indian businesses. It understands Hinglish, Indian festivals, local context, and what resonates with Indian audiences.',
  },
  {
    question: 'Do I need a business Instagram account?',
    answer:
      'Yes. To use scheduling, you will need an Instagram Business account. Converting from a personal account is free and usually takes only a couple of minutes.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. There are no contracts, no lock-in, and no hidden conditions. You can cancel from account settings whenever you want.',
  },
  {
    question: 'Is my product data safe?',
    answer:
      'Absolutely. Your images and generated content stay protected in your workspace, and we do not share them with anyone.',
  },
  {
    question: 'What if I run out of generations?',
    answer:
      'You will see a clear notification and an upgrade option. Nothing is charged automatically without your consent.',
  },
] as const;

const comparisonRows = {
  before: [
    'Plain product photo from phone',
    'Caption: "New collection available. DM to order."',
    '0 hashtags',
    'Posted randomly',
  ],
  after: [
    'Studio-quality AI enhanced product image',
    'Caption: "Yeh toh sirf ek kurti nahi, yeh aapki story hai. Diwali vibes with our new cotton collection. Limited pieces. DM fast!"',
    '15 targeted hashtags',
    'Scheduled at peak time',
  ],
} as const;

const ScrollScrub = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className={cn('scrub-card-shell', className)}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.992 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

const SectionHeading = ({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) => (
  <div className="landing-section__header">
    <Badge className="landing-pill landing-pill--section">{eyebrow}</Badge>
    <h2>{title}</h2>
    <p className="landing-copy landing-copy--center">{description}</p>
  </div>
);

const FeatureIcon = ({ icon: Icon }: { icon: LucideIcon }) => (
  <span className="feature-icon">
    <Icon size={18} />
  </span>
);

const heroEase = [0.22, 1, 0.36, 1] as const;
const MotionLink = motion(Link);

const heroContentVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.08,
    },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.72,
      ease: heroEase,
    },
  },
};

const HeroAgentCard = ({
  card,
  index,
  phase,
  isHovered,
  onHoverChange,
  prefersReducedMotion,
}: {
  card: HeroAgentCardDefinition;
  index: number;
  phase: HeroSequencePhase;
  isHovered: boolean;
  onHoverChange: (isHovered: boolean) => void;
  prefersReducedMotion: boolean;
}) => {
  const Icon = card.icon;
  const angleToCenter = getAngleToCenter(card.restOffset);
  const canHover = phase === 'returnToBlackhole';
  const hiddenOutput = {
    opacity: 0,
    x: 0,
    y: 0,
    scale: 0.96,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
    filter: 'blur(2px)',
  };
  const idleAnimation = {
    opacity: 1,
    x: [
      card.restOffset.x,
      card.restOffset.x + 4,
      card.restOffset.x,
      card.restOffset.x - 4,
      card.restOffset.x,
    ],
    y: [
      card.restOffset.y,
      card.restOffset.y - 5,
      card.restOffset.y,
      card.restOffset.y + 4,
      card.restOffset.y,
    ],
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotate: [0, 0.35, 0, -0.35, 0],
    filter: 'blur(0px)',
  };
  const getAnimation = () => {
    if (prefersReducedMotion) {
      return {
        opacity: 1,
        x: card.restOffset.x,
        y: card.restOffset.y,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotate: 0,
        filter: 'blur(0px)',
      };
    }

    if (phase === 'idle' || phase === 'absorbingInputs' || phase === 'whiteHoleFlash') {
      return hiddenOutput;
    }

    if (phase === 'emittingOutputs') {
      return {
        opacity: [0, 0.55, 1],
        x: [0, card.restOffset.x * 0.55, card.restOffset.x],
        y: [0, card.restOffset.y * 0.55, card.restOffset.y],
        scale: [0.22, 0.82, 1],
        scaleX: [1.18, 1.04, 1],
        scaleY: [0.72, 0.96, 1],
        rotate: [angleToCenter * 0.5, angleToCenter * 0.16, 0],
        filter: ['blur(8px)', 'blur(3px)', 'blur(0px)'],
      };
    }

    return idleAnimation;
  };
  const getTransition = () => {
    if (prefersReducedMotion) {
      return { duration: 0 };
    }

    if (phase === 'emittingOutputs') {
      return {
        duration: HERO_EMIT_MS / 1000,
        delay: (index * HERO_EMIT_STAGGER_MS) / 1000,
        ease: heroEase,
        times: [0, 0.58, 1],
      };
    }

    if (phase === 'returnToBlackhole') {
      return {
        duration: card.floatDuration,
        delay: card.floatDelay,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeInOut',
      };
    }

    return { duration: 0.28, ease: heroEase };
  };

  return (
    <motion.div
      className={cn(
        'hero-agent-card-shell',
        card.hideOnMobile && 'hero-agent-card-shell--mobile-hidden',
      )}
      initial={false}
    >
      <motion.div
        className={cn(
          'hero-agent-card',
          phase === 'emittingOutputs' && 'hero-agent-card--active',
          phase !== 'idle' && phase !== 'returnToBlackhole' && 'hero-agent-card--processing',
          isHovered && 'hero-agent-card--hovered',
        )}
        animate={getAnimation()}
        transition={getTransition()}
        style={{ transformOrigin: '50% 50%' }}
        whileHover={
          prefersReducedMotion || !canHover
            ? undefined
            : { y: card.restOffset.y - 4, scale: 1.015 }
        }
        onHoverStart={() => {
          if (canHover) {
            onHoverChange(true);
          }
        }}
        onHoverEnd={() => onHoverChange(false)}
      >
        <span className="hero-agent-card__icon">
          <Icon size={14} />
        </span>
        <div className="hero-agent-card__copy">
          <span className="hero-agent-card__agent">{card.agent}</span>
          <strong>{card.title}</strong>
          <span>{card.detail}</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

const HeroWhiteHolePulse = ({
  cycle,
  phase,
  prefersReducedMotion,
}: {
  cycle: number;
  phase: HeroSequencePhase;
  prefersReducedMotion: boolean;
}) => {
  if (prefersReducedMotion) {
    return null;
  }

  return (
    <>
      <motion.div
        key={`whitehole-core-${cycle}`}
        className="hero-agent-engine__whitehole-core"
        initial={{ opacity: 0, scale: 0.76 }}
        animate={
          phase === 'emittingOutputs'
            ? { opacity: [0.28, 0.94, 0.82], scale: [1, 1.38, 1.56] }
            : phase === 'whiteHoleFlash'
              ? { opacity: [0, 0.52, 0.36], scale: [0.76, 1.14, 1.28] }
            : phase === 'returnToBlackhole'
              ? { opacity: 0, scale: 0.88 }
            : { opacity: 0, scale: 0.76 }
        }
        transition={{
          duration:
            phase === 'returnToBlackhole'
              ? 0.82
              : HERO_WHITE_HOLE_MS / 1000,
          ease: heroEase,
        }}
      />
      <motion.div
        key={`whitehole-pulse-${cycle}`}
        className="hero-agent-engine__whitehole-pulse"
        initial={{ opacity: 0, scale: 0.58 }}
        animate={
          phase === 'emittingOutputs'
            ? { opacity: [0.16, 0.72, 0.34, 0.08], scale: [0.9, 1.28, 1.54, 1.7] }
            : phase === 'whiteHoleFlash'
              ? { opacity: [0, 0.34, 0.12, 0], scale: [0.58, 1.04, 1.28, 1.42] }
            : phase === 'returnToBlackhole'
              ? { opacity: 0, scale: 0.96 }
            : { opacity: 0, scale: 0.58 }
        }
        transition={{
          duration:
            phase === 'returnToBlackhole'
              ? 0.82
              : (HERO_WHITE_HOLE_MS + HERO_EMIT_MS) / 1000,
          ease: heroEase,
          times:
            phase === 'returnToBlackhole'
              ? undefined
              : [0, 0.38, 0.74, 1],
        }}
      />
      <motion.div
        key={`whitehole-ring-${cycle}`}
        className="hero-agent-engine__whitehole-ring"
        initial={{ opacity: 0, scale: 0.42 }}
        animate={
          phase === 'emittingOutputs'
            ? { opacity: [0.14, 0.7, 0.16], scale: [0.84, 1.36, 1.78] }
            : phase === 'whiteHoleFlash'
              ? { opacity: [0, 0.42, 0], scale: [0.42, 1.18, 1.56] }
            : phase === 'returnToBlackhole'
              ? { opacity: 0, scale: 1.02 }
            : { opacity: 0, scale: 0.42 }
        }
        transition={{
          duration:
            phase === 'returnToBlackhole'
              ? 0.82
              : (HERO_WHITE_HOLE_MS + 420) / 1000,
          ease: heroEase,
          times:
            phase === 'returnToBlackhole'
              ? undefined
              : [0, 0.54, 1],
        }}
      />
    </>
  );
};

const HeroUserInputCard = ({
  activeIndex,
  input,
  index,
  phase,
  prefersReducedMotion,
}: {
  activeIndex: number;
  input: HeroUserInputDefinition;
  index: number;
  phase: HeroSequencePhase;
  prefersReducedMotion: boolean;
}) => {
  const motionPath = buildHeroInputMotion(input);
  const isActive = phase === 'absorbingInputs' && index === activeIndex;
  const isVisibleAtRest =
    (phase === 'idle' && index === 0) ||
    (phase === 'absorbingInputs' && index === activeIndex);
  const isAbsorbed =
    phase === 'absorbingInputs'
      ? index < activeIndex
      : phase === 'whiteHoleFlash' || phase === 'emittingOutputs' || phase === 'returnToBlackhole';
  const inputPullsFromRight = input.restOffset.x < 0;
  const restingState = {
    opacity: 1,
    x: input.restOffset.x,
    y: input.restOffset.y,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
    filter: 'blur(0px)',
  };
  const floatingRestState = {
    opacity: 1,
    x: [
      input.restOffset.x,
      input.restOffset.x + 3,
      input.restOffset.x,
      input.restOffset.x - 3,
      input.restOffset.x,
    ],
    y: [
      input.restOffset.y,
      input.restOffset.y - 4,
      input.restOffset.y,
      input.restOffset.y + 4,
      input.restOffset.y,
    ],
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    rotate: [0, 0.28, 0, -0.28, 0],
    filter: 'blur(0px)',
  };
  const absorbedState = {
    opacity: 0,
    x: 0,
    y: 0,
    scale: 0.04,
    scaleX: 2.8,
    scaleY: 0.05,
    rotate: motionPath.rotate[motionPath.rotate.length - 1] ?? 0,
    filter: 'blur(6px)',
  };
  const hiddenQueuedState = {
    opacity: 0,
    x: input.restOffset.x,
    y: input.restOffset.y,
    scale: 0.96,
    scaleX: 1,
    scaleY: 1,
    rotate: 0,
    filter: 'blur(0px)',
  };
  const activeTransition = {
    duration: HERO_INPUT_DURATION_MS / 1000,
    ease: 'linear' as const,
    times: motionPath.times,
  };

  if (prefersReducedMotion) {
    return null;
  }

  return (
    <motion.div
      key={input.id}
      className={cn(
        'hero-user-input-shell',
        input.hideOnMobile && 'hero-user-input-shell--mobile-hidden',
      )}
      initial={{
        opacity: 1,
        x: input.restOffset.x,
        y: input.restOffset.y,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotate: 0,
        filter: 'blur(0px)',
      }}
      animate={
        isActive
            ? {
              opacity: motionPath.opacity,
              x: motionPath.x,
              y: motionPath.y,
              scale: motionPath.scale,
              scaleX: motionPath.scaleX,
              scaleY: motionPath.scaleY,
              rotate: motionPath.rotate,
              filter: motionPath.filter,
            }
          : isAbsorbed
            ? absorbedState
            : isVisibleAtRest && phase === 'idle'
              ? floatingRestState
              : isVisibleAtRest
                ? restingState
                : hiddenQueuedState
      }
        transition={
          isActive
            ? activeTransition
          : phase === 'idle'
            ? {
              duration: 5.8 + index * 0.35,
              delay: index * 0.12,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }
          : { duration: 0.32, ease: heroEase }
      }
      style={{ transformOrigin: inputPullsFromRight ? '84% 50%' : '16% 50%' }}
    >
      <motion.span
        aria-hidden="true"
        className={cn(
          'hero-user-input-trail',
          !inputPullsFromRight && 'hero-user-input-trail--reverse',
        )}
        initial={false}
        animate={
          isActive
            ? {
                opacity: motionPath.tailOpacity,
                scaleX: motionPath.tailScaleX,
                scaleY: motionPath.tailScaleY,
                filter: motionPath.tailFilter,
              }
            : {
                opacity: 0,
                scaleX: 0.88,
                scaleY: 0.88,
                filter: 'blur(8px)',
              }
        }
        transition={isActive ? activeTransition : { duration: 0.2, ease: heroEase }}
      />
      <motion.span
        aria-hidden="true"
        className="hero-user-input-spiral"
        initial={false}
        animate={
          isActive
            ? {
                opacity: motionPath.spiralOpacity,
                scale: motionPath.spiralScale,
                rotate: motionPath.spiralRotate,
              }
            : {
                opacity: 0,
                scale: 0.72,
                rotate: 0,
              }
        }
        transition={isActive ? activeTransition : { duration: 0.2, ease: heroEase }}
      />
      <motion.div
        className={cn(
          'hero-user-input-card',
          isActive && 'hero-user-input-card--active',
          isActive && !inputPullsFromRight && 'hero-user-input-card--active-reverse',
          !isActive && isVisibleAtRest && !isAbsorbed && 'hero-user-input-card--inactive',
        )}
        initial={false}
        animate={
          isActive
            ? {
                borderRadius: ['16px', '16px', '22px', '999px', '999px'],
                opacity: [1, 0.98, 0.6, 0.14, 0],
                filter: ['blur(0px)', 'blur(0px)', 'blur(0.6px)', 'blur(2px)', 'blur(4px)'],
              }
            : {
                borderRadius: '16px',
                opacity: 1,
                filter: 'blur(0px)',
              }
        }
        transition={
          isActive
            ? { ...activeTransition, times: [0, 0.5, 0.76, 0.9, 1] }
            : { duration: 0.2, ease: heroEase }
        }
      >
        <span>User input</span>
        <strong>{input.text}</strong>
      </motion.div>
    </motion.div>
  );
};

export const HomePage = () => {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const showcaseRef = useRef<HTMLElement | null>(null);
  const { session } = useAuth();
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [heroSequencePhase, setHeroSequencePhase] = useState<HeroSequencePhase>('idle');
  const [heroInputIndex, setHeroInputIndex] = useState(0);
  const [heroSequenceCycle, setHeroSequenceCycle] = useState(0);
  const [hoveredHeroOutput, setHoveredHeroOutput] = useState<HeroOutputId | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setHeroSequencePhase('idle');
      return undefined;
    }

    const timeoutIds: number[] = [];
    const schedule = (callback: () => void, delay: number) => {
      timeoutIds.push(window.setTimeout(callback, delay));
    };
    const inputStartMs = HERO_IDLE_MS;
    const allInputsAbsorbedMs =
      inputStartMs +
      (heroUserInputs.length - 1) * HERO_INPUT_STEP_MS +
      HERO_INPUT_DURATION_MS;
    const whiteHoleStartMs = allInputsAbsorbedMs + HERO_PROCESS_MS;
    const emitStartMs = whiteHoleStartMs + HERO_WHITE_HOLE_MS;
    const returnToIdleStartMs =
      emitStartMs + HERO_EMIT_MS + (heroAgentCards.length - 1) * HERO_EMIT_STAGGER_MS;

    setHeroSequencePhase('idle');
    setHeroInputIndex(0);

    schedule(() => {
      setHeroSequencePhase('absorbingInputs');
    }, inputStartMs);

    heroUserInputs.forEach((_, index) => {
      schedule(() => {
        setHeroInputIndex(index);
      }, inputStartMs + index * HERO_INPUT_STEP_MS);
    });

    schedule(() => {
      setHeroSequencePhase('whiteHoleFlash');
    }, whiteHoleStartMs);

    schedule(() => {
      setHeroSequencePhase('emittingOutputs');
    }, emitStartMs);

    schedule(() => {
      setHeroSequencePhase('returnToBlackhole');
    }, returnToIdleStartMs);

    schedule(() => {
      setHeroSequenceCycle((current) => current + 1);
    }, returnToIdleStartMs + HERO_RETURN_IDLE_MS);

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [heroSequenceCycle, prefersReducedMotion]);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const { scrollYProgress: showcaseScrollYProgress } = useScroll({
    target: showcaseRef,
    offset: ['start 96%', 'end 14%'],
  });

  const heroVoidY = useTransform(scrollYProgress, [0, 1], ['0%', '6%']);
  const showcaseScroll = showcaseScrollYProgress;
  const showcaseY = useTransform(showcaseScroll, [0, 1], [22, -10]);
  const showcaseShellScale = useTransform(showcaseScroll, [0, 1], [0.992, 1.008]);
  const showcaseStageScale = useTransform(showcaseScroll, [0, 1], [0.985, 1.015]);
  const showcaseStageY = useTransform(showcaseScroll, [0, 1], [18, -10]);

  const showcaseSceneRawOpacity = useTransform(showcaseScroll, [0, 0.14, 0.34, 0.54], [0.22, 0.88, 0.4, 0.08]);
  const showcaseSceneTransformOpacity = useTransform(
    showcaseScroll,
    [0.18, 0.4, 0.62, 0.82],
    [0.02, 0.9, 0.42, 0.08]
  );
  const showcaseSceneStudioOpacity = useTransform(showcaseScroll, [0.52, 0.76, 1], [0.02, 0.76, 0.96]);

  const showcaseRawOpacity = useTransform(showcaseScroll, [0, 0.3, 0.58, 1], [0.72, 0.66, 0.22, 0.06]);
  const showcaseStudioOpacity = useTransform(showcaseScroll, [0.26, 0.56, 1], [0.04, 0.48, 0.84]);
  const showcaseFogOpacity = useTransform(showcaseScroll, [0, 0.38, 0.76, 1], [0.12, 0.28, 0.24, 0.16]);

  const showcaseInputSpotlightOpacity = useTransform(showcaseScroll, [0, 0.18, 0.46, 1], [0.24, 0.52, 0.18, 0.08]);
  const showcaseTransferSpotlightOpacity = useTransform(
    showcaseScroll,
    [0.18, 0.42, 0.7, 1],
    [0.04, 0.64, 0.28, 0.1]
  );
  const showcaseOutputSpotlightOpacity = useTransform(showcaseScroll, [0.34, 0.72, 1], [0.04, 0.62, 0.78]);

  const showcaseInputOpacity = useTransform(showcaseScroll, [0, 0.32, 0.72, 1], [1, 1, 0.8, 0.7]);
  const showcaseInputY = useTransform(showcaseScroll, [0, 1], [16, -8]);
  const showcaseInputScale = useTransform(showcaseScroll, [0, 1], [0.988, 1.01]);
  const showcaseInputMediaScale = useTransform(showcaseScroll, [0, 1], [0.99, 1.015]);
  const showcaseTransferOpacity = useTransform(showcaseScroll, [0, 0.28, 0.5, 0.82, 1], [0.62, 0.76, 0.96, 0.78, 0.62]);
  const showcaseTransferY = useTransform(showcaseScroll, [0, 1], [12, -8]);
  const showcaseTransferScale = useTransform(showcaseScroll, [0, 1], [0.99, 1.012]);
  const showcaseOutputOpacity = useTransform(showcaseScroll, [0, 0.4, 0.76, 1], [0.54, 0.66, 0.96, 0.98]);
  const showcaseOutputY = useTransform(showcaseScroll, [0, 1], [18, -10]);
  const showcaseOutputScale = useTransform(showcaseScroll, [0, 1], [0.988, 1.015]);
  const showcaseOutputMediaScale = useTransform(showcaseScroll, [0, 1], [0.99, 1.02]);

  return (
    <div className="home-page home-page--marketing">
      <Navbar />
      <div className="home-noise" />
      <div className="home-vignette" />

      <section ref={heroRef} className="hero landing-hero">
        <motion.div className="landing-hero__void" aria-hidden="true" style={{ y: heroVoidY }}>
          <div className="landing-hero__void-grid" />
          <div className="landing-hero__void-rings landing-hero__void-rings--one" />
          <div className="landing-hero__void-rings landing-hero__void-rings--two" />
          <div className="landing-hero__void-rings landing-hero__void-rings--three" />
        </motion.div>

        <div className="hero__grid landing-hero__grid">
          <motion.div
            className="landing-hero__content"
            variants={heroContentVariants}
            initial={prefersReducedMotion ? false : 'hidden'}
            animate={prefersReducedMotion ? undefined : 'show'}
          >
            <motion.div variants={heroItemVariants}>
              <Badge className="landing-pill">AI MARKETING AGENT FOR BUSINESSES</Badge>
            </motion.div>

            <motion.h1 className="landing-hero__title" variants={heroItemVariants}>
              Automate Marketing
              <br />
              From Idea to <span className="landing-hero__headline-accent">Published Post</span>
            </motion.h1>

            <motion.p className="landing-copy landing-copy--lead" variants={heroItemVariants}>
              <span className="landing-copy__body">
                PrixmoAI brings content, reels, AI influencers, campaign planning, and
                scheduling into one agentic workspace helping businesses move from idea to
                execution faster.
              </span>
            </motion.p>

            <motion.div className="landing-hero__actions" variants={heroItemVariants}>
              <MotionLink
                to={session ? '/app/generate' : '/signup'}
                className={buttonClassName('primary', 'lg')}
                whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.01 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
              >
                Start Free
                <ArrowRight size={18} />
              </MotionLink>
              <motion.a
                href="#product-demo"
                className={buttonClassName('secondary', 'lg')}
                whileHover={prefersReducedMotion ? undefined : { y: -3, scale: 1.01 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
              >
                Watch Demo
                <Play size={18} />
              </motion.a>
            </motion.div>

          </motion.div>

          <motion.div
            className="landing-hero__visual landing-hero__visual--hero"
            initial={prefersReducedMotion ? false : { opacity: 0, x: 28, y: 20 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.84, delay: 0.18, ease: heroEase }}
          >
            <Card
              glow
              className={cn(
                'hero-agent-engine',
                hoveredHeroOutput && 'hero-agent-engine--hovered',
                (
                  heroSequencePhase === 'whiteHoleFlash' ||
                  heroSequencePhase === 'emittingOutputs' ||
                  heroSequencePhase === 'returnToBlackhole'
                ) &&
                  'hero-agent-engine--white-hole',
              )}
            >
              <div className="hero-agent-engine__ambient" aria-hidden="true" />
              <div className="hero-agent-engine__top-label">
                <span>PRIXMOAI CORE</span>
                <strong>Marketing Orchestration Engine</strong>
              </div>
              <div className="hero-agent-engine__stage">
                <HeroWhiteHolePulse
                  cycle={heroSequenceCycle}
                  phase={heroSequencePhase}
                  prefersReducedMotion={prefersReducedMotion}
                />
                <motion.span
                  className="hero-agent-engine__orbit-ring hero-agent-engine__orbit-ring--one"
                  animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                  transition={{
                    duration: 18,
                    ease: 'linear',
                    repeat: Number.POSITIVE_INFINITY,
                  }}
                >
                  <span
                    className={cn(
                      'hero-agent-engine__orbit-dot',
                      hoveredHeroOutput && 'hero-agent-engine__orbit-dot--active',
                    )}
                  />
                </motion.span>
                <motion.span
                  className="hero-agent-engine__orbit-ring hero-agent-engine__orbit-ring--two"
                  animate={prefersReducedMotion ? undefined : { rotate: -360 }}
                  transition={{
                    duration: 24,
                    ease: 'linear',
                    repeat: Number.POSITIVE_INFINITY,
                  }}
                >
                  <span
                    className={cn(
                      'hero-agent-engine__orbit-dot',
                      'hero-agent-engine__orbit-dot--mint',
                      hoveredHeroOutput && 'hero-agent-engine__orbit-dot--active',
                    )}
                  />
                </motion.span>

                {heroUserInputs.map((input, index) => (
                  <HeroUserInputCard
                    key={input.id}
                    activeIndex={heroInputIndex}
                    input={input}
                    index={index}
                    phase={heroSequencePhase}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                ))}

                {heroAgentCards.map((card, index) => (
                  <HeroAgentCard
                    key={card.id}
                    card={card}
                    index={index}
                    phase={heroSequencePhase}
                    isHovered={card.id === hoveredHeroOutput}
                    onHoverChange={(isHovered) =>
                      setHoveredHeroOutput(isHovered ? card.id : null)
                    }
                    prefersReducedMotion={prefersReducedMotion}
                  />
                ))}

                <motion.div
                  className="hero-agent-engine__core-shell"
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : hoveredHeroOutput
                        ? { scale: [1, 1.024, 1], rotate: [0, 0.2, 0] }
                        : { scale: 1, rotate: 0 }
                  }
                  transition={
                    hoveredHeroOutput
                      ? {
                          duration: 2.4,
                          ease: 'easeInOut',
                          repeat: Number.POSITIVE_INFINITY,
                        }
                      : { duration: 0.3, ease: heroEase }
                  }
                >
                  <motion.div
                    className="hero-agent-engine__core-glow"
                    aria-hidden="true"
                    animate={
                      prefersReducedMotion
                        ? undefined
                        : hoveredHeroOutput
                          ? { opacity: [0.72, 1, 0.72], scale: [1, 1.08, 1] }
                          : { opacity: 1, scale: 1 }
                    }
                    transition={
                      hoveredHeroOutput
                        ? {
                            duration: 2.1,
                            ease: 'easeInOut',
                            repeat: Number.POSITIVE_INFINITY,
                          }
                        : { duration: 0.3, ease: heroEase }
                    }
                  />
                  <BlackHoleCanvas
                    className="hero-agent-engine__canvas"
                    particleCount={44}
                    quality="cinematic"
                  />
                </motion.div>
              </div>
              <div className="landing-copy__eyebrow hero-agent-engine__subline">
                Deploy AI agents for modern marketing
              </div>
            </Card>
          </motion.div>
        </div>

      </section>

      <section id="product-demo" ref={showcaseRef} className="section landing-showcase-section">
        <div className="landing-showcase-section__sticky">
          <motion.div
            className="landing-hero__visual landing-hero__visual--showcase"
            style={{ y: showcaseY, scale: showcaseShellScale }}
          >
            <Card glow className="hero-showcase">
              <motion.div
                className="hero-showcase__scene hero-showcase__scene--raw"
                style={{ opacity: prefersReducedMotion ? 0.5 : showcaseSceneRawOpacity }}
              />
              <motion.div
                className="hero-showcase__scene hero-showcase__scene--transform"
                style={{ opacity: prefersReducedMotion ? 0.44 : showcaseSceneTransformOpacity }}
              />
              <motion.div
                className="hero-showcase__scene hero-showcase__scene--studio"
                style={{ opacity: prefersReducedMotion ? 0.48 : showcaseSceneStudioOpacity }}
              />
              <motion.div
                className="hero-showcase__ambient hero-showcase__ambient--raw"
                style={{ opacity: prefersReducedMotion ? 0.4 : showcaseRawOpacity }}
              />
              <motion.div
                className="hero-showcase__ambient hero-showcase__ambient--studio"
                style={{ opacity: prefersReducedMotion ? 0.34 : showcaseStudioOpacity }}
              />
              <motion.div
                className="hero-showcase__ambient hero-showcase__ambient--fog"
                style={{ opacity: prefersReducedMotion ? 0.18 : showcaseFogOpacity }}
              />

              <motion.div
                className="hero-showcase__stage"
                style={{ y: showcaseStageY, scale: showcaseStageScale }}
              >
                <motion.div
                  className="hero-showcase__spotlight hero-showcase__spotlight--input"
                  style={{ opacity: prefersReducedMotion ? 0.18 : showcaseInputSpotlightOpacity }}
                />
                <motion.div
                  className="hero-showcase__spotlight hero-showcase__spotlight--transfer"
                  style={{ opacity: prefersReducedMotion ? 0.26 : showcaseTransferSpotlightOpacity }}
                />
                <motion.div
                  className="hero-showcase__spotlight hero-showcase__spotlight--output"
                  style={{ opacity: prefersReducedMotion ? 0.22 : showcaseOutputSpotlightOpacity }}
                />

                <motion.div
                  className="showcase-card showcase-card--input"
                  style={{
                    opacity: showcaseInputOpacity,
                    y: showcaseInputY,
                    scale: showcaseInputScale,
                  }}
                >
                  <div className="showcase-card__header">
                    <Badge>YOUR UPLOAD</Badge>
                    <span>Before</span>
                  </div>
                  <motion.div
                    className="showcase-media showcase-media--input"
                    style={{ scale: showcaseInputMediaScale }}
                  >
                    <img
                      src="/showcase-input-product.svg"
                      alt="Normal product photo uploaded by the business owner"
                    />
                  </motion.div>
                  <div className="showcase-description">
                    <strong>Raw. Real. Unedited</strong>
                    <p className="landing-copy">
                      A product photo taken on any phone. Flat lighting, no setup, no
                      filters. This is your starting point and it is all PrixmoAI
                      needs.
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  className="showcase-transfer"
                  style={{
                    opacity: showcaseTransferOpacity,
                    y: showcaseTransferY,
                    scale: showcaseTransferScale,
                  }}
                >
                  <span className="showcase-transfer__eyebrow">PRIXMOAI ENGINE</span>
                  <div className="showcase-transfer__visual">
                    <div className="showcase-transfer__visual-glow" />
                    <BlackHoleCanvas
                      className="showcase-transfer__canvas"
                      particleCount={40}
                      quality="cinematic"
                    />
                  </div>
                </motion.div>

                <motion.div
                  className="showcase-card showcase-card--output"
                  style={{
                    opacity: showcaseOutputOpacity,
                    y: showcaseOutputY,
                    scale: showcaseOutputScale,
                  }}
                >
                  <div className="showcase-card__header">
                    <Badge>READY TO POST</Badge>
                    <span>After</span>
                  </div>
                  <motion.div
                    className="showcase-media showcase-media--output"
                    style={{ scale: showcaseOutputMediaScale }}
                  >
                    <img
                      src="/showcase-output-product.svg"
                      alt="Studio-ready ultra realistic product image generated by PrixmoAI"
                    />
                  </motion.div>
                  <div className="showcase-description showcase-description--output">
                    <strong>Clean. Sharp. Scheduled</strong>
                    <p className="landing-copy">
                      Studio quality product visual, three caption variants, optimised
                      hashtags and a reel script ready to go live on Instagram
                      directly from this screen.
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            </Card>
          </motion.div>
        </div>
      </section>

      <section className="section social-proof-section">
        <p className="social-proof-section__label">Trusted by businesses across India</p>
        <div className="social-proof-section__marquee" aria-hidden="true">
          <div className="social-proof-section__rail">
            {[0, 1, 2].map((copyIndex) => (
              <div key={copyIndex} className="social-proof-section__track">
                {socialProofItems.map((item, index) => (
                  <span key={`${copyIndex}-${item}-${index}`}>{item}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section landing-section">
        <SectionHeading
          eyebrow="Problem"
          title="Running a business is hard enough. Marketing should not be."
          description="Most small businesses do not fail because the product is bad. They fail because consistent content is expensive, time-consuming, and hard to sustain."
        />

        <div className="landing-grid landing-grid--three">
          {problemCards.map((card) => (
            <ScrollScrub key={card.title}>
              <Card className="landing-card problem-card">
                <FeatureIcon icon={card.icon} />
                <h3>{card.title}</h3>
                <p className="landing-copy">{card.copy}</p>
              </Card>
            </ScrollScrub>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="section landing-section">
        <SectionHeading
          eyebrow="How it Works"
          title="How PrixmoAI Works"
          description="Three steps. Thirty seconds. Done."
        />

        <div className="steps-stack">
          {howItWorksSteps.map((step, index) => (
            <ScrollScrub key={step.title}>
              <Card className="landing-card step-card">
                <div className="step-card__number">{`0${index + 1}`}</div>
                <div className="step-card__body">
                  <FeatureIcon icon={step.icon} />
                  <h3>{step.title}</h3>
                  <p className="landing-copy">{step.copy}</p>
                </div>
              </Card>
            </ScrollScrub>
          ))}
        </div>
      </section>

      <section id="features" className="section landing-section">
        <SectionHeading
          eyebrow="Features"
          title="Everything Your Brand Needs"
          description="One platform. All your content. Zero stress."
        />

        <div className="landing-grid landing-grid--features">
          {featureCards.map((feature) => (
            <ScrollScrub key={feature.title}>
              <Card className="landing-card feature-card feature-card--marketing">
                <FeatureIcon icon={feature.icon} />
                <h3>{feature.title}</h3>
                <p className="landing-copy">{feature.copy}</p>
              </Card>
            </ScrollScrub>
          ))}
        </div>
      </section>

      <section className="section landing-section">
        <SectionHeading
          eyebrow="Before / After"
          title={`See the Difference ${APP_NAME} Makes`}
          description="A better system changes the output, the timing, and the reach. The difference should feel obvious at first glance."
        />

        <div className="comparison-grid">
          <ScrollScrub>
            <Card className="landing-card comparison-card comparison-card--before">
              <div className="comparison-card__header">
                <Badge>Before</Badge>
                <span>Reach: 87 people</span>
              </div>
              <div className="comparison-card__visual comparison-card__visual--before" />
              <ul className="comparison-card__list">
                {comparisonRows.before.map((item) => (
                  <li key={item}>
                    <CircleX size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </ScrollScrub>

          <ScrollScrub>
            <Card glow className="landing-card comparison-card comparison-card--after">
              <div className="comparison-card__header">
                <Badge>After</Badge>
                <span>Reach: 4,200 people</span>
              </div>
              <div className="comparison-card__visual comparison-card__visual--after" />
              <ul className="comparison-card__list">
                {comparisonRows.after.map((item) => (
                  <li key={item}>
                    <Check size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </ScrollScrub>
        </div>
      </section>

      <section id="pricing" className="section landing-section">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple Pricing. No Surprises."
          description="Start free. Upgrade when you are ready."
        />

        <div className="pricing-grid-home">
          {pricingPlans.map((plan) => (
            <Card
              key={plan.id}
              glow={plan.id !== 'free'}
              className={cn('landing-card pricing-card', `pricing-card--${plan.id}`)}
            >
              <div className="pricing-card__top">
                <div>
                  <p className="pricing-card__label">{plan.name}</p>
                  <div className="pricing-card__price">
                    <h3>{plan.price}</h3>
                    <span>{plan.cadence}</span>
                  </div>
                </div>
                {plan.badge ? <Badge>{plan.badge}</Badge> : null}
              </div>

              <p className="landing-copy pricing-card__description">{plan.description}</p>

              <ul className="pricing-card__list">
                {plan.features.map((feature) => (
                  <li key={feature.label}>
                    {feature.included ? (
                      <Check size={15} className="pricing-card__icon pricing-card__icon--ok" />
                    ) : (
                      <CircleX size={15} className="pricing-card__icon pricing-card__icon--no" />
                    )}
                    <span>{feature.label}</span>
                  </li>
                ))}
              </ul>

              <Link
                to={plan.id === 'free' ? '/signup' : '/app/billing'}
                className={buttonClassName(
                  plan.id === 'basic' ? 'primary' : 'secondary',
                  'lg',
                  'pricing-card__cta'
                )}
              >
                {plan.cta}
              </Link>
            </Card>
          ))}
        </div>

        <p className="pricing-note">
          Basic plans include a 7 day free trial.
          Cancel anytime. No questions asked.
        </p>
      </section>

      <section className="section landing-section">
        <SectionHeading
          eyebrow="Testimonials"
          title="What Indian Businesses Say About PrixmoAI"
          description="These are the proof points that matter most: better output, faster posting, and more confidence without increasing team size."
        />

        <div className="landing-grid landing-grid--three">
          {testimonials.map((testimonial) => (
            <ScrollScrub key={testimonial.name}>
              <Card className="landing-card testimonial-card">
                <Quote size={20} />
                <div className="testimonial-card__stars" aria-label="Five star rating">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} size={14} fill="currentColor" />
                  ))}
                </div>
                <p className="landing-copy">"{testimonial.quote}"</p>
                <div className="testimonial-card__author">
                  <strong>{testimonial.name}</strong>
                  <span>{testimonial.role}</span>
                </div>
              </Card>
            </ScrollScrub>
          ))}
        </div>
      </section>

      <section className="section landing-section">
        <SectionHeading
          eyebrow="Target Audience"
          title="Built for Every Indian Business"
          description="PrixmoAI is structured for businesses that need content consistency without hiring a creative team."
        />

        <div className="landing-grid landing-grid--audiences">
          {audienceCards.map((audience) => (
            <ScrollScrub key={audience.title}>
              <Card className="landing-card audience-card">
                <h3>{audience.title}</h3>
                <p className="landing-copy">{audience.copy}</p>
              </Card>
            </ScrollScrub>
          ))}
        </div>
      </section>

      <section className="section landing-section landing-section--stats">
        <div className="stats-grid">
          {stats.map((stat) => (
            <ScrollScrub key={stat.label}>
              <Card className="landing-card stat-card">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </Card>
            </ScrollScrub>
          ))}
        </div>
      </section>

      <section id="faq" className="section landing-section">
        <SectionHeading
          eyebrow="FAQ"
          title="Frequently Asked Questions"
          description="Clear answers help people decide faster, so this section stays simple, direct, and easy to scan."
        />

        <div className="faq-list">
          {faqItems.map((item) => (
            <details key={item.question} className="faq-item">
              <summary>{item.question}</summary>
              <p className="landing-copy">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="final-cta" className="section landing-section landing-section--final-cta">
        <Card glow className="final-cta-card">
          
          <h2>Your Competitors Are Already Posting.</h2>
          <p className="landing-copy landing-copy--center">
            Start creating professional content today. Free forever. No credit card
            needed.
          </p>
          <div className="final-cta-card__actions">
            <Link
              to={session ? '/app/generate' : '/signup'}
              className={buttonClassName('primary', 'lg')}
            >
              Create Your Free Account
            </Link>
          </div>
          <p className="final-cta-card__note">
            Join 500+ Indian businesses growing with {APP_NAME}.
          </p>
        </Card>
      </section>

      <Footer />
    </div>
  );
};
