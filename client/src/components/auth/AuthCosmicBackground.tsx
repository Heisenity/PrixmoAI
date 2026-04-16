import { useEffect, useRef } from 'react';

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
};

type DiskParticle = {
  layer: 0 | 1 | 2;
  baseRadius: number;
  theta0: number;
  size: number;
  alpha: number;
  phase: number;
  radialPhase: number;
  streak: number;
  eccentricity: number;
};

type HawkingParticle = {
  theta0: number;
  phase: number;
  size: number;
  alpha: number;
  driftSpeed: number;
  spread: number;
};

type ShootingStarState = {
  active: boolean;
  startAt: number;
  duration: number;
  delayUntil: number;
  x: number;
  y: number;
  angle: number;
  travel: number;
  length: number;
};

type SceneState = {
  stars: Star[];
  particles: DiskParticle[];
  hawkingParticles: HawkingParticle[];
  blackHoleX: number;
  blackHoleY: number;
  diskRadius: number;
  diskTilt: number;
  shootingStar: ShootingStarState;
};

const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const createSeededRandom = (seed: number) => {
  let current = seed % 2147483647;

  if (current <= 0) {
    current += 2147483646;
  }

  return () => {
    current = (current * 16807) % 2147483647;
    return (current - 1) / 2147483646;
  };
};

const sampleNoise = (time: number, radius: number, phase: number) =>
  Math.sin(time * 0.31 + radius * 0.045 + phase) +
  0.52 * Math.sin(time * 0.17 - radius * 0.028 + phase * 1.73);

const getDiskColor = (
  normalizedRadius: number,
  approachFactor: number,
  alpha: number
) => {
  const hotness = 1 - normalizedRadius;
  const hue =
    10 +
    normalizedRadius * 20 +
    (1 - approachFactor) * 12 -
    hotness * 13;
  const saturation = 90 - normalizedRadius * 7 + approachFactor * 4;
  const lightness =
    36 +
    hotness * 42 +
    approachFactor * 24 -
    normalizedRadius * 8;

  return `hsla(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(
    1
  )}%, ${alpha.toFixed(3)})`;
};

const buildSceneState = (width: number, height: number): SceneState => {
  const random = createSeededRandom(90210);
  const compact = width < 640;
  const medium = width < 1024;
  const starCount = compact ? 12 : medium ? 16 : 22;
  const particleCount = compact ? 62 : medium ? 96 : 132;
  const hawkingCount = compact ? 7 : medium ? 9 : 12;
  const diskRadius = compact
    ? Math.min(width * 0.28, 156)
    : medium
      ? Math.min(width * 0.27, 248)
      : Math.min(width * 0.31, 348);
  const blackHoleX = compact
    ? width * 0.09
    : medium
      ? width * 0.025
      : 0;
  const blackHoleY = height * 0.5;
  const diskTilt = compact ? 0.58 : medium ? 0.54 : 0.5;

  const stars = Array.from({ length: starCount }, () => ({
    x: random() * width,
    y: random() * height,
    radius: 0.55 + random() * (compact ? 0.8 : 1.2),
    alpha: 0.05 + random() * 0.18,
    twinkleSpeed: 0.08 + random() * 0.18,
    twinklePhase: random() * TAU,
  }));

  const innerRadius = diskRadius * 0.48;
  const outerRadius = diskRadius * 1.18;

  const particles = Array.from({ length: particleCount }, (_, index) => {
    const t = index / Math.max(particleCount - 1, 1);
    const radiusBias = Math.pow(random(), 0.78);
    const baseRadius = innerRadius + radiusBias * (outerRadius - innerRadius);
    const layer: 0 | 1 | 2 =
      baseRadius < diskRadius * 0.72 ? 0 : baseRadius < diskRadius * 0.96 ? 1 : 2;

    return {
      layer,
      baseRadius,
      theta0: random() * TAU,
      size:
        layer === 0
          ? 1.1 + random() * 1.55
          : layer === 1
            ? 1 + random() * 1.2
            : 0.82 + random() * 1.05,
      alpha: 0.05 + (1 - t) * 0.12 + random() * 0.06,
      phase: random() * TAU,
      radialPhase: random() * TAU,
      streak:
        layer === 0
          ? 12 + random() * 18
          : layer === 1
            ? 16 + random() * 22
            : 18 + random() * 28,
      eccentricity: (random() - 0.5) * 0.1,
    };
  });

  const hawkingParticles = Array.from({ length: hawkingCount }, () => ({
    theta0: random() * TAU,
    phase: random(),
    size: 0.75 + random() * 1.15,
    alpha: 0.026 + random() * 0.038,
    driftSpeed: 0.04 + random() * 0.04,
    spread: 0.2 + random() * 0.22,
  }));

  return {
    stars,
    particles,
    hawkingParticles,
    blackHoleX,
    blackHoleY,
    diskRadius,
    diskTilt,
    shootingStar: {
      active: false,
      startAt: 0,
      duration: 0,
      delayUntil: 2200 + random() * 1800,
      x: 0,
      y: 0,
      angle: 0,
      travel: 0,
      length: 0,
    },
  };
};

const spawnShootingStar = (
  state: SceneState,
  width: number,
  height: number,
  now: number
) => {
  const random = Math.random;
  state.shootingStar = {
    active: true,
    startAt: now,
    duration: 900 + random() * 500,
    delayUntil: 0,
    x: width * (0.56 + random() * 0.14),
    y: height * (0.14 + random() * 0.16),
    angle: -0.5 - random() * 0.16,
    travel: width * (0.1 + random() * 0.08),
    length: 84 + random() * 26,
  };
};

export const AuthCosmicBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    let rafId = 0;
    let destroyed = false;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let scene = buildSceneState(window.innerWidth, window.innerHeight);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = buildSceneState(width, height);
    };

    const drawStars = (time: number) => {
      for (const star of scene.stars) {
        const dx = star.x - scene.blackHoleX;
        const dy = star.y - scene.blackHoleY;
        const distance = Math.hypot(dx, dy);
        const lensZone = scene.diskRadius * 2.75;
        const distortion =
          distance < lensZone
            ? (scene.diskRadius * scene.diskRadius * 0.018) /
              (distance * distance + scene.diskRadius * 26)
            : 0;
        const angle = Math.atan2(dy, dx);
        const bentX =
          star.x + Math.cos(angle) * distortion * scene.diskRadius * 1.28;
        const bentY =
          star.y + Math.sin(angle) * distortion * scene.diskRadius * 0.82;
        const twinkle =
          star.alpha *
          (0.9 + 0.1 * Math.sin(time * star.twinkleSpeed + star.twinklePhase));

        context.beginPath();
        context.fillStyle = `rgba(226, 242, 255, ${twinkle.toFixed(3)})`;
        context.shadowBlur = 4;
        context.shadowColor = 'rgba(143, 216, 255, 0.05)';
        context.arc(bentX, bentY, star.radius, 0, TAU);
        context.fill();
      }

      context.shadowBlur = 0;
    };

    const drawDisk = (time: number) => {
      const { blackHoleX, blackHoleY, diskRadius, diskTilt } = scene;
      const innerRadius = diskRadius * 0.48;
      const outerRadius = diskRadius * 1.18;

      const backdropVignette = context.createRadialGradient(
        blackHoleX,
        blackHoleY,
        diskRadius * 0.42,
        blackHoleX,
        blackHoleY,
        diskRadius * 1.64
      );
      backdropVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      backdropVignette.addColorStop(0.42, 'rgba(0, 0, 0, 0.08)');
      backdropVignette.addColorStop(0.72, 'rgba(0, 0, 0, 0.22)');
      backdropVignette.addColorStop(1, 'rgba(0, 0, 0, 0.38)');

      context.fillStyle = backdropVignette;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, diskRadius * 1.64, 0, TAU);
      context.fill();

      const drawEnergyBand = (
        radius: number,
        widthScale: number,
        alpha: number,
        speed: number,
        angleOffset: number
      ) => {
        context.save();
        context.rotate(time * speed + angleOffset);
        const bandGradient = context.createLinearGradient(-radius, 0, radius, 0);
        bandGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        bandGradient.addColorStop(0.22, `rgba(181, 64, 18, ${(alpha * 0.34).toFixed(3)})`);
        bandGradient.addColorStop(0.5, `rgba(255, 221, 156, ${(alpha * 0.88).toFixed(3)})`);
        bandGradient.addColorStop(0.72, `rgba(255, 144, 46, ${(alpha * 0.58).toFixed(3)})`);
        bandGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        context.strokeStyle = bandGradient;
        context.lineWidth = widthScale;
        context.lineCap = 'round';
        context.beginPath();
        context.arc(0, 0, radius, -1.06, -0.14);
        context.stroke();
        context.beginPath();
        context.arc(0, 0, radius * 1.01, 0.34, 1.78);
        context.stroke();
        context.restore();
      };

      const renderLayer = (layer: 0 | 1 | 2, frontSide: boolean) => {
        for (const particle of scene.particles) {
          if (particle.layer !== layer) {
            continue;
          }

          const noise = sampleNoise(time, particle.baseRadius, particle.phase);
          const radialTurbulence =
            noise * 0.55 +
            Math.sin(time * 0.29 + particle.radialPhase) * 0.38;
          const radialDrift = radialTurbulence * (layer === 0 ? 0.95 : layer === 1 ? 1.4 : 2.1);
          const infall = 0.78 / Math.pow(particle.baseRadius + 22, 0.74);
          const radius = particle.baseRadius + radialDrift - infall * time * 0.02;
          const omegaBase = layer === 0 ? 4.1 : layer === 1 ? 3.2 : 2.55;
          const omega = omegaBase / Math.pow(radius + 18, 0.6);
          const theta =
            particle.theta0 +
            omega * time +
            noise * 0.012 +
            Math.sin(time * 0.04 + particle.phase) * 0.01;
          const eccentricScale = 1 + particle.eccentricity;
          const x = Math.cos(theta) * radius * eccentricScale;
          const y = Math.sin(theta) * radius;
          const isFront = y >= 0;

          if (isFront !== frontSide) {
            continue;
          }

          const normalizedRadius = clamp(
            (radius - innerRadius) / (outerRadius - innerRadius),
            0,
            1
          );
          const tangentX = -Math.sin(theta);
          const tangentY = Math.cos(theta);
          const approachFactor = clamp(0.52 + 0.48 * Math.cos(theta - 0.42), 0, 1);
          const baseAlpha =
            particle.alpha *
            (frontSide ? 1.22 : 0.7) *
            (layer === 0 ? 1.18 : layer === 1 ? 1.02 : 0.84);
          const alpha =
            baseAlpha *
            (0.76 + approachFactor * 0.56) *
            (1 - normalizedRadius * (layer === 2 ? 0.18 : 0.08));
          const trailLength =
            particle.streak *
            (layer === 0 ? 0.82 : layer === 1 ? 1 : 1.16) *
            (1.08 - normalizedRadius * 0.22);
          const gradient = context.createLinearGradient(
            x - tangentX * trailLength,
            y - tangentY * trailLength,
            x + tangentX * trailLength,
            y + tangentY * trailLength
          );
          const whiteHot = clamp((1 - normalizedRadius) * (0.45 + approachFactor * 0.4), 0, 1);

          gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
          gradient.addColorStop(
            0.26,
            getDiskColor(normalizedRadius, approachFactor * 0.6, alpha * 0.5)
          );
          gradient.addColorStop(
            0.54,
            getDiskColor(normalizedRadius, approachFactor, alpha)
          );
          gradient.addColorStop(
            0.78,
            `rgba(255, 249, 234, ${(alpha * whiteHot * 1.08).toFixed(3)})`
          );
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

          context.strokeStyle = gradient;
          context.lineWidth =
            particle.size *
            (layer === 0 ? 1.16 : layer === 1 ? 1 : 0.82) *
            (frontSide ? 1 : 0.9);
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(x - tangentX * trailLength, y - tangentY * trailLength);
          context.lineTo(
            x + tangentX * trailLength * (frontSide ? 0.64 : 0.5),
            y + tangentY * trailLength * (frontSide ? 0.64 : 0.5)
          );
          context.stroke();
        }
      };

      context.save();
      context.translate(blackHoleX, blackHoleY);
      context.rotate(-0.34);
      context.scale(1, diskTilt);

      const halo = context.createRadialGradient(
        diskRadius * 0.05,
        -diskRadius * 0.03,
        diskRadius * 0.18,
        0,
        0,
        diskRadius * 1.36
      );
      halo.addColorStop(0, 'rgba(7, 10, 18, 0)');
      halo.addColorStop(0.18, 'rgba(255, 230, 180, 0.11)');
      halo.addColorStop(0.32, 'rgba(62, 146, 168, 0.22)');
      halo.addColorStop(0.5, 'rgba(66, 194, 208, 0.15)');
      halo.addColorStop(0.76, 'rgba(16, 40, 54, 0.05)');
      halo.addColorStop(1, 'rgba(7, 10, 18, 0)');

      context.save();
      context.globalCompositeOperation = 'screen';
      context.fillStyle = halo;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.34, diskRadius * 0.86, 0, 0, TAU);
      context.fill();

      const tightGlow = context.createRadialGradient(
        diskRadius * 0.02,
        -diskRadius * 0.02,
        diskRadius * 0.18,
        0,
        0,
        diskRadius * 0.72
      );
      tightGlow.addColorStop(0, 'rgba(255, 249, 236, 0)');
      tightGlow.addColorStop(0.3, 'rgba(255, 239, 190, 0.28)');
      tightGlow.addColorStop(0.56, 'rgba(255, 190, 84, 0.22)');
      tightGlow.addColorStop(0.8, 'rgba(212, 90, 26, 0.1)');
      tightGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = tightGlow;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 0.92, diskRadius * 0.5, 0, 0, TAU);
      context.fill();

      const midGlow = context.createRadialGradient(
        0,
        0,
        diskRadius * 0.42,
        0,
        0,
        diskRadius * 1.02
      );
      midGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
      midGlow.addColorStop(0.34, 'rgba(255, 194, 98, 0.15)');
      midGlow.addColorStop(0.6, 'rgba(255, 146, 46, 0.2)');
      midGlow.addColorStop(0.82, 'rgba(188, 62, 18, 0.12)');
      midGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = midGlow;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.08, diskRadius * 0.66, 0, 0, TAU);
      context.fill();

      const outerGlow = context.createRadialGradient(
        0,
        0,
        diskRadius * 0.76,
        0,
        0,
        diskRadius * 1.36
      );
      outerGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
      outerGlow.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
      outerGlow.addColorStop(0.82, 'rgba(255, 108, 34, 0.1)');
      outerGlow.addColorStop(0.92, 'rgba(96, 164, 206, 0.06)');
      outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = outerGlow;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.32, diskRadius * 0.86, 0, 0, TAU);
      context.fill();
      context.restore();

      const outerSpiral = context.createRadialGradient(
        0,
        0,
        diskRadius * 0.54,
        0,
        0,
        diskRadius * 1.24
      );
      outerSpiral.addColorStop(0, 'rgba(0, 0, 0, 0)');
      outerSpiral.addColorStop(0.38, 'rgba(174, 50, 10, 0.074)');
      outerSpiral.addColorStop(0.58, 'rgba(230, 112, 28, 0.13)');
      outerSpiral.addColorStop(0.8, 'rgba(136, 42, 14, 0.098)');
      outerSpiral.addColorStop(0.92, 'rgba(74, 118, 160, 0.038)');
      outerSpiral.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = outerSpiral;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.22, diskRadius * 0.8, 0, 0, TAU);
      context.fill();

      const coolOuterRim = context.createRadialGradient(
        0,
        0,
        diskRadius * 0.82,
        0,
        0,
        diskRadius * 1.34
      );
      coolOuterRim.addColorStop(0, 'rgba(0, 0, 0, 0)');
      coolOuterRim.addColorStop(0.72, 'rgba(0, 0, 0, 0)');
      coolOuterRim.addColorStop(0.86, 'rgba(98, 170, 220, 0.052)');
      coolOuterRim.addColorStop(0.94, 'rgba(40, 78, 114, 0.044)');
      coolOuterRim.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = coolOuterRim;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.28, diskRadius * 0.84, 0, 0, TAU);
      context.fill();

      const farSideOcclusion = context.createLinearGradient(0, -diskRadius, 0, diskRadius);
      farSideOcclusion.addColorStop(0, 'rgba(4, 7, 12, 0.24)');
      farSideOcclusion.addColorStop(0.24, 'rgba(5, 8, 14, 0.19)');
      farSideOcclusion.addColorStop(0.54, 'rgba(0, 0, 0, 0)');
      farSideOcclusion.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = farSideOcclusion;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.18, diskRadius * 0.78, 0, 0, TAU);
      context.fill();

      renderLayer(2, false);
      renderLayer(1, false);
      renderLayer(0, false);

      const innerHotRing = context.createRadialGradient(
        diskRadius * 0.02,
        -diskRadius * 0.02,
        diskRadius * 0.22,
        0,
        0,
        diskRadius * 0.76
      );
      innerHotRing.addColorStop(0, 'rgba(255, 246, 232, 0)');
      innerHotRing.addColorStop(0.28, 'rgba(255, 248, 228, 0.18)');
      innerHotRing.addColorStop(0.46, 'rgba(255, 235, 172, 0.28)');
      innerHotRing.addColorStop(0.64, 'rgba(255, 172, 58, 0.2)');
      innerHotRing.addColorStop(0.82, 'rgba(198, 74, 18, 0.08)');
      innerHotRing.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = innerHotRing;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 0.82, diskRadius * 0.43, 0, 0, TAU);
      context.fill();

      context.save();
      context.globalCompositeOperation = 'screen';
      context.shadowBlur = 6;
      context.shadowColor = 'rgba(255, 245, 214, 0.28)';
      context.strokeStyle = 'rgba(255, 247, 228, 0.84)';
      context.lineWidth = 2;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 0.58, diskRadius * 0.27, 0, 0, TAU);
      context.stroke();
      context.shadowBlur = 0;
      context.restore();

      const luminousMidBand = context.createRadialGradient(
        diskRadius * 0.08,
        0,
        diskRadius * 0.36,
        0,
        0,
        diskRadius * 1.02
      );
      luminousMidBand.addColorStop(0, 'rgba(0, 0, 0, 0)');
      luminousMidBand.addColorStop(0.42, 'rgba(255, 204, 116, 0.07)');
      luminousMidBand.addColorStop(0.6, 'rgba(255, 150, 56, 0.11)');
      luminousMidBand.addColorStop(0.78, 'rgba(152, 48, 12, 0.072)');
      luminousMidBand.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = luminousMidBand;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.04, diskRadius * 0.58, 0, 0, TAU);
      context.fill();

      const depthShade = context.createLinearGradient(
        -diskRadius * 1.2,
        0,
        diskRadius * 1.2,
        0
      );
      depthShade.addColorStop(0, 'rgba(255, 244, 220, 0.055)');
      depthShade.addColorStop(0.32, 'rgba(255, 214, 152, 0.03)');
      depthShade.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
      depthShade.addColorStop(1, 'rgba(0, 0, 0, 0.15)');

      context.fillStyle = depthShade;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.18, diskRadius * 0.79, 0, 0, TAU);
      context.fill();

      const nearSideBoost = context.createLinearGradient(
        0,
        -diskRadius * 0.16,
        0,
        diskRadius
      );
      nearSideBoost.addColorStop(0, 'rgba(0, 0, 0, 0)');
      nearSideBoost.addColorStop(0.34, 'rgba(255, 198, 104, 0.048)');
      nearSideBoost.addColorStop(0.66, 'rgba(255, 244, 224, 0.094)');
      nearSideBoost.addColorStop(1, 'rgba(255, 255, 255, 0)');

      context.fillStyle = nearSideBoost;
      context.beginPath();
      context.ellipse(0, 0, diskRadius * 1.16, diskRadius * 0.78, 0, 0, TAU);
      context.fill();

      drawEnergyBand(diskRadius * 0.66, 3.7, 0.82, 0.72, 0.3);
      drawEnergyBand(diskRadius * 0.84, 4.3, 0.62, 0.5, 1.68);
      drawEnergyBand(diskRadius * 1.02, 4.8, 0.44, 0.34, 3.04);

      renderLayer(0, true);
      renderLayer(1, true);
      renderLayer(2, true);

      context.restore();

      const lensGradient = context.createRadialGradient(
        blackHoleX,
        blackHoleY,
        scene.diskRadius * 0.2,
        blackHoleX,
        blackHoleY,
        scene.diskRadius * 1.2
      );
      lensGradient.addColorStop(0, 'rgba(0, 0, 0, 0.985)');
      lensGradient.addColorStop(0.5, 'rgba(1, 3, 8, 0.965)');
      lensGradient.addColorStop(0.72, 'rgba(9, 20, 31, 0.16)');
      lensGradient.addColorStop(0.9, 'rgba(22, 50, 66, 0.04)');
      lensGradient.addColorStop(1, 'rgba(10, 17, 28, 0)');

      context.fillStyle = lensGradient;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, scene.diskRadius * 1.08, 0, TAU);
      context.fill();
    };

    const drawEventHorizon = (time: number) => {
      const { blackHoleX, blackHoleY, diskRadius } = scene;
      const horizonRadius = diskRadius * 0.46;
      const photonRadius = horizonRadius * 1.085;
      const shimmer =
        0.24 + 0.05 * Math.sin(time * 0.11) + 0.02 * Math.sin(time * 0.23);

      const warpGradient = context.createRadialGradient(
        blackHoleX,
        blackHoleY,
        horizonRadius * 0.94,
        blackHoleX,
        blackHoleY,
        diskRadius * 0.98
      );
      warpGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      warpGradient.addColorStop(0.46, 'rgba(0, 0, 0, 0)');
      warpGradient.addColorStop(0.7, 'rgba(67, 127, 156, 0.032)');
      warpGradient.addColorStop(0.86, 'rgba(8, 12, 19, 0.11)');
      warpGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = warpGradient;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, diskRadius * 0.98, 0, TAU);
      context.fill();

      context.save();
      context.translate(blackHoleX, blackHoleY);
      context.rotate(-0.18 + time * 0.014);
      context.scale(1, 0.88);

      context.strokeStyle = `rgba(240, 246, 255, ${(shimmer * 0.24).toFixed(3)})`;
      context.lineWidth = 1.05;
      context.beginPath();
      context.arc(0, 0, photonRadius, -0.18, 0.96);
      context.stroke();

      context.strokeStyle = `rgba(125, 215, 234, ${(shimmer * 0.34).toFixed(3)})`;
      context.lineWidth = 1.35;
      context.beginPath();
      context.arc(0, 0, photonRadius * 1.01, 2.06, 4.02);
      context.stroke();

      context.restore();

      const photonGradient = context.createRadialGradient(
        blackHoleX,
        blackHoleY,
        horizonRadius * 0.9,
        blackHoleX,
        blackHoleY,
        photonRadius * 1.22
      );
      photonGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      photonGradient.addColorStop(0.74, 'rgba(0, 0, 0, 0)');
      photonGradient.addColorStop(
        0.83,
        `rgba(242, 248, 255, ${(shimmer * 0.28).toFixed(3)})`
      );
      photonGradient.addColorStop(
        0.89,
        `rgba(136, 218, 235, ${(shimmer * 0.4).toFixed(3)})`
      );
      photonGradient.addColorStop(0.95, 'rgba(61, 146, 174, 0.06)');
      photonGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = photonGradient;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, photonRadius * 1.22, 0, TAU);
      context.fill();

      const luminousInnerBoundary = context.createRadialGradient(
        blackHoleX,
        blackHoleY,
        horizonRadius * 0.92,
        blackHoleX,
        blackHoleY,
        horizonRadius * 1.14
      );
      luminousInnerBoundary.addColorStop(0, 'rgba(0, 0, 0, 0)');
      luminousInnerBoundary.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
      luminousInnerBoundary.addColorStop(
        0.76,
        `rgba(255, 245, 214, ${(0.34 + shimmer * 0.34).toFixed(3)})`
      );
      luminousInnerBoundary.addColorStop(
        0.9,
        `rgba(132, 216, 236, ${(0.16 + shimmer * 0.16).toFixed(3)})`
      );
      luminousInnerBoundary.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = luminousInnerBoundary;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, horizonRadius * 1.14, 0, TAU);
      context.fill();

      const horizonShadow = context.createRadialGradient(
        blackHoleX - horizonRadius * 0.08,
        blackHoleY + horizonRadius * 0.06,
        0,
        blackHoleX,
        blackHoleY,
        horizonRadius * 1.18
      );
      horizonShadow.addColorStop(0, 'rgba(0, 0, 0, 0.32)');
      horizonShadow.addColorStop(0.58, 'rgba(0, 0, 0, 0.16)');
      horizonShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = horizonShadow;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, horizonRadius * 1.18, 0, TAU);
      context.fill();

      const coreRelief = context.createRadialGradient(
        blackHoleX - horizonRadius * 0.14,
        blackHoleY - horizonRadius * 0.12,
        0,
        blackHoleX,
        blackHoleY,
        horizonRadius * 1.02
      );
      coreRelief.addColorStop(0, 'rgba(255, 255, 255, 0.022)');
      coreRelief.addColorStop(0.18, 'rgba(255, 246, 226, 0.01)');
      coreRelief.addColorStop(0.42, 'rgba(0, 0, 0, 0)');
      coreRelief.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = coreRelief;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, horizonRadius * 1.02, 0, TAU);
      context.fill();

      const coreDepthShadow = context.createRadialGradient(
        blackHoleX + horizonRadius * 0.16,
        blackHoleY + horizonRadius * 0.12,
        0,
        blackHoleX,
        blackHoleY,
        horizonRadius * 1.1
      );
      coreDepthShadow.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
      coreDepthShadow.addColorStop(0.28, 'rgba(0, 0, 0, 0.12)');
      coreDepthShadow.addColorStop(0.56, 'rgba(0, 0, 0, 0)');
      coreDepthShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      context.fillStyle = coreDepthShadow;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, horizonRadius * 1.1, 0, TAU);
      context.fill();

      const coreGradient = context.createRadialGradient(
        blackHoleX,
        blackHoleY,
        0,
        blackHoleX,
        blackHoleY,
        horizonRadius
      );
      coreGradient.addColorStop(0, 'rgba(0, 0, 0, 0.999)');
      coreGradient.addColorStop(0.42, 'rgba(0, 0, 0, 0.994)');
      coreGradient.addColorStop(0.76, 'rgba(2, 5, 9, 0.972)');
      coreGradient.addColorStop(1, 'rgba(10, 18, 27, 0.06)');

      context.fillStyle = coreGradient;
      context.beginPath();
      context.arc(blackHoleX, blackHoleY, horizonRadius, 0, TAU);
      context.fill();
    };

    const drawHawkingRadiation = (time: number) => {
      const horizonRadius = scene.diskRadius * 0.47;

      for (const particle of scene.hawkingParticles) {
        const progress = (time * particle.driftSpeed + particle.phase) % 1;
        const driftRadius = horizonRadius * (1.02 + progress * particle.spread);
        const theta = particle.theta0 + time * 0.1;
        const jitter = Math.sin(time * 0.4 + particle.phase * TAU) * 0.016;
        const x = scene.blackHoleX + Math.cos(theta + jitter) * driftRadius;
        const y = scene.blackHoleY + Math.sin(theta + jitter) * driftRadius * 0.95;
        const alpha = particle.alpha * Math.exp(-progress * 4);

        context.beginPath();
        context.fillStyle = `rgba(206, 236, 246, ${alpha.toFixed(3)})`;
        context.shadowBlur = 5;
        context.shadowColor = `rgba(143, 216, 255, ${(alpha * 0.45).toFixed(3)})`;
        context.arc(x, y, particle.size, 0, TAU);
        context.fill();
      }

      context.shadowBlur = 0;
    };

    const drawShootingStar = (now: number) => {
      const shootingStar = scene.shootingStar;

      if (!shootingStar.active) {
        if (now >= shootingStar.delayUntil) {
          spawnShootingStar(scene, width, height, now);
        }
        return;
      }

      const progress = (now - shootingStar.startAt) / shootingStar.duration;

      if (progress >= 1) {
        scene.shootingStar = {
          ...shootingStar,
          active: false,
          delayUntil: now + 2200 + Math.random() * 1800,
        };
        return;
      }

      const fade = Math.exp(-progress * 4.2);
      const distance = progress * shootingStar.travel;
      const x = shootingStar.x + Math.cos(shootingStar.angle) * distance;
      const y = shootingStar.y + Math.sin(shootingStar.angle) * distance;
      const tailX = Math.cos(shootingStar.angle) * shootingStar.length;
      const tailY = Math.sin(shootingStar.angle) * shootingStar.length;
      const gradient = context.createLinearGradient(x - tailX, y - tailY, x, y);

      gradient.addColorStop(0, 'rgba(143, 216, 255, 0)');
      gradient.addColorStop(
        0.62,
        `rgba(143, 216, 255, ${(0.12 * fade).toFixed(3)})`
      );
      gradient.addColorStop(1, `rgba(235, 247, 255, ${(0.7 * fade).toFixed(3)})`);

      context.strokeStyle = gradient;
      context.lineWidth = 1.5;
      context.lineCap = 'round';
      context.shadowBlur = 12;
      context.shadowColor = `rgba(143, 216, 255, ${(0.16 * fade).toFixed(3)})`;
      context.beginPath();
      context.moveTo(x - tailX, y - tailY);
      context.lineTo(x, y);
      context.stroke();
      context.shadowBlur = 0;
    };

    const render = (frameTime: number) => {
      if (destroyed) {
        return;
      }

      context.clearRect(0, 0, width, height);
      const time = frameTime * 0.001;

      drawStars(time);
      drawDisk(time);
      drawEventHorizon(time);
      drawHawkingRadiation(time);

      if (!prefersReducedMotion) {
        drawShootingStar(frameTime);
      }

      rafId = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    rafId = window.requestAnimationFrame(render);

    return () => {
      destroyed = true;
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="auth-cosmic" aria-hidden="true">
      <div className="auth-cosmic__gradient auth-cosmic__gradient--one" />
      <div className="auth-cosmic__gradient auth-cosmic__gradient--two" />
      <div className="auth-cosmic__gradient auth-cosmic__gradient--three" />
      <div className="auth-cosmic__noise" />
      <canvas ref={canvasRef} className="auth-cosmic__scene" />
    </div>
  );
};
