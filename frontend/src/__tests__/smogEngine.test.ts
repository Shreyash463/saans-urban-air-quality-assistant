import { describe, expect, it, vi } from 'vitest';
import { SMOG_ADAPTIVE_WINDOW_FRAMES, SMOG_MAX_AVG_FRAME_MS } from '../lib/motion';
import {
  checkAdaptivePerformance,
  createSmogParticles,
  drawSmogFrame,
} from '../lib/smogEngine';

describe('Smog engine physics & adaptive frame guard', () => {
  it('creates particles, steps pointer repulsion, and trips adaptive guard on slow frames', () => {
    const particles = createSmogParticles(800, 600);
    expect(particles.length).toBeGreaterThan(0);

    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    drawSmogFrame(
      ctx,
      particles,
      { x: particles[0].x + 10, y: particles[0].y + 10, active: true },
      800,
      600,
      true
    );
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(ctx.fill).toHaveBeenCalledTimes(2);

    const tracker = { lastTs: 0, sum: 0, count: 0 };
    expect(checkAdaptivePerformance(tracker, 100)).toBe(true);
    let ts = 100;
    let ok = true;
    for (let i = 0; i < SMOG_ADAPTIVE_WINDOW_FRAMES; i += 1) {
      ts += SMOG_MAX_AVG_FRAME_MS + 10;
      ok = checkAdaptivePerformance(tracker, ts);
    }
    expect(ok).toBe(false);
  });
});
