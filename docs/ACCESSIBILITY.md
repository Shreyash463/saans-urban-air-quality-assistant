# Accessibility Conformance & Verification — Saans

Saans is designed and verified to meet **WCAG 2.2 Level AA** across both English (`en`) and Hindi (`hi`) locales, Light and Dark themes, desktop and mobile viewports (`320 px` to `1280+ px`), Windows High Contrast (`forced-colors`), increased contrast (`prefers-contrast: more`), and reduced-motion preferences (`prefers-reduced-motion` + explicit toggle).

---

## Key WCAG 2.2 AA Controls Implemented

1. **Keyboard & Focus Management**
   - **Skip link** (`#main-content`) as the first focusable control in [Header.tsx](../frontend/src/components/Header.tsx).
   - **Focus Not Obscured (`2.4.11`)**: Global `scroll-padding-top: calc(var(--header-h) + 16px)` on `html` and `scroll-margin-top` on `.saans-section-anchor` in [src/index.css](../frontend/src/index.css) prevent the sticky `h-16` header from covering focused elements or anchor targets.
   - **Visible Focus Indicators (`2.4.7`, `2.4.13`)**: High-contrast `2px solid` `:focus-visible` outlines (`#0d9488` Light, `#2dd4bf` Dark; never stripped via `outline: none` on inputs or buttons), upgraded to `3px solid` under `prefers-contrast: more` and `3px solid Highlight` under `forced-colors: active`.
   - **Validation Error Focus**: Submitting an invalid city returns focus directly to `#saans-city-input` with `aria-invalid="true"` and `aria-describedby="saans-city-error"` (`role="alert"`).
   - **Semantic Controls**: Native `<input type="range">` sliders include `aria-valuetext` with units (`"18 km / day"`, `"200 households"`), radio groups use `<fieldset>` + `<legend>` + `RadioCard`, binary options use `role="switch"` with `aria-checked`, and dialogs/popovers (`DemoReadingInfo`) dismiss cleanly on `Escape`.

2. **Color Contrast, Non-Color Meaning & High Contrast Modes**
   - Light and Dark surface tokens meet `>= 4.5:1` normal text and `>= 3:1` UI component contrast.
   - CPCB AQI severity bands pair color with distinct geometric icons ([AqiCategoryIcon.tsx](../frontend/src/components/AqiCategoryIcon.tsx)) and explicit category labels ([AqiCategoryBadge.tsx](../frontend/src/components/AqiCategoryBadge.tsx)).
   - `@media (forced-colors: active)` and `@media (prefers-contrast: more)` rules ensure borders, switches, sliders, and focus outlines remain crisp in OS High Contrast modes.

3. **Reflow (`320 px`), Text Spacing & Target Sizes (`2.5.8`)**
   - Zero horizontal overflow verified down to **320 CSS px** (`scrollWidth <= innerWidth + 1`) even with WCAG `1.4.12` text-spacing overrides (`line-height: 1.5`, `letter-spacing: 0.12em`, `word-spacing: 0.16em`).
   - All standalone interactive buttons, switches, radio cards, navigation links, and range slider inputs maintain `>= 24x24` CSS px hit targets (most primary controls are `44–60 px`).

4. **Language, Titles, Live Regions & Reduced Motion**
   - Switching `EN` <-> `हिन्दी` updates `<html lang="en|hi">`, lazy-loads localized UI copy + Devanagari font subsets, and dynamically updates `document.title`.
   - Live regions (`role="status"` `aria-live="polite"` and `role="alert"`) announce AQI loading, plan readiness, errors, clipboard copy/download confirmations, chat replies, and simulator metrics without interrupting screen reader flow.
   - Both OS `prefers-reduced-motion: reduce` and the persistent header/footer Reduce Motion toggle disable reveal transforms, canvas motion, shimmer, and smooth scrolling.

---

## Automated Accessibility Verification

- **Unit Component `axe-core` Suite** (`frontend/src/__tests__/dashboardAndA11y.test.tsx`): Runs `axe.run` against Hero, ProfileForm, Dashboard, Simulator, Chat, and Footer.
- **Playwright Full-Page `axe-core` E2E Suite** (`frontend/tests/e2e/saans.spec.ts`): Audits full live-DOM journeys with tags `['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']` across:
  - Light mode, Dark mode, Hindi (`lang="hi"`), and Reduce Motion
  - Hero, validation errors, loading skeleton stages, plan dashboard + Community + Exports, error + retry recovery, Simulator, Chat, and Footer
  - Viewports `320px`, `390px`, `768px`, and `1280px` + WCAG `1.4.12` text-spacing override + `>= 24x24` px target-size check.
- **Target**: `0` `axe-core` violations across every state and viewport.
