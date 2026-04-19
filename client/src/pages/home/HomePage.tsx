import {
  motion,
  useScroll,
  useSpring,
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
  Quote,
  Sparkles,
  Star,
  Upload,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/home.css';
import { ProviderLogo } from '../../components/auth/ProviderLogo';
import { BlackHoleCanvas } from '../../components/home/BlackHoleCanvas';
import { Footer } from '../../components/layout/Footer';
import { Navbar } from '../../components/layout/Navbar';
import { Badge } from '../../components/ui/badge';
import { buttonClassName } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useAuth } from '../../hooks/useAuth';
import { APP_NAME } from '../../lib/constants';
import { getPlayfulErrorMessage } from '../../lib/errorTone';
import { cn } from '../../lib/utils';

type OAuthProvider = 'google' | 'github' | 'facebook';

const socialProofItems = [
  'Clothing Brands',
  'Restaurants',
  'Salons',
  'Ecommerce Sellers',
  'Gyms',
  'Home Decor',
] as const;

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
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 95%', 'end 35%'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 45,
    damping: 32,
    mass: 1.4,
  });

  const opacity = useTransform(smoothProgress, [0, 0.25, 0.75, 1], [0, 1, 1, 0.98]);
  const scale = useTransform(smoothProgress, [0, 1], [0.98, 1]);
  const y = useTransform(smoothProgress, [0, 1], [24, 0]);
  const rotateX = useTransform(smoothProgress, [0, 1], [2, 0]);

  return (
    <motion.div
      ref={ref}
      className={cn('scrub-card-shell', className)}
      style={{
        opacity,
        scale,
        y,
        rotateX,
        transformPerspective: 1000,
      }}
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

export const HomePage = () => {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const showcaseRef = useRef<HTMLElement | null>(null);
  const { session, signInWithOAuth, isConfigured } = useAuth();
  const [authPending, setAuthPending] = useState<OAuthProvider | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const { scrollYProgress: showcaseScrollYProgress } = useScroll({
    target: showcaseRef,
    offset: ['start 92%', 'end 8%'],
  });

  const orbitRotate = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const orbitScale = useTransform(scrollYProgress, [0, 0.8, 1], [1, 1.05, 0.96]);
  const heroVoidY = useTransform(scrollYProgress, [0, 1], ['0%', '6%']);
  const showcaseScroll = useSpring(showcaseScrollYProgress, {
    stiffness: 40,
    damping: 28,
    mass: 1.2,
  });
  const showcaseY = useTransform(showcaseScroll, [0, 1], [64, -34]);
  const showcaseShellScale = useTransform(showcaseScroll, [0, 1], [0.968, 1.02]);
  const showcaseStageScale = useTransform(showcaseScroll, [0, 1], [0.92, 1.04]);
  const showcaseStageY = useTransform(showcaseScroll, [0, 1], [52, -28]);

  const showcaseSceneRawOpacity = useTransform(showcaseScroll, [0, 0.12, 0.34, 0.54], [0.28, 1, 0.42, 0.08]);
  const showcaseSceneRawY = useTransform(showcaseScroll, [0, 1], [76, -18]);
  const showcaseSceneRawScale = useTransform(showcaseScroll, [0, 1], [1.14, 1.02]);
  const showcaseSceneTransformOpacity = useTransform(
    showcaseScroll,
    [0.18, 0.4, 0.62, 0.82],
    [0.04, 0.96, 0.5, 0.12]
  );
  const showcaseSceneTransformY = useTransform(showcaseScroll, [0, 1], [56, -28]);
  const showcaseSceneTransformScale = useTransform(showcaseScroll, [0, 1], [1.08, 1.02]);
  const showcaseSceneStudioOpacity = useTransform(showcaseScroll, [0.5, 0.76, 1], [0.04, 0.84, 1]);
  const showcaseSceneStudioY = useTransform(showcaseScroll, [0, 1], [82, -34]);
  const showcaseSceneStudioScale = useTransform(showcaseScroll, [0, 1], [1.12, 1.04]);

  const showcaseRawOpacity = useTransform(showcaseScroll, [0, 0.3, 0.58, 1], [0.86, 0.74, 0.24, 0.08]);
  const showcaseRawY = useTransform(showcaseScroll, [0, 1], [48, -22]);
  const showcaseRawScale = useTransform(showcaseScroll, [0, 1], [0.94, 1.04]);
  const showcaseStudioOpacity = useTransform(showcaseScroll, [0.24, 0.56, 1], [0.08, 0.54, 0.96]);
  const showcaseStudioY = useTransform(showcaseScroll, [0, 1], [72, -28]);
  const showcaseStudioScale = useTransform(showcaseScroll, [0, 1], [0.9, 1.1]);
  const showcaseFogOpacity = useTransform(showcaseScroll, [0, 0.38, 0.76, 1], [0.18, 0.42, 0.36, 0.24]);
  const showcaseFogY = useTransform(showcaseScroll, [0, 1], [34, -46]);

  const showcaseInputSpotlightOpacity = useTransform(showcaseScroll, [0, 0.18, 0.46, 1], [0.32, 0.74, 0.22, 0.12]);
  const showcaseInputSpotlightY = useTransform(showcaseScroll, [0, 1], [22, -18]);
  const showcaseInputSpotlightScale = useTransform(showcaseScroll, [0, 1], [0.9, 1.04]);
  const showcaseTransferSpotlightOpacity = useTransform(
    showcaseScroll,
    [0.18, 0.42, 0.7, 1],
    [0.08, 0.92, 0.4, 0.18]
  );
  const showcaseTransferSpotlightY = useTransform(showcaseScroll, [0, 1], [30, -24]);
  const showcaseTransferSpotlightScale = useTransform(showcaseScroll, [0, 1], [0.88, 1.08]);
  const showcaseOutputSpotlightOpacity = useTransform(showcaseScroll, [0.34, 0.72, 1], [0.08, 0.82, 1]);
  const showcaseOutputSpotlightY = useTransform(showcaseScroll, [0, 1], [36, -28]);
  const showcaseOutputSpotlightScale = useTransform(showcaseScroll, [0, 1], [0.9, 1.1]);

  const showcaseInputOpacity = useTransform(showcaseScroll, [0, 0.32, 0.72, 1], [1, 1, 0.76, 0.66]);
  const showcaseInputY = useTransform(showcaseScroll, [0, 1], [48, -18]);
  const showcaseInputScale = useTransform(showcaseScroll, [0, 1], [0.96, 1.02]);
  const showcaseInputMediaY = useTransform(showcaseScroll, [0, 1], [30, -18]);
  const showcaseInputMediaScale = useTransform(showcaseScroll, [0, 1], [0.95, 1.04]);
  const showcaseTransferOpacity = useTransform(showcaseScroll, [0, 0.28, 0.5, 0.82, 1], [0.58, 0.72, 1, 0.74, 0.58]);
  const showcaseTransferY = useTransform(showcaseScroll, [0, 1], [30, -14]);
  const showcaseTransferScale = useTransform(showcaseScroll, [0, 1], [0.94, 1.03]);
  const showcaseOutputOpacity = useTransform(showcaseScroll, [0, 0.4, 0.76, 1], [0.5, 0.62, 1, 1]);
  const showcaseOutputY = useTransform(showcaseScroll, [0, 1], [56, -22]);
  const showcaseOutputScale = useTransform(showcaseScroll, [0, 1], [0.95, 1.05]);
  const showcaseOutputMediaY = useTransform(showcaseScroll, [0, 1], [34, -24]);
  const showcaseOutputMediaScale = useTransform(showcaseScroll, [0, 1], [0.96, 1.07]);

  const handleOAuth = async (provider: OAuthProvider) => {
    if (!isConfigured) {
      setAuthError('Supabase client env is missing on the frontend.');
      return;
    }

    setAuthPending(provider);
    setAuthError(null);

    try {
      await signInWithOAuth(provider);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Failed to start social sign-in.'
      );
    } finally {
      setAuthPending(null);
    }
  };

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
          <motion.div
            className="blackhole-core-shell blackhole-core-shell--backdrop"
            style={{ rotate: orbitRotate, scale: orbitScale }}
          >
            <div className="blackhole__shadow" />
            <div className="blackhole__core" />
            <div className="blackhole__accretion" />
            <div className="blackhole__halo" />
            <div className="blackhole__orbit blackhole__orbit--inner" />
            <div className="blackhole__orbit blackhole__orbit--outer" />
            <div className="blackhole__glow-tail" />
          </motion.div>
          <motion.span
            className="blackhole__node-particle blackhole__node-particle--hero-one"
            animate={{ rotate: 360 }}
            transition={{ duration: 3.8, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
          />
          <motion.span
            className="blackhole__node-particle blackhole__node-particle--hero-two"
            animate={{ rotate: -360 }}
            transition={{ duration: 5.1, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
          />
        </motion.div>

        <div className="hero__grid landing-hero__grid landing-hero__grid--single">
          <motion.div
            className="landing-hero__content"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge className="landing-pill">AI-Powered Branding for Indian Businesses</Badge>
            <h1>
              Create. Schedule
              <br></br>
              <span> Grow Your </span>
              <br></br>
              <span> Social Media </span>
              <br></br>
              In Few Seconds
            </h1>
            <p className="landing-copy landing-copy--lead">
              <span className="landing-copy__lead-line">
                
              </span>
              <span className="landing-copy__lead-subline">
               
                
                The fastest way to create and publish social media content
              </span>
            </p>

            <div className="landing-hero__actions">
              <Link
                to={session ? '/app/generate' : '/signup'}
                className={buttonClassName('primary', 'lg')}
              >
                Start Free
                <ArrowRight size={18} />
              </Link>
              <Link to="/login" className={buttonClassName('secondary', 'lg')}>
                Login
              </Link>
            </div>

            <p className="landing-trust">
              Free forever • No credit card • 500+ businesses trust {APP_NAME}
            </p>

            <div className="landing-auth-panel landing-auth-panel--hero">
              <button
                type="button"
                className="landing-auth-panel__oauth"
                disabled={authPending !== null}
                onClick={() => {
                  void handleOAuth('google');
                }}
              >
                <ProviderLogo provider="google" />
                <span>{authPending === 'google' ? 'Connecting...' : 'Google'}</span>
              </button>
              <button
                type="button"
                className="landing-auth-panel__oauth"
                disabled={authPending !== null}
                onClick={() => {
                  void handleOAuth('github');
                }}
              >
                <ProviderLogo provider="github" />
                <span>{authPending === 'github' ? 'Connecting...' : 'GitHub'}</span>
              </button>
              <button
                type="button"
                className="landing-auth-panel__oauth"
                disabled={authPending !== null}
                onClick={() => {
                  void handleOAuth('facebook');
                }}
              >
                <ProviderLogo provider="facebook" />
                <span>{authPending === 'facebook' ? 'Connecting...' : 'Facebook'}</span>
              </button>

              {authError ? (
                <p className={cn('landing-auth-panel__note', 'landing-auth-panel__note--error')}>
                  {getPlayfulErrorMessage(authError)}
                </p>
              ) : null}
            </div>
          </motion.div>
        </div>
      </section>

      <section ref={showcaseRef} className="section landing-showcase-section">
        <div className="landing-showcase-section__sticky">
          <motion.div
            className="landing-hero__visual landing-hero__visual--showcase"
            style={{ y: showcaseY, scale: showcaseShellScale }}
          >
            <Card glow className="hero-showcase">
              <motion.div
                className="hero-showcase__scene hero-showcase__scene--raw"
                style={{
                  opacity: showcaseSceneRawOpacity,
                  y: showcaseSceneRawY,
                  scale: showcaseSceneRawScale,
                }}
              />
              <motion.div
                className="hero-showcase__scene hero-showcase__scene--transform"
                style={{
                  opacity: showcaseSceneTransformOpacity,
                  y: showcaseSceneTransformY,
                  scale: showcaseSceneTransformScale,
                }}
              />
              <motion.div
                className="hero-showcase__scene hero-showcase__scene--studio"
                style={{
                  opacity: showcaseSceneStudioOpacity,
                  y: showcaseSceneStudioY,
                  scale: showcaseSceneStudioScale,
                }}
              />
              <motion.div
                className="hero-showcase__ambient hero-showcase__ambient--raw"
                style={{
                  opacity: showcaseRawOpacity,
                  y: showcaseRawY,
                  scale: showcaseRawScale,
                }}
              />
              <motion.div
                className="hero-showcase__ambient hero-showcase__ambient--studio"
                style={{
                  opacity: showcaseStudioOpacity,
                  y: showcaseStudioY,
                  scale: showcaseStudioScale,
                }}
              />
              <motion.div
                className="hero-showcase__ambient hero-showcase__ambient--fog"
                style={{ opacity: showcaseFogOpacity, y: showcaseFogY }}
              />

              <motion.div
                className="hero-showcase__stage"
                style={{ y: showcaseStageY, scale: showcaseStageScale }}
              >
                <motion.div
                  className="hero-showcase__spotlight hero-showcase__spotlight--input"
                  style={{
                    opacity: showcaseInputSpotlightOpacity,
                    y: showcaseInputSpotlightY,
                    scale: showcaseInputSpotlightScale,
                  }}
                />
                <motion.div
                  className="hero-showcase__spotlight hero-showcase__spotlight--transfer"
                  style={{
                    opacity: showcaseTransferSpotlightOpacity,
                    y: showcaseTransferSpotlightY,
                    scale: showcaseTransferSpotlightScale,
                  }}
                />
                <motion.div
                  className="hero-showcase__spotlight hero-showcase__spotlight--output"
                  style={{
                    opacity: showcaseOutputSpotlightOpacity,
                    y: showcaseOutputSpotlightY,
                    scale: showcaseOutputSpotlightScale,
                  }}
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
                    style={{ y: showcaseInputMediaY, scale: showcaseInputMediaScale }}
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
                    <BlackHoleCanvas className="showcase-transfer__canvas" particleCount={22} />
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
                    style={{ y: showcaseOutputMediaY, scale: showcaseOutputMediaScale }}
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
