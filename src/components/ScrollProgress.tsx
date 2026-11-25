/**
 * Thin top scroll-progress indicator driven via scoped compositor transform: scaleX(...).
 */
export function ScrollProgress() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="saans-scroll-progress-wrap fixed top-0 inset-x-0 z-50 h-[3px] pointer-events-none bg-transparent"
    >
      <div
        id="saans-scroll-progress-bar"
        className="saans-scroll-progress h-full w-full bg-gradient-to-r from-slate-400 via-teal-500 to-teal-300 dark:from-slate-500 dark:via-teal-400 dark:to-emerald-300"
      />
    </div>
  );
}
