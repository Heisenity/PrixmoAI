import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  CircleX,
  ImagePlus,
  Play,
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

const noisePills = [
  { height: 5, grow: 1 },
  { height: 14, grow: 1 },
  { height: 5, grow: 1 },
  { height: 26, grow: 1.15 },
  { height: 5, grow: 1 },
  { height: 14, grow: 1 },
  { height: 5, grow: 1 },
  { height: 14, grow: 1 },
  { height: 26, grow: 1.15 },
  { height: 5, grow: 1 },
  { height: 14, grow: 1 },
  { height: 5, grow: 1 },
  { height: 14, grow: 1 },
  { height: 5, grow: 1 },
  { height: 14, grow: 1 },
  { height: 5, grow: 1 },
  { height: 26, grow: 1.15 },
  { height: 5, grow: 1 },
  { height: 14, grow: 1 },
  { height: 5, grow: 1 },
] as const;

const signalPills = [
  { height: 5, grow: 1 },
  { height: 6, grow: 1 },
  { height: 7, grow: 1 },
  { height: 9, grow: 1 },
  { height: 11, grow: 1 },
  { height: 13, grow: 1 },
  { height: 15, grow: 1 },
  { height: 18, grow: 1 },
  { height: 21, grow: 1 },
  { height: 25, grow: 1 },
  { height: 29, grow: 1 },
  { height: 34, grow: 1 },
  { height: 40, grow: 1 },
  { height: 46, grow: 1.05 },
  { height: 52, grow: 1.25 },
  { height: 52, grow: 1.25 },
] as const;

const SignalGapPill = ({
  height,
  grow,
  index,
  total,
  progress,
  prefersReducedMotion,
}: {
  height: number;
  grow: number;
  index: number;
  total: number;
  progress: MotionValue<number>;
  prefersReducedMotion: boolean;
}) => {
  // Cascading sequential fill window across 0.06 to 0.88 of pinned scroll progress
  const startRange = 0.06;
  const endRange = 0.88;
  const step = (endRange - startRange) / total;
  const start = startRange + index * step;
  const end = Math.min(1, start + step * 1.6);

  // Vertical fill of the cyan color inside the pill
  const fillScaleY = useTransform(progress, [start, end], [0, 1]);
  const fillOpacity = useTransform(
    progress,
    [start, Math.min(1, start + step * 0.3), end],
    [0, 0.95, 1]
  );

  // Glow aura blooms as each bar gets filled
  const glowOpacity = useTransform(
    progress,
    [start + step * 0.4, end],
    [0, 1]
  );

  const isHighBar = index >= total - 4;
  const glowClass = isHighBar
    ? 'signal-gap-pill__glow--high'
    : 'signal-gap-pill__glow--standard';

  if (prefersReducedMotion) {
    return (
      <span
        className="signal-gap-pill signal-gap-pill--signal-wrap"
        style={{
          height: `${height}px`,
          flexGrow: grow,
        }}
      >
        <span className="signal-gap-pill__base">
          <span className="signal-gap-pill__fill signal-gap-pill__fill--static" />
        </span>
        <span
          className={`signal-gap-pill__glow ${glowClass} signal-gap-pill__glow--static`}
          aria-hidden="true"
        />
      </span>
    );
  }

  return (
    <span
      className="signal-gap-pill signal-gap-pill--signal-wrap"
      style={{
        height: `${height}px`,
        flexGrow: grow,
      }}
    >
      {/* Unfilled dark silhouette container with inner clip */}
      <span className="signal-gap-pill__base">
        <motion.span
          className="signal-gap-pill__fill"
          style={{
            scaleY: fillScaleY,
            opacity: fillOpacity,
          }}
        />
      </span>

      {/* Cyan luminous bloom when bar is filled */}
      <motion.span
        className={`signal-gap-pill__glow ${glowClass}`}
        style={{
          opacity: glowOpacity,
        }}
        aria-hidden="true"
      />
    </span>
  );
};

const SignalGapCard = ({
  progress,
  prefersReducedMotion,
}: {
  progress: MotionValue<number>;
  prefersReducedMotion: boolean;
}) => {
  // Simultaneously illuminate "THE SIGNAL" word and caption in sync with the bars
  const signalGlowOpacity = useTransform(progress, [0.06, 0.85], [0, 1]);
  const signalCaptionOpacity = useTransform(progress, [0.08, 0.85], [0.55, 0.95]);

  return (
    <Card className="landing-card signal-gap-card">
      <h3 className="signal-gap-card__title">
        Being active online isn't the same as growing.
      </h3>
      <div className="signal-gap-card__divider" />

      {/* THE NOISE */}
      <div className="signal-gap-row signal-gap-row--noise">
        <span className="signal-gap-row__eyebrow">THE NOISE</span>
        <div
          className="signal-gap-track signal-gap-track--noise"
          aria-hidden="true"
        >
          {noisePills.map((pill, i) => (
            <span
              key={`noise-${i}`}
              className="signal-gap-pill signal-gap-pill--noise"
              style={{
                height: `${pill.height}px`,
                flexGrow: pill.grow,
              }}
            />
          ))}
        </div>
        <p className="signal-gap-row__caption">
          Random posts. Repeated ideas. No clear direction.
        </p>
      </div>

      {/* THE SIGNAL */}
      <div className="signal-gap-row signal-gap-row--signal">
        <div className="signal-gap-row__eyebrow-wrap">
          <span className="signal-gap-row__eyebrow signal-gap-row__eyebrow--base">
            THE SIGNAL
          </span>
          <motion.span
            className="signal-gap-row__eyebrow signal-gap-row__eyebrow--lit"
            style={{
              opacity: prefersReducedMotion ? 1 : signalGlowOpacity,
            }}
            aria-hidden="true"
          >
            THE SIGNAL
          </motion.span>
        </div>

        <div
          className="signal-gap-track signal-gap-track--signal"
          aria-hidden="true"
        >
          {signalPills.map((pill, i) => (
            <SignalGapPill
              key={`signal-${i}`}
              height={pill.height}
              grow={pill.grow}
              index={i}
              total={signalPills.length}
              progress={progress}
              prefersReducedMotion={prefersReducedMotion}
            />
          ))}
        </div>
        <motion.p
          className="signal-gap-row__caption"
          style={{
            opacity: prefersReducedMotion ? 0.92 : signalCaptionOpacity,
          }}
        >
          Consistent messaging. Intentional content. Measured improvement.
        </motion.p>
      </div>
    </Card>
  );
};

const SignalGapSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 110,
    damping: 24,
    mass: 0.12,
  });

  return (
    <section ref={sectionRef} className="signal-gap-section">
      <div className="signal-gap-section__sticky">
        <SectionHeading
          className="landing-section__header--problem"
          title="Stop struggling to post."
          subtitle={
            <span className="subtitle-presence">
              <span className="subtitle-presence__glow" aria-hidden="true" />
              <span className="subtitle-presence__text">Start showing up.</span>
            </span>
          }
        />

        <SignalGapCard
          progress={smoothProgress}
          prefersReducedMotion={prefersReducedMotion}
        />
      </div>
    </section>
  );
};

const HowItWorksConnectedSequenceSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 24,
    mass: 0.1,
    restDelta: 0.001,
  });

  // Step 1: Upload activation (activates around 0.18)
  const step1NumberColor = useTransform(smoothProgress, [0.06, 0.18], ['#414F60', '#78CFFF']);
  const step1HeadingColor = useTransform(
    smoothProgress,
    [0.06, 0.18],
    ['rgba(241, 244, 248, 0.45)', '#F1F4F8']
  );
  const step1DescOpacity = useTransform(smoothProgress, [0.06, 0.18], [0.45, 1]);
  const node1Border = useTransform(smoothProgress, [0.12, 0.18], ['#26313D', '#78CFFF']);
  const node1Scale = useTransform(smoothProgress, [0.12, 0.18], [1, 1.15]);
  const node1DotBg = useTransform(smoothProgress, [0.12, 0.18], ['#26313D', '#78CFFF']);
  const node1Shadow = useTransform(
    smoothProgress,
    [0.12, 0.18],
    ['0 0 0px rgba(120, 207, 255, 0)', '0 0 16px rgba(120, 207, 255, 0.45)']
  );

  // Step 2: Create activation (activates around 0.48)
  const step2NumberColor = useTransform(smoothProgress, [0.34, 0.48], ['#414F60', '#78CFFF']);
  const step2HeadingColor = useTransform(
    smoothProgress,
    [0.34, 0.48],
    ['rgba(241, 244, 248, 0.45)', '#F1F4F8']
  );
  const step2DescOpacity = useTransform(smoothProgress, [0.34, 0.48], [0.45, 1]);
  const step2ClipInset = useTransform(smoothProgress, [0.30, 0.48], [100, 0]);
  const step2ClipPath = useTransform(step2ClipInset, (val) => `inset(0 ${val}% 0 0)`);
  const node2Border = useTransform(smoothProgress, [0.42, 0.48], ['#26313D', '#78CFFF']);
  const node2Scale = useTransform(smoothProgress, [0.42, 0.48], [1, 1.15]);
  const node2DotBg = useTransform(smoothProgress, [0.42, 0.48], ['#26313D', '#78CFFF']);
  const node2Shadow = useTransform(
    smoothProgress,
    [0.42, 0.48],
    ['0 0 0px rgba(120, 207, 255, 0)', '0 0 16px rgba(120, 207, 255, 0.45)']
  );

  // Step 3: Publish activation (activates around 0.78, where line completes to the end of 3)
  const step3NumberColor = useTransform(smoothProgress, [0.64, 0.78], ['#414F60', '#78CFFF']);
  const step3HeadingColor = useTransform(
    smoothProgress,
    [0.64, 0.78],
    ['rgba(241, 244, 248, 0.45)', '#F1F4F8']
  );
  const step3DescOpacity = useTransform(smoothProgress, [0.64, 0.78], [0.45, 1]);
  const node3Border = useTransform(smoothProgress, [0.72, 0.78], ['#26313D', '#78CFFF']);
  const node3Scale = useTransform(smoothProgress, [0.72, 0.78], [1, 1.15]);
  const node3DotBg = useTransform(smoothProgress, [0.72, 0.78], ['#26313D', '#78CFFF']);
  const node3Shadow = useTransform(
    smoothProgress,
    [0.72, 0.78],
    ['0 0 0px rgba(120, 207, 255, 0)', '0 0 16px rgba(120, 207, 255, 0.45)']
  );

  // Stroke completes exactly at Node 3 (the end of 3) at 0.78
  const horizontalStrokeDashoffset = useTransform(
    smoothProgress,
    [0.15, 0.78],
    [666.6, 0]
  );
  const horizontalDashoffset = prefersReducedMotion ? 0 : horizontalStrokeDashoffset;

  const verticalStrokeDashoffset = useTransform(
    smoothProgress,
    [0.15, 0.78],
    [976, 0]
  );
  const verticalDashoffset = prefersReducedMotion ? 0 : verticalStrokeDashoffset;
  const strokeOpacity = useTransform(smoothProgress, [0.12, 0.15], [0, 1]);

  // Symphony & Success Sparkle Flow (blooms from 0.76 to 0.94 at the end of 3)
  const sparkleOpacity = useTransform(smoothProgress, [0.76, 0.82, 0.97, 1.0], [0, 1, 1, 1]);
  const sparkleScale = useTransform(smoothProgress, [0.76, 0.84, 0.92], [0.2, 1.25, 1.0]);
  const sparkleRotate = useTransform(smoothProgress, [0.76, 0.94], [-25, 25]);
  const sparkleAuraScale = useTransform(smoothProgress, [0.78, 0.86, 0.94], [0.8, 1.9, 1.5]);
  const sparkleAuraOpacity = useTransform(smoothProgress, [0.78, 0.85, 0.94], [0, 0.85, 0.55]);
  const sparkleSat1X = useTransform(smoothProgress, [0.78, 0.90], [0, 18]);
  const sparkleSat1Y = useTransform(smoothProgress, [0.78, 0.90], [0, -18]);
  const sparkleSat1Scale = useTransform(smoothProgress, [0.78, 0.86, 0.94], [0, 0.85, 0.7]);
  const sparkleSat2X = useTransform(smoothProgress, [0.80, 0.92], [0, 24]);
  const sparkleSat2Y = useTransform(smoothProgress, [0.80, 0.92], [0, 12]);
  const sparkleSat2Scale = useTransform(smoothProgress, [0.80, 0.88, 0.94], [0, 0.65, 0.55]);
  const symphonyGlowOpacity = useTransform(smoothProgress, [0.76, 0.86, 0.96], [0, 0.85, 0.5]);

  return (
    <section id="how-it-works" ref={sectionRef} className="how-it-works-section">
      <div className="how-it-works-section__sticky">
        <SectionHeading
          className="landing-section__header--sequence"
          eyebrow="HOW IT WORKS"
          title="From product to published."
          subtitle="Three simple steps. One complete content workflow."
        />

        <div className="connected-sequence">
        {/* Horizontal connecting rail for desktop & tablet */}
        <div className="connected-sequence__rail-wrap connected-sequence__rail-wrap--horizontal" aria-hidden="true">
          <svg
            className="connected-sequence__svg connected-sequence__svg--horizontal"
            viewBox="0 0 1000 24"
            preserveAspectRatio="none"
            fill="none"
          >
            <defs>
              <radialGradient id="sparkleGradientMain" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="45%" stopColor="#78CFFF" />
                <stop offset="100%" stopColor="#73F0D5" />
              </radialGradient>
              <radialGradient id="sparkleGradientAurora" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="50%" stopColor="#73F0D5" />
                <stop offset="100%" stopColor="#4DE0B8" />
              </radialGradient>
              <radialGradient id="sparkleGradientCyan" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="60%" stopColor="#78CFFF" />
                <stop offset="100%" stopColor="#38B6FF" />
              </radialGradient>
              <linearGradient id="symphonyGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#78CFFF" stopOpacity="0.2" />
                <stop offset="50%" stopColor="#73F0D5" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.95" />
              </linearGradient>
            </defs>

            {/* Inactive base line ending at Node 3 (833.3) */}
            <path
              d="M 166.7 12 L 833.3 12"
              stroke="#26313D"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* Active cyan stroke starting at Node 1 (166.7) and ending at Node 3 (833.3) */}
            <motion.path
              d="M 166.7 12 L 833.3 12"
              stroke="#78CFFF"
              strokeWidth="1.5"
              strokeDasharray="666.6 3000"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
              style={{
                strokeDashoffset: horizontalDashoffset,
                opacity: prefersReducedMotion ? 1 : strokeOpacity,
              }}
            />
            {/* Symphony fluorescent pulse wave along completed line */}
            <motion.path
              d="M 166.7 12 L 833.3 12"
              stroke="url(#symphonyGlow)"
              strokeWidth="3"
              strokeDasharray="666.6 3000"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
              style={{
                strokeDashoffset: horizontalDashoffset,
                opacity: prefersReducedMotion ? 0.6 : symphonyGlowOpacity,
              }}
            />
          </svg>
        </div>

        {/* Vertical connecting rail for mobile */}
        <div className="connected-sequence__rail-wrap connected-sequence__rail-wrap--vertical" aria-hidden="true">
          <svg
            className="connected-sequence__svg connected-sequence__svg--vertical"
            viewBox="0 0 24 1000"
            preserveAspectRatio="none"
            fill="none"
          >
            <path
              d="M 12 12 L 12 988"
              stroke="#26313D"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
            <motion.path
              d="M 12 12 L 12 988"
              stroke="#78CFFF"
              strokeWidth="1.5"
              strokeDasharray="976 4000"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
              style={{
                strokeDashoffset: verticalDashoffset,
                opacity: prefersReducedMotion ? 1 : strokeOpacity,
              }}
            />
            <motion.path
              d="M 12 12 L 12 988"
              stroke="url(#symphonyGlow)"
              strokeWidth="3"
              strokeDasharray="976 4000"
              strokeLinecap="butt"
              vectorEffect="non-scaling-stroke"
              style={{
                strokeDashoffset: verticalDashoffset,
                opacity: prefersReducedMotion ? 0.6 : symphonyGlowOpacity,
              }}
            />
          </svg>
        </div>

        <div className="connected-sequence__grid">
          {/* Step 01 — Upload Your Product */}
          <div className="connected-sequence__step">
            <motion.div
              className="connected-sequence__number"
              style={{ color: prefersReducedMotion ? '#78CFFF' : step1NumberColor }}
            >
              01
            </motion.div>

            <div className="connected-sequence__node-anchor">
              <motion.div
                className="connected-sequence__node"
                style={{
                  borderColor: prefersReducedMotion ? '#78CFFF' : node1Border,
                  scale: prefersReducedMotion ? 1.15 : node1Scale,
                  boxShadow: prefersReducedMotion
                    ? '0 0 16px rgba(120, 207, 255, 0.45)'
                    : node1Shadow,
                }}
              >
                <motion.span
                  className="connected-sequence__node-core"
                  style={{
                    backgroundColor: prefersReducedMotion ? '#78CFFF' : node1DotBg,
                  }}
                />
              </motion.div>
            </div>

            <div className="connected-sequence__content">
              <motion.h3
                className="connected-sequence__heading"
                style={{ color: prefersReducedMotion ? '#F1F4F8' : step1HeadingColor }}
              >
                Upload Your Product
              </motion.h3>

              <motion.p
                className="connected-sequence__desc"
                style={{
                  opacity: prefersReducedMotion ? 1 : step1DescOpacity,
                }}
              >
                Start with a product photo. Tell PrixmoAI about your brand and what you want to achieve.
              </motion.p>
            </div>
          </div>

          {/* Step 02 — Create Your Content */}
          <div className="connected-sequence__step">
            <motion.div
              className="connected-sequence__number"
              style={{ color: prefersReducedMotion ? '#78CFFF' : step2NumberColor }}
            >
              02
            </motion.div>

            <div className="connected-sequence__node-anchor">
              <motion.div
                className="connected-sequence__node"
                style={{
                  borderColor: prefersReducedMotion ? '#78CFFF' : node2Border,
                  scale: prefersReducedMotion ? 1.15 : node2Scale,
                  boxShadow: prefersReducedMotion
                    ? '0 0 16px rgba(120, 207, 255, 0.45)'
                    : node2Shadow,
                }}
              >
                <motion.span
                  className="connected-sequence__node-core"
                  style={{
                    backgroundColor: prefersReducedMotion ? '#78CFFF' : node2DotBg,
                  }}
                />
              </motion.div>
            </div>

            <div className="connected-sequence__content">
              <motion.h3
                className="connected-sequence__heading"
                style={{ color: prefersReducedMotion ? '#F1F4F8' : step2HeadingColor }}
              >
                Create Your Content
              </motion.h3>

              <div className="connected-sequence__desc-wrap">
                <p className="connected-sequence__desc connected-sequence__desc--base">
                  Generate professional product visuals, captions, trending hashtags, reel scripts and videos.
                </p>
                <motion.p
                  className="connected-sequence__desc connected-sequence__desc--reveal"
                  style={{
                    clipPath: prefersReducedMotion ? 'none' : step2ClipPath,
                    opacity: prefersReducedMotion ? 1 : step2DescOpacity,
                  }}
                  aria-hidden="true"
                >
                  Generate professional product visuals, captions, trending hashtags, reel scripts and videos.
                </motion.p>
              </div>
            </div>
          </div>

          {/* Step 03 — Schedule & Publish */}
          <div className="connected-sequence__step">
            <motion.div
              className="connected-sequence__number"
              style={{ color: prefersReducedMotion ? '#78CFFF' : step3NumberColor }}
            >
              03
            </motion.div>

            <div className="connected-sequence__node-anchor">
              <motion.div
                className="connected-sequence__node"
                style={{
                  borderColor: prefersReducedMotion ? '#78CFFF' : node3Border,
                  scale: prefersReducedMotion ? 1.15 : node3Scale,
                  boxShadow: prefersReducedMotion
                    ? '0 0 16px rgba(120, 207, 255, 0.45)'
                    : node3Shadow,
                }}
              >
                <motion.span
                  className="connected-sequence__node-core"
                  style={{
                    backgroundColor: prefersReducedMotion ? '#78CFFF' : node3DotBg,
                  }}
                />
              </motion.div>

              {/* Symphony & Success Sparkle Flow Blooming from the End of 3 */}
              <motion.div
                className="connected-sequence__sparkle-cluster"
                style={{
                  opacity: prefersReducedMotion ? 1 : sparkleOpacity,
                  scale: prefersReducedMotion ? 1 : sparkleScale,
                }}
                aria-hidden="true"
              >
                {/* Fluorescent Aura Glow */}
                <motion.div
                  className="connected-sequence__sparkle-aura"
                  style={{
                    scale: prefersReducedMotion ? 1.5 : sparkleAuraScale,
                    opacity: prefersReducedMotion ? 0.6 : sparkleAuraOpacity,
                  }}
                />

                {/* Primary Diamond Sparkle Star */}
                <motion.svg
                  className="connected-sequence__sparkle-star connected-sequence__sparkle-star--main"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{
                    rotate: prefersReducedMotion ? 0 : sparkleRotate,
                  }}
                >
                  <path
                    d="M12 0 C12 7.2 16.8 12 24 12 C16.8 12 12 16.8 12 24 C12 16.8 7.2 12 0 12 C7.2 12 12 7.2 12 0 Z"
                    fill="url(#sparkleGradientMain)"
                  />
                </motion.svg>

                {/* Satellite Micro-Sparkle Top-Right */}
                <motion.svg
                  className="connected-sequence__sparkle-star connected-sequence__sparkle-star--sat1"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{
                    x: prefersReducedMotion ? 18 : sparkleSat1X,
                    y: prefersReducedMotion ? -18 : sparkleSat1Y,
                    scale: prefersReducedMotion ? 0.75 : sparkleSat1Scale,
                  }}
                >
                  <path
                    d="M12 0 C12 7.2 16.8 12 24 12 C16.8 12 12 16.8 12 24 C12 16.8 7.2 12 0 12 C7.2 12 12 7.2 12 0 Z"
                    fill="url(#sparkleGradientAurora)"
                  />
                </motion.svg>

                {/* Satellite Micro-Sparkle Bottom-Right */}
                <motion.svg
                  className="connected-sequence__sparkle-star connected-sequence__sparkle-star--sat2"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{
                    x: prefersReducedMotion ? 24 : sparkleSat2X,
                    y: prefersReducedMotion ? 12 : sparkleSat2Y,
                    scale: prefersReducedMotion ? 0.6 : sparkleSat2Scale,
                  }}
                >
                  <path
                    d="M12 0 C12 7.2 16.8 12 24 12 C16.8 12 12 16.8 12 24 C12 16.8 7.2 12 0 12 C7.2 12 12 7.2 12 0 Z"
                    fill="url(#sparkleGradientCyan)"
                  />
                </motion.svg>
              </motion.div>
            </div>

            <div className="connected-sequence__content">
              <motion.h3
                className="connected-sequence__heading"
                style={{ color: prefersReducedMotion ? '#F1F4F8' : step3HeadingColor }}
              >
                Schedule & Publish
              </motion.h3>

              <motion.p
                className="connected-sequence__desc"
                style={{
                  opacity: prefersReducedMotion ? 1 : step3DescOpacity,
                }}
              >
                Review your content, choose your publishing time and manage your social media workflow.
              </motion.p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
};

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
      { label: 'No watermark', included: true },
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
  subtitle,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('landing-section__header', className)}>
    {eyebrow ? <Badge className="landing-pill landing-pill--section">{eyebrow}</Badge> : null}
    <h2>{title}</h2>
    {subtitle ? (
      <p className="landing-section__subtitle">{subtitle}</p>
    ) : description ? (
      <p className="landing-copy landing-copy--center">{description}</p>
    ) : null}
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
  const heroVoidY = useTransform(scrollYProgress, [0, 1], ['0%', '6%']);

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

      <section id="product-demo" className="section landing-showcase-section">
        <div className="landing-showcase-section__content">
          <div className="landing-hero__visual landing-hero__visual--showcase">
            <Card glow className="hero-showcase">
              <div className="hero-showcase__scene hero-showcase__scene--raw" />
              <div className="hero-showcase__scene hero-showcase__scene--transform" />
              <div className="hero-showcase__scene hero-showcase__scene--studio" />
              <div className="hero-showcase__ambient hero-showcase__ambient--raw" />
              <div className="hero-showcase__ambient hero-showcase__ambient--studio" />
              <div className="hero-showcase__ambient hero-showcase__ambient--fog" />

              <div className="hero-showcase__stage">
                <div className="hero-showcase__spotlight hero-showcase__spotlight--input" />
                <div className="hero-showcase__spotlight hero-showcase__spotlight--transfer" />
                <div className="hero-showcase__spotlight hero-showcase__spotlight--output" />

                <div className="showcase-card showcase-card--input">
                  <div className="showcase-card__header">
                    <Badge>YOUR UPLOAD</Badge>
                    <span>Before</span>
                  </div>
                  <div className="showcase-media showcase-media--input">
                    <img
                      src="/showcase-input-product.svg"
                      alt="Normal product photo uploaded by the business owner"
                    />
                  </div>
                  <div className="showcase-description">
                    <strong>Raw. Real. Unedited</strong>
                    <p className="landing-copy">
                      A product photo taken on any phone. Flat lighting, no setup, no
                      filters. This is your starting point and it is all PrixmoAI
                      needs.
                    </p>
                  </div>
                </div>

                <div className="showcase-transfer">
                  <span className="showcase-transfer__eyebrow">PRIXMOAI ENGINE</span>
                  <div className="showcase-transfer__visual">
                    <div className="showcase-transfer__visual-glow" />
                    <BlackHoleCanvas
                      className="showcase-transfer__canvas"
                      particleCount={40}
                      quality="cinematic"
                    />
                  </div>
                </div>

                <div className="showcase-card showcase-card--output">
                  <div className="showcase-card__header">
                    <Badge>READY TO POST</Badge>
                    <span>After</span>
                  </div>
                  <div className="showcase-media showcase-media--output">
                    <img
                      src="/showcase-output-product.svg"
                      alt="Studio-ready ultra realistic product image generated by PrixmoAI"
                    />
                  </div>
                  <div className="showcase-description showcase-description--output">
                    <strong>Clean. Sharp. Scheduled</strong>
                    <p className="landing-copy">
                      Studio quality product visual, three caption variants, optimised
                      hashtags and a reel script ready to go live on Instagram
                      directly from this screen.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <SignalGapSection />

      <HowItWorksConnectedSequenceSection />

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
        </Card>
      </section>

      <Footer />
    </div>
  );
};
