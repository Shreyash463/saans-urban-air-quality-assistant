import {
  SMOG_ADAPTIVE_WINDOW_FRAMES,
  SMOG_MAX_AVG_FRAME_MS,
  SMOG_MOBILE_BREAKPOINT_PX,
  SMOG_PARTICLE_COUNT_DESKTOP,
  SMOG_PARTICLE_COUNT_MOBILE,
  SMOG_POINTER_REPEL_RADIUS_PX,
} from './motion';

export interface SmogParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isTeal: boolean;
}

export interface SmogPointerState {
  x: number;
  y: number;
  active: boolean;
}

export interface FrameBudgetTracker {
  lastTs: number;
  sum: number;
  count: number;
}

export function createSmogParticles(width: number, height: number): SmogParticle[] {
  const count =
    window.innerWidth < SMOG_MOBILE_BREAKPOINT_PX
      ? SMOG_PARTICLE_COUNT_MOBILE
      : SMOG_PARTICLE_COUNT_DESKTOP;

  return Array.from({ length: count }, (_, idx) => {
    const seedA = ((idx * 97 + 13) % 100) / 100;
    const seedB = ((idx * 53 + 29) % 100) / 100;
    const seedC = ((idx * 31 + 7) % 100) / 100;
    return {
      x: seedA * width,
      y: seedB * height,
      vx: (seedC - 0.35) * 0.25,
      vy: (seedA - 0.5) * 0.14,
      radius: 1.6 + seedC * 2.8,
      isTeal: idx % 5 === 0,
    };
  });
}

export function checkAdaptivePerformance(
  tracker: FrameBudgetTracker,
  now: number
): boolean {
  const delta = tracker.lastTs > 0 ? now - tracker.lastTs : 0;
  tracker.lastTs = now;
  if (delta <= 0 || delta >= 250) return true;
  tracker.sum += delta;
  tracker.count += 1;
  if (tracker.count < SMOG_ADAPTIVE_WINDOW_FRAMES) return true;
  const ok = tracker.sum / tracker.count <= SMOG_MAX_AVG_FRAME_MS;
  tracker.sum = 0;
  tracker.count = 0;
  return ok;
}

function stepSingleParticle(
  p: SmogParticle,
  pointer: SmogPointerState,
  width: number,
  height: number
): void {
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
  p.x = ((p.x + p.vx + width + 16) % (width + 16)) - 8;
  p.y = ((p.y + p.vy + height + 16) % (height + 16)) - 8;
}

export function drawSmogFrame(
  ctx: CanvasRenderingContext2D,
  particles: SmogParticle[],
  pointer: SmogPointerState,
  width: number,
  height: number,
  isDark: boolean
): void {
  ctx.clearRect(0, 0, width, height);
  const baseFill = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(100, 116, 139, 0.22)';
  const tealFill = isDark ? 'rgba(45, 212, 191, 0.26)' : 'rgba(13, 148, 136, 0.24)';

  for (const wantTeal of [false, true]) {
    ctx.fillStyle = wantTeal ? tealFill : baseFill;
    ctx.beginPath();
    for (const p of particles) {
      if (p.isTeal !== wantTeal) continue;
      stepSingleParticle(p, pointer, width, height);
      ctx.moveTo(p.x + p.radius, p.y);
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
