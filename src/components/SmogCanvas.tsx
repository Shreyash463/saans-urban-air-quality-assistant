import { useEffect, useRef, useState } from 'react';
import { SMOG_MAX_DPR } from '../lib/motion';
import {
  checkAdaptivePerformance,
  createSmogParticles,
  drawSmogFrame,
  type FrameBudgetTracker,
  type SmogParticle,
  type SmogPointerState,
} from '../lib/smogEngine';

interface SmogCanvasProps {
  reducedMotion: boolean;
  isDark: boolean;
}

function attachSmogListeners(
  canvas: HTMLCanvasElement,
  pointer: SmogPointerState,
  onResize: () => void,
  onVisChange: (hidden: boolean) => void,
  onIntersect: (visible: boolean) => void
): () => void {
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active =
      pointer.x >= 0 &&
      pointer.x <= rect.width &&
      pointer.y >= 0 &&
      pointer.y <= rect.height;
  };
  const onLeave = () => {
    pointer.active = false;
  };
  const onVis = () => onVisChange(document.hidden);
  const obs =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => onIntersect(Boolean(entries[0]?.isIntersecting)),
          { threshold: 0.01 }
        )
      : null;

  obs?.observe(canvas);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', onVis);
  return () => {
    obs?.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVis);
  };
}

function resizeSmogCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): { width: number; height: number; particles: SmogParticle[] } {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, SMOG_MAX_DPR);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height, particles: createSmogParticles(width, height) };
}

class SmogRunner {
  pointer: SmogPointerState = { x: -9999, y: -9999, active: false };
  private state: { width: number; height: number; particles: SmogParticle[] };
  private rafId = 0;
  private visible = true;
  private tabActive = !document.hidden;
  private tracker: FrameBudgetTracker = { lastTs: 0, sum: 0, count: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private isDarkRef: { current: boolean },
    private onDisable: () => void
  ) {
    this.state = resizeSmogCanvas(canvas, ctx);
  }

  private render = (now: number) => {
    if (!this.visible || !this.tabActive) {
      this.rafId = 0;
      this.tracker.lastTs = 0;
      return;
    }
    if (!checkAdaptivePerformance(this.tracker, now)) {
      this.rafId = 0;
      this.onDisable();
      return;
    }
    drawSmogFrame(
      this.ctx,
      this.state.particles,
      this.pointer,
      this.state.width,
      this.state.height,
      this.isDarkRef.current
    );
    this.rafId = window.requestAnimationFrame(this.render);
  };

  sync = () => {
    const active = this.visible && this.tabActive;
    if (active && !this.rafId) {
      this.tracker.lastTs = 0;
      this.rafId = window.requestAnimationFrame(this.render);
    } else if (!active && this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  };

  resize = () => {
    this.state = resizeSmogCanvas(this.canvas, this.ctx);
  };
  setTab = (hidden: boolean) => {
    this.tabActive = !hidden;
    this.sync();
  };
  setVisible = (v: boolean) => {
    this.visible = v;
    this.sync();
  };
  stop = () => {
    if (this.rafId) window.cancelAnimationFrame(this.rafId);
  };
}

export default function SmogCanvas({ reducedMotion, isDark }: SmogCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDarkRef = useRef(isDark);
  const [disabledForPerf, setDisabledForPerf] = useState(false);

  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    if (reducedMotion || disabledForPerf || typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const runner = new SmogRunner(canvas, ctx, isDarkRef, () =>
      setDisabledForPerf(true)
    );
    const detach = attachSmogListeners(
      canvas,
      runner.pointer,
      runner.resize,
      runner.setTab,
      runner.setVisible
    );
    runner.sync();
    return () => {
      runner.stop();
      detach();
    };
  }, [reducedMotion, disabledForPerf]);

  if (reducedMotion || disabledForPerf) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="smog-canvas"
      className="pointer-events-none absolute inset-0 w-full h-full opacity-90"
    />
  );
}
