import { useEffect, useRef } from 'react';

type BlackHoleCanvasProps = {
  className?: string;
  particleCount?: number;
  interactive?: boolean;
};

type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  baseRadius: number;
  opacity: number;
  damping: number;
  hue: number;
  collisionCooldown: number;
  trailTick: number;
  trailCursor: number;
  trailSize: number;
  trailX: Float32Array;
  trailY: Float32Array;
};

type Fragment = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  hue: number;
};

type Burst = {
  active: boolean;
  x: number;
  y: number;
  age: number;
  duration: number;
  strength: number;
  hue: number;
};

type Shockwave = {
  active: boolean;
  x: number;
  y: number;
  age: number;
  duration: number;
  radius: number;
  hue: number;
};

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  drift: number;
};

const TAU = Math.PI * 2;
const TRAIL_POINTS = 12;
const MAX_PARTICLES = 80;
const MIN_PARTICLES = 40;
const FRAGMENT_POOL_SIZE = 48;
const BURST_POOL_SIZE = 10;
const SHOCKWAVE_POOL_SIZE = 8;
const ORBIT_BANDS = [
  { radius: 0.29, damping: 0.9958, speedJitter: 0.08 },
  { radius: 0.43, damping: 0.997, speedJitter: 0.06 },
  { radius: 0.58, damping: 0.9978, speedJitter: 0.045 },
  { radius: 0.71, damping: 0.9985, speedJitter: 0.12 },
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const createParticle = (): Particle => ({
  active: true,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  mass: 1,
  radius: 2.2,
  baseRadius: 2.2,
  opacity: 1,
  damping: 0.997,
  hue: 188,
  collisionCooldown: 0,
  trailTick: 0,
  trailCursor: 0,
  trailSize: 0,
  trailX: new Float32Array(TRAIL_POINTS),
  trailY: new Float32Array(TRAIL_POINTS),
});

const createFragment = (): Fragment => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 0,
  life: 0,
  maxLife: 0,
  hue: 192,
});

const createBurst = (): Burst => ({
  active: false,
  x: 0,
  y: 0,
  age: 0,
  duration: 0.28,
  strength: 1,
  hue: 190,
});

const createShockwave = (): Shockwave => ({
  active: false,
  x: 0,
  y: 0,
  age: 0,
  duration: 0.36,
  radius: 0,
  hue: 190,
});

export function BlackHoleCanvas({
  className = '',
  particleCount = 30,
  interactive = false,
}: BlackHoleCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const resolvedParticleCount = clamp(
      Math.round(particleCount),
      MIN_PARTICLES,
      MAX_PARTICLES,
    );

    const particles = Array.from({ length: resolvedParticleCount }, createParticle);
    const fragments = Array.from({ length: FRAGMENT_POOL_SIZE }, createFragment);
    const bursts = Array.from({ length: BURST_POOL_SIZE }, createBurst);
    const shockwaves = Array.from({ length: SHOCKWAVE_POOL_SIZE }, createShockwave);
    let stars: Star[] = [];

    let rafId = 0;
    let destroyed = false;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let centerX = 0;
    let centerY = 0;
    let blackHoleCenterX = 0;
    let blackHoleCenterY = 0;
    let cameraOffsetX = 0;
    let cameraOffsetY = 0;
    let glowPulse = 0.8;
    let diskRotation = 0;
    let collisionAccumulator = 0;
    let simulationRadius = 1;
    let eventRadius = 1;
    let singularityRadius = 1;
    let gravitationalParameter = 1;
    let lastTime = performance.now();
    let driftSeed = Math.random() * TAU;

    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      active: false,
    };

    const recordTrail = (particle: Particle) => {
      particle.trailX[particle.trailCursor] = particle.x;
      particle.trailY[particle.trailCursor] = particle.y;
      particle.trailCursor = (particle.trailCursor + 1) % TRAIL_POINTS;
      particle.trailSize = Math.min(particle.trailSize + 1, TRAIL_POINTS);
    };

    const primeTrail = (particle: Particle) => {
      particle.trailCursor = 0;
      particle.trailSize = 0;
      for (let index = 0; index < TRAIL_POINTS; index += 1) {
        recordTrail(particle);
      }
    };

    const activateBurst = (x: number, y: number, strength: number, duration: number, hue: number) => {
      const burst = bursts.find((entry) => !entry.active) ?? bursts[0];
      burst.active = true;
      burst.x = x;
      burst.y = y;
      burst.age = 0;
      burst.duration = duration;
      burst.strength = strength;
      burst.hue = hue;
    };

    const activateShockwave = (
      x: number,
      y: number,
      radius: number,
      duration: number,
      hue: number,
    ) => {
      const shockwave = shockwaves.find((entry) => !entry.active) ?? shockwaves[0];
      shockwave.active = true;
      shockwave.x = x;
      shockwave.y = y;
      shockwave.age = 0;
      shockwave.duration = duration;
      shockwave.radius = radius;
      shockwave.hue = hue;
    };

    const emitFragments = (x: number, y: number, hue: number, total: number) => {
      for (let index = 0; index < total; index += 1) {
        const fragment = fragments.find((entry) => !entry.active);
        if (!fragment) {
          break;
        }

        const angle = (TAU * index) / total + randomBetween(-0.28, 0.28);
        const speed = randomBetween(28, 92);

        fragment.active = true;
        fragment.x = x;
        fragment.y = y;
        fragment.vx = Math.cos(angle) * speed;
        fragment.vy = Math.sin(angle) * speed;
        fragment.radius = randomBetween(1, 2.6);
        fragment.maxLife = randomBetween(0.22, 0.46);
        fragment.life = fragment.maxLife;
        fragment.hue = hue + randomBetween(-10, 10);
      }
    };

    const resetParticle = (particle: Particle, source: 'orbit' | 'horizon', bandIndex?: number) => {
      const band =
        bandIndex ?? Math.floor(Math.random() * ORBIT_BANDS.length) % ORBIT_BANDS.length;
      const bandProfile = ORBIT_BANDS[band];
      const angle = Math.random() * TAU;
      const direction = band === 3 && Math.random() < 0.24 ? -1 : 1;
      const radius =
        source === 'horizon'
          ? eventRadius * randomBetween(1.28, 1.72)
          : simulationRadius * bandProfile.radius * randomBetween(0.9, 1.08);
      const circularVelocity = Math.sqrt(gravitationalParameter / Math.max(radius, eventRadius));
      const tangentialX = -Math.sin(angle) * direction;
      const tangentialY = Math.cos(angle) * direction;
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      const eccentricity = randomBetween(-bandProfile.speedJitter, bandProfile.speedJitter);
      const radialKick =
        source === 'horizon' ? randomBetween(12, 26) : randomBetween(-8, 8);

      particle.active = true;
      particle.x = blackHoleCenterX + radialX * radius;
      particle.y = blackHoleCenterY + radialY * radius;
      particle.vx =
        tangentialX * circularVelocity * (1 + eccentricity) + radialX * radialKick;
      particle.vy =
        tangentialY * circularVelocity * (1 + eccentricity) + radialY * radialKick;
      particle.mass = randomBetween(0.8, 1.25);
      particle.baseRadius = randomBetween(1.8, 3.35);
      particle.radius = particle.baseRadius;
      particle.opacity = randomBetween(0.68, 1);
      particle.damping = clamp(
        bandProfile.damping + randomBetween(-0.00035, 0.00024),
        0.995,
        0.999,
      );
      particle.hue = 182 + randomBetween(-10, 18);
      particle.collisionCooldown = 0.18;
      particle.trailTick = 0;
      primeTrail(particle);
    };

    const respawnParticle = (particle: Particle) => {
      activateBurst(blackHoleCenterX, blackHoleCenterY, 0.95, 0.22, 170);
      activateShockwave(
        blackHoleCenterX,
        blackHoleCenterY,
        eventRadius * randomBetween(1.1, 1.5),
        0.24,
        182,
      );
      resetParticle(particle, 'horizon');
    };

    const triggerSupernova = (x: number, y: number) => {
      activateBurst(x, y, randomBetween(1.2, 1.8), 0.28, 186);
      activateShockwave(x, y, randomBetween(26, 48), 0.32, 192);
      emitFragments(x, y, 188, 5 + Math.floor(Math.random() * 6));
    };

    const rebuildScene = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      centerX = width * 0.5;
      centerY = height * 0.5;
      pixelRatio = Math.min(window.devicePixelRatio || 1, interactive ? 1.4 : 1.1);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      simulationRadius = Math.min(width, height) * 0.44;
      eventRadius = simulationRadius * 0.28;
      singularityRadius = eventRadius * 0.56;
      gravitationalParameter = simulationRadius * simulationRadius * 11.8;
      driftSeed = Math.random() * TAU;

      const starCount = Math.max(8, Math.round((width * height) / 5200));
      stars = Array.from({ length: starCount }, () => ({
        x: randomBetween(-width * 0.42, width * 0.42),
        y: randomBetween(-height * 0.42, height * 0.42),
        radius: randomBetween(0.45, 1.4),
        alpha: randomBetween(0.04, 0.2),
        drift: randomBetween(0.4, 1.35),
      }));

      particles.forEach((particle, index) =>
        resetParticle(particle, 'orbit', index % ORBIT_BANDS.length),
      );

      fragments.forEach((fragment) => {
        fragment.active = false;
      });

      bursts.forEach((burst) => {
        burst.active = false;
      });

      shockwaves.forEach((shockwave) => {
        shockwave.active = false;
      });
    };

    const lensPosition = (x: number, y: number) => {
      const dx = x - blackHoleCenterX;
      const dy = y - blackHoleCenterY;
      const radius = Math.sqrt(dx * dx + dy * dy);

      if (radius <= 0.0001) {
        return { x, y };
      }

      const distortion = clamp((singularityRadius / Math.max(radius, singularityRadius)) ** 2, 0, 0.18);
      let nextX = x;
      let nextY = y;

      if (dy < 0) {
        const tangentX = -dy / radius;
        const tangentY = dx / radius;
        nextX += tangentX * distortion * 22;
        nextY += tangentY * distortion * 22;
      }

      const lensStrength = 1 + distortion * 0.12;
      return {
        x: blackHoleCenterX + (nextX - blackHoleCenterX) * lensStrength,
        y: blackHoleCenterY + (nextY - blackHoleCenterY) * lensStrength,
      };
    };

    const updateParticle = (particle: Particle, dt: number) => {
      if (!particle.active) {
        return;
      }

      const gravityX = particle.x - blackHoleCenterX;
      const gravityY = particle.y - blackHoleCenterY;
      const radius = Math.sqrt(gravityX * gravityX + gravityY * gravityY);
      const clampedRadius = Math.max(radius, singularityRadius * 1.14);
      const inverseRadiusCubed = 1 / (clampedRadius * clampedRadius * clampedRadius);
      const accelerationX = -gravitationalParameter * gravityX * inverseRadiusCubed;
      const accelerationY = -gravitationalParameter * gravityY * inverseRadiusCubed;

      particle.vx += accelerationX * dt;
      particle.vy += accelerationY * dt;

      if (interactive && pointer.active) {
        const mouseX = pointer.x * simulationRadius * 0.42;
        const mouseY = pointer.y * simulationRadius * 0.42;
        const dx = mouseX - particle.x;
        const dy = mouseY - particle.y;
        const mouseDistance = Math.sqrt(dx * dx + dy * dy);

        if (mouseDistance > 0.001 && mouseDistance < simulationRadius * 0.92) {
          const mouseForce =
            (1 - mouseDistance / (simulationRadius * 0.92)) * simulationRadius * 0.55;
          particle.vx += (dx / mouseDistance) * mouseForce * dt * 0.12;
          particle.vy += (dy / mouseDistance) * mouseForce * dt * 0.12;
        }
      }

      const damping = Math.pow(particle.damping, dt * 60);
      particle.vx *= damping;
      particle.vy *= damping;

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      particle.collisionCooldown = Math.max(0, particle.collisionCooldown - dt);

      const updatedGravityX = particle.x - blackHoleCenterX;
      const updatedGravityY = particle.y - blackHoleCenterY;
      const updatedRadius = Math.sqrt(
        updatedGravityX * updatedGravityX + updatedGravityY * updatedGravityY,
      );
      const fadeEnvelope = clamp(
        (updatedRadius - singularityRadius * 0.7) / (eventRadius * 0.9),
        0,
        1,
      );
      particle.radius = particle.baseRadius * fadeEnvelope;
      particle.opacity = clamp(0.12 + fadeEnvelope * 0.92, 0, 1);

      particle.trailTick += dt;
      if (particle.trailTick >= 1 / 45) {
        particle.trailTick = 0;
        recordTrail(particle);
      }

      if (updatedRadius <= singularityRadius * 0.92 || particle.opacity <= 0.03) {
        respawnParticle(particle);
      }
    };

    const updateFragment = (fragment: Fragment, dt: number) => {
      if (!fragment.active) {
        return;
      }

      const gravityX = fragment.x - blackHoleCenterX;
      const gravityY = fragment.y - blackHoleCenterY;
      const radius = Math.sqrt(gravityX * gravityX + gravityY * gravityY);
      const clampedRadius = Math.max(radius, singularityRadius * 1.1);
      const inverseRadiusCubed = 1 / (clampedRadius * clampedRadius * clampedRadius);
      const gravityScale = gravitationalParameter * 0.3;

      fragment.vx += -gravityScale * gravityX * inverseRadiusCubed * dt;
      fragment.vy += -gravityScale * gravityY * inverseRadiusCubed * dt;
      fragment.vx *= Math.pow(0.991, dt * 60);
      fragment.vy *= Math.pow(0.991, dt * 60);
      fragment.x += fragment.vx * dt;
      fragment.y += fragment.vy * dt;
      fragment.life -= dt;

      if (fragment.life <= 0 || radius < singularityRadius * 0.86) {
        fragment.active = false;
      }
    };

    const updateBurst = (burst: Burst, dt: number) => {
      if (!burst.active) {
        return;
      }

      burst.age += dt;
      if (burst.age >= burst.duration) {
        burst.active = false;
      }
    };

    const updateShockwave = (shockwave: Shockwave, dt: number) => {
      if (!shockwave.active) {
        return;
      }

      shockwave.age += dt;
      if (shockwave.age >= shockwave.duration) {
        shockwave.active = false;
      }
    };

    const checkCollisions = () => {
      for (let first = 0; first < particles.length; first += 1) {
        const particleA = particles[first];
        if (!particleA.active || particleA.collisionCooldown > 0) {
          continue;
        }

        for (let second = first + 1; second < particles.length; second += 1) {
          const particleB = particles[second];
          if (!particleB.active || particleB.collisionCooldown > 0) {
            continue;
          }

          const dx = particleB.x - particleA.x;
          const dy = particleB.y - particleA.y;
          const distanceSquared = dx * dx + dy * dy;
          const threshold = (particleA.radius + particleB.radius) * 2.2 + 1.6;

          if (distanceSquared >= threshold * threshold) {
            continue;
          }

          const collisionX = (particleA.x + particleB.x) * 0.5;
          const collisionY = (particleA.y + particleB.y) * 0.5;
          const collisionOffsetX = collisionX - blackHoleCenterX;
          const collisionOffsetY = collisionY - blackHoleCenterY;
          const collisionRadius = Math.sqrt(
            collisionOffsetX * collisionOffsetX + collisionOffsetY * collisionOffsetY,
          );

          if (collisionRadius < eventRadius * 1.25) {
            continue;
          }

          triggerSupernova(collisionX, collisionY);
          resetParticle(particleA, 'orbit');
          resetParticle(particleB, 'orbit');
        }
      }
    };

    const drawBackground = (time: number) => {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      context.fillStyle = '#02060d';
      context.fillRect(0, 0, width, height);

      const radialBackdrop = context.createRadialGradient(
        centerX + cameraOffsetX + blackHoleCenterX,
        centerY + cameraOffsetY + blackHoleCenterY,
        simulationRadius * 0.18,
        centerX + cameraOffsetX + blackHoleCenterX,
        centerY + cameraOffsetY + blackHoleCenterY,
        simulationRadius * 1.95,
      );
      radialBackdrop.addColorStop(0, 'rgba(31, 76, 88, 0.34)');
      radialBackdrop.addColorStop(0.45, 'rgba(9, 24, 35, 0.28)');
      radialBackdrop.addColorStop(1, 'rgba(2, 6, 13, 0.96)');
      context.fillStyle = radialBackdrop;
      context.fillRect(0, 0, width, height);

      context.save();
      context.translate(centerX + cameraOffsetX, centerY + cameraOffsetY);

      stars.forEach((star) => {
        const parallax = Math.sin(time * 0.00016 * star.drift + driftSeed) * 2.4;
        context.beginPath();
        context.fillStyle = `rgba(157, 219, 255, ${star.alpha})`;
        context.arc(star.x + parallax, star.y - parallax * 0.6, star.radius, 0, TAU);
        context.fill();
      });

      context.restore();
    };

    const drawTrails = () => {
      context.save();
      context.translate(centerX + cameraOffsetX, centerY + cameraOffsetY);
      context.globalCompositeOperation = 'lighter';

      particles.forEach((particle) => {
        if (!particle.active || particle.trailSize < 2) {
          return;
        }

        for (let index = 1; index < particle.trailSize; index += 1) {
          const previousIndex =
            (particle.trailCursor - particle.trailSize + index - 1 + TRAIL_POINTS) %
            TRAIL_POINTS;
          const nextIndex =
            (particle.trailCursor - particle.trailSize + index + TRAIL_POINTS) %
            TRAIL_POINTS;
          const previousPoint = lensPosition(
            particle.trailX[previousIndex],
            particle.trailY[previousIndex],
          );
          const nextPoint = lensPosition(
            particle.trailX[nextIndex],
            particle.trailY[nextIndex],
          );
          const alpha = (index / particle.trailSize) * 0.22 * particle.opacity;

          context.beginPath();
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.lineWidth = particle.radius * (0.45 + index / particle.trailSize);
          context.strokeStyle = `hsla(${particle.hue}, 96%, 72%, ${alpha})`;
          context.moveTo(previousPoint.x, previousPoint.y);
          context.lineTo(nextPoint.x, nextPoint.y);
          context.stroke();
        }
      });

      context.restore();
      context.globalCompositeOperation = 'source-over';
    };

    const drawDisk = (time: number) => {
      context.save();
      context.translate(centerX + cameraOffsetX, centerY + cameraOffsetY);

      const diskInnerRadius = eventRadius * 1.5;
      const diskOuterRadius = eventRadius * 3;
      const diskTilt = 0.46;

      const halo = context.createRadialGradient(
        blackHoleCenterX,
        blackHoleCenterY,
        singularityRadius * 0.25,
        blackHoleCenterX,
        blackHoleCenterY,
        simulationRadius * 1.18,
      );
      halo.addColorStop(0, `rgba(0, 0, 0, ${0.94 * glowPulse})`);
      halo.addColorStop(0.18, `rgba(27, 74, 77, ${0.22 * glowPulse})`);
      halo.addColorStop(0.42, `rgba(53, 141, 156, ${0.12 * glowPulse})`);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(blackHoleCenterX, blackHoleCenterY, simulationRadius * 1.12, 0, TAU);
      context.fill();

      context.save();
      context.globalCompositeOperation = 'lighter';
      context.translate(blackHoleCenterX, blackHoleCenterY);
      context.rotate(diskRotation);
      context.scale(1, diskTilt);

      const diskGradient = context.createRadialGradient(0, 0, diskInnerRadius, 0, 0, diskOuterRadius);
      diskGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      diskGradient.addColorStop(0.08, `rgba(255, 248, 232, ${0.46 * glowPulse})`);
      diskGradient.addColorStop(0.22, `rgba(255, 168, 86, ${0.34 * glowPulse})`);
      diskGradient.addColorStop(0.48, `rgba(255, 104, 194, ${0.28 * glowPulse})`);
      diskGradient.addColorStop(0.78, `rgba(96, 188, 255, ${0.24 * glowPulse})`);
      diskGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = diskGradient;
      context.shadowBlur = 26;
      context.shadowColor = `rgba(118, 233, 255, ${0.24 * glowPulse})`;
      context.beginPath();
      context.arc(0, 0, diskOuterRadius, 0, TAU);
      context.fill();

      const turbulenceBandCount = interactive ? 16 : 10;

      for (let index = 0; index < turbulenceBandCount; index += 1) {
        const arcStart =
          (index / turbulenceBandCount) * TAU + diskRotation * (1.3 + index * 0.01);
        const arcLength = 0.24 + Math.sin(time * 0.0011 + index * 0.73) * 0.08;
        const turbulenceRadius =
          diskInnerRadius +
          (diskOuterRadius - diskInnerRadius) *
            (0.16 + ((index * 17) % 19) / turbulenceBandCount);
        const hue = 24 + ((index * 31) % 210);

        context.beginPath();
        context.lineCap = 'round';
        context.lineWidth = 1.1 + (1 - index / turbulenceBandCount) * 1.7;
        context.strokeStyle = `hsla(${hue}, 100%, 76%, ${
          0.06 + (1 - index / turbulenceBandCount) * 0.1
        })`;
        context.arc(0, 0, turbulenceRadius, arcStart, arcStart + arcLength);
        context.stroke();
      }

      context.restore();

      context.shadowBlur = 0;
      context.globalCompositeOperation = 'source-over';

      context.strokeStyle = `rgba(154, 237, 255, ${0.16 * glowPulse})`;
      context.lineWidth = 1.25;
      context.beginPath();
      context.arc(blackHoleCenterX, blackHoleCenterY, eventRadius * 1.08, 0, TAU);
      context.stroke();

      context.strokeStyle = `rgba(111, 197, 241, ${0.12 * glowPulse})`;
      context.lineWidth = 1.1;
      context.beginPath();
      context.arc(blackHoleCenterX, blackHoleCenterY, diskOuterRadius * 1.08, 0, TAU);
      context.stroke();

      context.strokeStyle = `rgba(120, 237, 212, ${0.08 * glowPulse})`;
      context.beginPath();
      context.arc(blackHoleCenterX, blackHoleCenterY, diskOuterRadius * 1.3, 0, TAU);
      context.stroke();

      const singularityGlow = context.createRadialGradient(
        blackHoleCenterX,
        blackHoleCenterY,
        singularityRadius * 0.25,
        blackHoleCenterX,
        blackHoleCenterY,
        eventRadius * 1.2,
      );
      singularityGlow.addColorStop(0, 'rgba(0, 0, 0, 1)');
      singularityGlow.addColorStop(0.24, 'rgba(1, 2, 4, 0.98)');
      singularityGlow.addColorStop(0.52, 'rgba(3, 8, 11, 0.94)');
      singularityGlow.addColorStop(0.76, `rgba(65, 176, 182, ${0.12 * glowPulse})`);
      singularityGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = singularityGlow;
      context.beginPath();
      context.arc(blackHoleCenterX, blackHoleCenterY, eventRadius * 1.18, 0, TAU);
      context.fill();

      context.fillStyle = '#020306';
      context.beginPath();
      context.arc(blackHoleCenterX, blackHoleCenterY, singularityRadius, 0, TAU);
      context.fill();

      context.strokeStyle = 'rgba(205, 245, 255, 0.06)';
      context.beginPath();
      context.arc(blackHoleCenterX, blackHoleCenterY, singularityRadius * 1.04, 0, TAU);
      context.stroke();

      context.restore();
    };

    const drawBursts = () => {
      context.save();
      context.translate(centerX + cameraOffsetX, centerY + cameraOffsetY);
      context.globalCompositeOperation = 'lighter';

      bursts.forEach((burst) => {
        if (!burst.active) {
          return;
        }

        const progress = burst.age / burst.duration;
        const eased = 1 - progress;
        const radius = simulationRadius * 0.2 * burst.strength + progress * simulationRadius * 0.24;
        const gradient = context.createRadialGradient(
          burst.x,
          burst.y,
          0,
          burst.x,
          burst.y,
          radius,
        );
        gradient.addColorStop(0, `hsla(${burst.hue}, 100%, 84%, ${0.5 * eased})`);
        gradient.addColorStop(0.22, `hsla(${burst.hue + 10}, 100%, 72%, ${0.24 * eased})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(burst.x, burst.y, radius, 0, TAU);
        context.fill();
      });

      shockwaves.forEach((shockwave) => {
        if (!shockwave.active) {
          return;
        }

        const progress = shockwave.age / shockwave.duration;
        context.beginPath();
        context.lineWidth = 1.5 + (1 - progress) * 3.2;
        context.strokeStyle = `hsla(${shockwave.hue}, 100%, 78%, ${0.3 * (1 - progress)})`;
        context.arc(shockwave.x, shockwave.y, shockwave.radius * progress, 0, TAU);
        context.stroke();
      });

      context.restore();
      context.globalCompositeOperation = 'source-over';
    };

    const drawFragments = () => {
      context.save();
      context.translate(centerX + cameraOffsetX, centerY + cameraOffsetY);
      context.globalCompositeOperation = 'lighter';

      fragments.forEach((fragment) => {
        if (!fragment.active) {
          return;
        }

        const lifeProgress = fragment.life / fragment.maxLife;
        const drawPoint = lensPosition(fragment.x, fragment.y);
        const gradient = context.createRadialGradient(
          drawPoint.x,
          drawPoint.y,
          0,
          drawPoint.x,
          drawPoint.y,
          fragment.radius * 4,
        );
        gradient.addColorStop(0, `hsla(${fragment.hue}, 100%, 78%, ${0.34 * lifeProgress})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(drawPoint.x, drawPoint.y, fragment.radius * 3.4, 0, TAU);
        context.fill();

        context.fillStyle = `hsla(${fragment.hue}, 100%, 78%, ${0.78 * lifeProgress})`;
        context.beginPath();
        context.arc(drawPoint.x, drawPoint.y, fragment.radius, 0, TAU);
        context.fill();
      });

      context.restore();
      context.globalCompositeOperation = 'source-over';
    };

    const drawParticles = () => {
      context.save();
      context.translate(centerX + cameraOffsetX, centerY + cameraOffsetY);
      context.globalCompositeOperation = 'lighter';

      particles.forEach((particle) => {
        if (!particle.active) {
          return;
        }

        const drawPoint = lensPosition(particle.x, particle.y);
        const glowRadius = particle.radius * 6;
        const gradient = context.createRadialGradient(
          drawPoint.x,
          drawPoint.y,
          0,
          drawPoint.x,
          drawPoint.y,
          glowRadius,
        );

        gradient.addColorStop(0, `hsla(${particle.hue}, 100%, 84%, ${0.7 * particle.opacity})`);
        gradient.addColorStop(0.38, `hsla(${particle.hue}, 100%, 72%, ${0.32 * particle.opacity})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        context.fillStyle = gradient;
        context.beginPath();
        context.arc(drawPoint.x, drawPoint.y, glowRadius, 0, TAU);
        context.fill();

        context.fillStyle = `hsla(${particle.hue}, 100%, 84%, ${0.96 * particle.opacity})`;
        context.beginPath();
        context.arc(drawPoint.x, drawPoint.y, Math.max(0.2, particle.radius), 0, TAU);
        context.fill();
      });

      context.restore();
      context.globalCompositeOperation = 'source-over';
    };

    const renderFrame = (time: number) => {
      drawBackground(time);
      drawTrails();
      drawDisk(time);
      drawBursts();
      drawFragments();
      drawParticles();
    };

    const animate = (time: number) => {
      if (destroyed) {
        return;
      }

      const dt = Math.min((time - lastTime) / 1000, 0.033);
      lastTime = time;

      const timeSeconds = time * 0.001;
      blackHoleCenterX = Math.sin(timeSeconds * 0.2) * Math.min(20, simulationRadius * 0.18);
      blackHoleCenterY = Math.cos(timeSeconds * 0.15) * Math.min(15, simulationRadius * 0.14);
      cameraOffsetX = Math.sin(timeSeconds * 0.05) * Math.min(10, simulationRadius * 0.09);
      cameraOffsetY = Math.cos(timeSeconds * 0.04) * Math.min(8, simulationRadius * 0.07);
      glowPulse = 0.8 + Math.sin(timeSeconds * 0.8) * 0.1;
      diskRotation = (diskRotation + dt * 0.1) % TAU;

      pointer.x += (pointer.targetX - pointer.x) * 0.08;
      pointer.y += (pointer.targetY - pointer.y) * 0.08;

      particles.forEach((particle) => updateParticle(particle, dt));
      collisionAccumulator += dt;
      if (collisionAccumulator >= 1 / 24) {
        checkCollisions();
        collisionAccumulator = 0;
      }
      fragments.forEach((fragment) => updateFragment(fragment, dt));
      bursts.forEach((burst) => updateBurst(burst, dt));
      shockwaves.forEach((shockwave) => updateShockwave(shockwave, dt));
      renderFrame(time);

      rafId = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const normalizedY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
      pointer.targetX = clamp(normalizedX, -1, 1);
      pointer.targetY = clamp(normalizedY, -1, 1);
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      pointer.targetX = 0;
      pointer.targetY = 0;
    };

    const resizeObserver = new ResizeObserver(() => {
      rebuildScene();
    });

    resizeObserver.observe(container);
    if (interactive) {
      container.addEventListener('pointermove', handlePointerMove);
      container.addEventListener('pointerleave', handlePointerLeave);
    }

    rebuildScene();
    rafId = window.requestAnimationFrame((time) => {
      lastTime = time;
      animate(time);
    });

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (interactive) {
        container.removeEventListener('pointermove', handlePointerMove);
        container.removeEventListener('pointerleave', handlePointerLeave);
      }
    };
  }, [interactive, particleCount]);

  return (
    <div
      ref={containerRef}
      className={className ? `blackhole-canvas ${className}` : 'blackhole-canvas'}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="blackhole-canvas__surface" />
      <div className="blackhole-canvas__vignette" />
    </div>
  );
}
