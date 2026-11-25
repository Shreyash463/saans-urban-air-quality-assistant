/**
 * Central motion constants for Saans.
 * Keeping durations, easings, stagger intervals, and performance caps in one
 * file avoids magic numbers and guarantees consistent choreography.
 */

export const HEADER_SCROLL_OFFSET_PX = 80;

/** Section reveal choreography */
export const REVEAL_DURATION_MS = 450;
export const REVEAL_STAGGER_STEP_MS = 45;
export const REVEAL_MAX_STAGGER_ITEMS = 6;
export const REVEAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const REVEAL_ROOT_MARGIN = '0px 0px -4% 0px';

/** Hero entrance stagger */
export const HERO_WORD_STAGGER_MS = 50;
export const GAUGE_COUNTUP_DURATION_MS = 650;
export const SIMULATOR_COUNTUP_DURATION_MS = 380;

/** Background SmogCanvas particle budgets & adaptive lag guard */
export const SMOG_PARTICLE_COUNT_DESKTOP = 20;
export const SMOG_PARTICLE_COUNT_MOBILE = 10;
export const SMOG_MOBILE_BREAKPOINT_PX = 768;
export const SMOG_MAX_DPR = 1.25;
export const SMOG_POINTER_REPEL_RADIUS_PX = 100;
export const SMOG_ADAPTIVE_WINDOW_FRAMES = 60;
export const SMOG_MAX_AVG_FRAME_MS = 24;

/** UI loading / typing feedback delays (skipped when reduced motion is active) */
export const PLAN_SKELETON_DELAY_MS = 250;
export const CHAT_TYPING_MIN_MS = 280;
export const CHAT_TYPING_RANGE_MS = 140;

/** LocalStorage key for user's explicit Reduce Motion preference */
export const REDUCE_MOTION_STORAGE_KEY = 'saans_reduce_motion_v1';
