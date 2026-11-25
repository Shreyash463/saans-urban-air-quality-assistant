import { useEffect, useRef, useState } from 'react';
import {
  SMOG_ADAPTIVE_WINDOW_FRAMES,
  SMOG_MAX_AVG_FRAME_MS,
  SMOG_MAX_DPR,
  SMOG_MOBILE_BREAKPOINT_PX,
  SMOG_PARTICLE_COUNT_DESKTOP,
  SMOG_PARTICLE_COUNT_MOBILE,
  SMOG_POINTER_REPEL_RADIUS_PX,
} from '../lib/motion';

interface SmogCanvasProps {
  reducedMotion: boolean;
  isDark: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  isTeal: boolean;
}

/**
 * Ultra-lightweight ambient PM2.5 particle canvas for the Hero section.
 * Capped at <= 20 particles, batched into 2 color fills, paused offscreen or
 * when hidden, and self-unmounts automatically if average frame time exceeds
 * ~24 ms over 60 frames.
 */
export default function SmogCanvas({ reducedMotion, isDark }: SmogCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDarkRef = useRef(isDark);
  const [disabledForPerf, setDisabledForPerf] = useState(false);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    if (reducedMotion || disabledForPerf || typeof window === 'undefined') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let rafId = 0;
    let isVisible = true;
    let isTabVisible = !document.hidden;
    let lastFrameTs = 0;
    let frameSum = 0;
    let frameCount = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    const initParticles = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, SMOG_MAX_DPR);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count =
        window.innerWidth < SMOG_MOBILE_BREAKPOINT_PX
          ? SMOG_PARTICLE_COUNT_MOBILE
          : SMOG_PARTICLE_COUNT_DESKTOP;

      particles = Array.from({ length: count }, (_, idx) => {
        const seedA = ((idx * 97 + 13) % 100) / 100;
        const seedB = ((idx * 53 + 29) % 100) / 100;
        const seedC = ((idx * 31 + 7) % 100) / 100;
        return {
          x: seedA * width,
          y: seedB * height,
          vx: (seedC - 0.35) * 0.25,
          vy: (seedA - 0.5) * 0.14,
          radius: 1.6 + seedC * 2.8,
          alpha: 0.16 + seedB * 0.14,
          isTeal: idx % 5 === 0,
        };
      });
    };

    const render = (now: number) => {
      if (!isVisible || !isTabVisible) {
        rafId = 0;
        lastFrameTs = 0;
        return;
      }

      if (lastFrameTs > 0) {
        const delta = now - lastFrameTs;
        // Ignore single idle gap > 250ms (e.g. tab switch), track genuine render pacing
        if (delta > 0 && delta < 250) {
          frameSum += delta;
          frameCount += 1;
          if (frameCount >= SMOG_ADAPTIVE_WINDOW_FRAMES) {
            const avg = frameSum / frameCount;
            if (avg > SMOG_MAX_AVG_FRAME_MS) {
              rafId = 0;
              setDisabledForPerf(true);
              return;
            }
            frameSum = 0;
            frameCount = 0;
          }
        }
      }
      lastFrameTs = now;

      ctx.clearRect(0, 0, width, height);
      const fillColor = isDarkRef.current
        ? 'rgba(148, 163, 184, 0.22)'
        : 'rgba(100, 116, 139, 0.22)';
      const tealColor = isDarkRef.current
        ? 'rgba(45, 212, 191, 0.26)'
        : 'rgba(13, 148, 136, 0.24)';

      for (let pass = 0; pass < 2; pass += 1) {
        const wantTeal = pass === 1;
        ctx.fillStyle = wantTeal ? tealColor : fillColor;
        ctx.beginPath();

        for (let i = 0; i < particles.length; i += 1) {
          const p = particles[i];
          if (p.isTeal !== wantTeal) continue;

          if (pass === 0 || wantTeal) {
            if (pointer.active) {
              const dx = p.x - pointer.x;
              const dy = p.y - pointer.y;
              const distSq = dx * dx + dy * dy;
              const maxR = SMOG_POINTER_REPEL_RADIUS_PX;
              if (distSq > 1 && distSq < maxR * maxR) {
                const dist = Math.sqrt(distSq);
                const force = ((maxR - dist) / maxR) * 0.35;
                p.x += (dx / dist) * force;
                p.y += (dy / dist) * force;
              }
            }

            p.x += p.vx;
            p.y += p.vy;

            if (p.x < -8) p.x = width + 8;
            if (p.x > width + 8) p.x = -8;
            if (p.y < -8) p.y = height + 8;
            if (p.y > height + 8) p.y = -8;
          }

          ctx.moveTo(p.x + p.radius, p.y);
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        }

        ctx.fill();
      }

      rafId = window.requestAnimationFrame(render);
    };

    const startLoop = () => {
      if (!rafId && isVisible && isTabVisible) {
        lastFrameTs = 0;
        rafId = window.requestAnimationFrame(render);
      }
    };

    const stopLoop = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active =
        pointer.x >= 0 &&
        pointer.x <= rect.width &&
        pointer.y >= 0 &&
        pointer.y <= rect.height;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleVisibility = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        startLoop();
      } else {
        stopLoop();
      }
    };

    initParticles();

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              isVisible = Boolean(entry?.isIntersecting);
              if (isVisible) {
                startLoop();
              } else {
                stopLoop();
              }
            },
            { threshold: 0.01 }
          )
        : null;

    observer?.observe(canvas);
    window.addEventListener('resize', initParticles, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibility);

    startLoop();

    return () => {
      stopLoop();
      observer?.disconnect();
      window.removeEventListener('resize', initParticles);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [reducedMotion, disabledForPerf]);

  if (reducedMotion || disabledForPerf) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="smog-canvas"
      className="pointer-events-none absolute inset-0 w-full h-full opacity-90"
    />
  );
}
