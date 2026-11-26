import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function runAxeAudit(page: Page) {
  await page.waitForTimeout(350);
  await page.evaluate(async () => {
    const finiteAnims = document
      .getAnimations()
      .filter((anim) => anim.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finiteAnims.map((anim) => anim.finished.catch(() => undefined)));
  });
  await page.evaluate(axeSource);
  const results = await page.evaluate(async () => {
    const w = window as unknown as {
      axe: {
        run: (
          doc: Document,
          opts: Record<string, unknown>
        ) => Promise<{ violations: Array<{ id: string; impact: string }> }>;
      };
    };
    return w.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    });
  });
  expect(results.violations).toEqual([]);
}

test.describe('Saans end-to-end user workflows and accessibility', () => {
  test('full journey: Hero -> Plan (stubbed AI) -> Community & Simulator -> Chat -> Export -> EN/HI & Theme & Reduce Motion & Axe', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Deterministic fast stub for Open-Meteo /api/air-quality + Gemini /api/plan in E2E
    await page.route('**/api/air-quality**', async (route) => {
      const isCoords = route.request().method() === 'POST';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: isCoords ? 'Your location (approx.)' : 'Delhi',
          aqi: 342,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-25T15:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
        }),
      });
    });

    await page.route('**/api/plan**', async (route) => {
      const body = route.request().postDataJSON() as { language?: string };
      const isHi = body?.language === 'hi';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          aqi: {
            city: 'Delhi',
            aqi: 342,
            dominantPollutant: 'PM2.5',
            updatedAt: '2026-11-25T15:00:00+05:30',
            source: 'live',
            sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
          },
          summary: isHi
            ? 'दिल्ली में सर्दियों के स्मॉग के लिए यह आपकी व्यक्तिगत योजना है।'
            : 'Personalized Delhi clean-air plan avoiding 6–10 AM/PM winter inversion.',
          healthAdvisory: isHi
            ? 'बहुत खराब हवा है; बच्चों को अंदर रखें। यह चिकित्सीय सलाह नहीं है।'
            : 'Air quality is Very Poor (AQI 342). Keep children indoors. This guidance is not medical advice.',
          routine: [
            {
              timeSlot: 'morning',
              title: isHi ? 'सुबह AC रीसर्कुलेट' : 'Set car AC to recirculate',
              detail: 'Keep home windows shut 6–10 AM.',
              impactNote: 'Blocks morning exhaust spikes.',
            },
            {
              timeSlot: 'midday',
              title: isHi ? 'दोपहर वेंटिलेशन' : 'Ventilate 1–4 PM',
              detail: 'Open opposite windows 20 min.',
              impactNote: 'Flushes trapped indoor CO2.',
            },
            {
              timeSlot: 'evening',
              title: isHi ? 'शाम सीलिंग' : 'Seal by 5:30 PM',
              detail: 'Run kitchen exhaust fan.',
              impactNote: 'Prevents evening smoke.',
            },
            {
              timeSlot: 'night',
              title: isHi ? 'स्लीप ज़ोन' : 'Sealed bedroom sleep zone',
              detail: 'Run DIY HEPA filter overnight.',
              impactNote: 'Lowers 24h inhaled dose.',
            },
          ],
          indoorHacks: [
            {
              title: 'Wet mopping',
              howTo: 'Use damp cloth once daily.',
              estimatedBenefit: '25% less resuspended dust',
              costLevel: 'free',
            },
          ],
          alternatives: [
            {
              current: 'Solo car commute',
              swap: 'Metro 3 days/week',
              why: 'Cuts roadside tailpipe NO2.',
              pm25ReductionPct: 14,
              co2SavedKgPerMonth: 62,
            },
          ],
          communityActions: [
            {
              title: isHi
                ? 'RWA में अलाव की जगह इलेक्ट्रिक हीटर'
                : 'Replace guard bonfires with shared RWA electric heaters',
              who: 'rwa',
              howTo: 'Provide low-watt electric cabin heaters.',
              estimatedImpact: 'Cuts lane smoke ~16%',
              effort: 'low',
            },
          ],
          maskGuidance:
            'Wear a snugly fitted N95 respirator outdoors. Not medical advice.',
          disclaimer: 'Not medical advice.',
          generatedBy: 'gemini',
        }),
      });
    });

    await page.goto('/');

    // 1. Hero loads cleanly in Light mode & passes axe
    await expect(page.locator('h1#hero-heading')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Get my clean-air plan' })
    ).toBeVisible();
    await runAxeAudit(page);

    // 2. Submit profile -> verify Gemini badge + Community Effort section
    await page.getByRole('button', { name: 'Build my clean-air plan' }).click();
    await expect(page.getByTestId('plan-generator-badge')).toHaveText(
      'Generated by Gemini'
    );
    await expect(page.getByText('Make it a community effort')).toBeVisible();
    await expect(
      page.getByText('Replace guard bonfires with shared RWA electric heaters')
    ).toBeVisible();

    // 3. Test Download (.txt) and Copy buttons
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined },
      });
    });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plan (.txt)' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('saans-plan-');

    await page.getByRole('button', { name: 'Copy plan' }).click();
    await expect(page.getByText('Clean-air plan copied to clipboard.')).toBeVisible();

    // 4. Test Impact Simulator + community multiplier slider
    await page.locator('#sim-switch-commute_transit').click();
    const slider = page.getByRole('slider', { name: /Participating households/i });
    const co2Initial = await page.getByTestId('community-co2-value').textContent();
    await slider.fill('200');
    await expect(page.getByTestId('community-co2-value')).not.toHaveText(
      co2Initial ?? ''
    );

    // 5. Ask Saans real backend /api/chat route
    await page
      .getByLabel('Ask a follow-up question')
      .fill('Do air plants really work?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText(/PM2\.5/i).last()).toBeVisible();

    // 6. Toggle Dark theme + audit Dark mode contrast with axe
    await page.getByRole('button', { name: /Switch to (dark|light) theme/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await runAxeAudit(page);

    // 7. Toggle Reduce Motion
    await page
      .getByRole('button', { name: /Reduce motion/i })
      .first()
      .click();
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);

    // 8. Switch EN -> HI & audit Hindi UI with axe
    await page.getByRole('button', { name: /Switch language to Hindi/i }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await expect(page).toHaveTitle(/सांस/);
    await expect(page.getByText('इसे सामुदायिक पहल बनाएं')).toBeVisible();
    await runAxeAudit(page);

    expect(consoleErrors).toEqual([]);
  });

  test('keyboard navigation and opt-in geolocation ("Your location (approx.)") without persistence', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 28.6139, longitude: 77.209 },
    });
    const page = await context.newPage();

    await page.route('**/api/air-quality**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Your location (approx.)',
          aqi: 295,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-25T15:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
        }),
      });
    });

    await page.goto('/');

    // Focus city input and operate Use my location via keyboard
    const locBtn = page.getByRole('button', { name: 'Use my location' });
    await locBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Your location \(approx\.\)/i).first()).toBeVisible();

    // Verify coordinates are NEVER written to localStorage
    const prefs = await page.evaluate(
      () => window.localStorage.getItem('saans_user_prefs_v1') ?? ''
    );
    expect(prefs).not.toContain('28.61');
    expect(prefs).not.toContain('77.20');

    // Keyboard tab into submit button and trigger plan build
    const submitBtn = page.getByRole('button', { name: 'Build my clean-air plan' });
    await submitBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('plan-generator-badge')).toHaveText(
      'Rule-based fallback'
    );

    await context.close();
  });

  test('print stylesheet fits plan in <= 5 A4 pages and header never overlaps in EN/HI at 1280, 768, 390', async ({
    page,
  }) => {
    await page.route('**/api/air-quality**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Delhi',
          aqi: 342,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T11:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
        }),
      });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Build my clean-air plan' }).click();
    await expect(page.getByTestId('plan-generator-badge')).toBeVisible();

    // Verify compact A4 print PDF output is <= 5 pages
    await page.emulateMedia({ media: 'print' });
    const pdfBuf = await page.pdf({ format: 'A4', printBackground: false });
    const pageCount = (pdfBuf.toString('latin1').match(/\/Type\s*\/Page\b/g) || [])
      .length;
    expect(pageCount).toBeGreaterThanOrEqual(1);
    expect(pageCount).toBeLessThanOrEqual(5);
    await page.emulateMedia({ media: 'screen' });

    const assertHeaderClean = async () => {
      const check = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        const header = document.querySelector('header');
        if (!header) return { overflow, overlaps: ['missing-header'] };
        const items = Array.from(
          header.querySelectorAll<HTMLElement>('a, button')
        ).filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
        });
        const overlaps: string[] = [];
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i].getBoundingClientRect();
            const b = items[j].getBoundingClientRect();
            const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (overlapX > 1 && overlapY > 1) {
              overlaps.push(
                `${items[i].textContent?.trim()} <-> ${items[j].textContent?.trim()}`
              );
            }
          }
        }
        return { overflow, overlaps };
      });
      expect(check.overflow).toBe(false);
      expect(check.overlaps).toEqual([]);
    };

    for (const langSwitch of ['en', 'hi'] as const) {
      if (langSwitch === 'hi') {
        await page.getByRole('button', { name: /Switch language to Hindi/i }).click();
        await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
      }
      for (const width of [1280, 768, 390]) {
        await page.setViewportSize({ width, height: 800 });
        await assertHeaderClean();
      }
    }
  });

  test('geolocation -> city chip clears coords -> profile edits -> server plan with null optionals', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      geolocation: { latitude: 18.5204, longitude: 73.8567 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage();

    let lastPlanUrl = '';
    let lastPlanBody: Record<string, unknown> | null = null;
    await page.route('**/api/air-quality**', async (route) => {
      const isCoords = route.request().method() === 'POST';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: isCoords ? 'Your location (approx.)' : 'Pune',
          aqi: isCoords ? 77 : 83,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T11:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
        }),
      });
    });

    await page.route('**/api/plan**', async (route) => {
      lastPlanUrl = route.request().url();
      lastPlanBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          aqi: {
            city: 'Pune',
            aqi: 83,
            dominantPollutant: 'PM2.5',
            updatedAt: '2026-11-26T11:00:00+05:30',
            source: 'live',
            sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
          },
          summary: 'Pune shows live CPCB AQI 83 (Satisfactory).',
          healthAdvisory: 'Satisfactory air quality in Pune. Not medical advice.',
          routine: [
            {
              timeSlot: 'morning',
              title: 'Morning commute',
              detail: 'Use metro.',
              impactNote: 'Cuts exhaust.',
            },
            {
              timeSlot: 'midday',
              title: 'Midday air',
              detail: 'Ventilate 1-4 PM.',
              impactNote: 'Refreshes air.',
            },
            {
              timeSlot: 'evening',
              title: 'Evening seal',
              detail: 'Close windows.',
              impactNote: 'Blocks smoke.',
            },
            {
              timeSlot: 'night',
              title: 'Night sleep',
              detail: 'Keep room clean.',
              impactNote: 'Better sleep.',
            },
          ],
          indoorHacks: [
            {
              title: 'Wet mop',
              howTo: 'Damp mop daily.',
              estimatedBenefit: 'Less dust',
              costLevel: 'free',
            },
          ],
          alternatives: [
            {
              current: 'Solo car',
              swap: 'Metro / Bus',
              why: 'Lower emissions',
              pm25ReductionPct: 22,
              co2SavedKgPerMonth: 45,
            },
          ],
          communityActions: null,
          maskGuidance: 'Mask optional at AQI 83.',
          disclaimer: 'Not medical advice.',
          generatedBy: 'gemini',
          fallbackReason: null,
          retryAfterSeconds: null,
        }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /Use my location/i })).toBeVisible();
    await page.getByRole('button', { name: /Use my location/i }).click();
    await expect(page.getByText(/Your location \(approx\.\)/i).first()).toBeVisible();

    await page.getByRole('button', { name: 'Pune', exact: true }).click();
    await expect(page.getByText(/Pune/).first()).toBeVisible();

    await page.getByRole('switch', { name: /Children at home/i }).click();
    await page.getByRole('switch', { name: /Older adults/i }).click();
    await page.getByText('Metro / Bus', { exact: true }).click();
    await page.locator('#saans-commute-km').fill('34');
    await page.getByText('Induction / Electric', { exact: true }).click();
    await page.getByText('Low (prioritize free & DIY)', { exact: true }).click();
    await page.getByText('Medium (balanced)', { exact: true }).click();

    await page.getByRole('button', { name: /Build my clean-air plan/i }).click();
    await expect(page.getByTestId('plan-generator-badge')).toHaveText(
      'Generated by Gemini'
    );
    expect(lastPlanUrl).not.toContain('lat=');
    expect(lastPlanBody?.coords).toBeUndefined();
    await expect(page.locator('#dashboard')).not.toContainText('sample demo');
    await expect(page.locator('#dashboard')).toContainText('83');

    await context.close();
  });

  test('forced /api/plan failure shows honest error state (no sample plan) and Try again recovery', async ({
    page,
  }) => {
    let failPlan = true;
    await page.route('**/api/air-quality**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Pune',
          aqi: 83,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T11:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
        }),
      });
    });

    await page.route('**/api/plan**', async (route) => {
      if (failPlan) {
        await route.fulfill({ status: 503, body: 'Service Unavailable' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          aqi: {
            city: 'Pune',
            aqi: 83,
            dominantPollutant: 'PM2.5',
            updatedAt: '2026-11-26T11:00:00+05:30',
            source: 'live',
          },
          summary: 'Live Pune plan recovered.',
          healthAdvisory: 'Satisfactory air quality. Not medical advice.',
          routine: [
            {
              timeSlot: 'morning',
              title: 'Morning',
              detail: 'Commute smart.',
              impactNote: 'Lowers PM2.5.',
            },
            {
              timeSlot: 'midday',
              title: 'Midday',
              detail: 'Ventilate briefly.',
              impactNote: 'Refreshes air.',
            },
            {
              timeSlot: 'evening',
              title: 'Evening',
              detail: 'Cook with exhaust.',
              impactNote: 'Traps fumes.',
            },
            {
              timeSlot: 'night',
              title: 'Night',
              detail: 'Rest indoors.',
              impactNote: 'Clean sleep.',
            },
          ],
          indoorHacks: [
            {
              title: 'Wet mop',
              howTo: 'Damp mop.',
              estimatedBenefit: 'Less dust',
              costLevel: 'free',
            },
          ],
          alternatives: [
            {
              current: 'Car',
              swap: 'Metro',
              why: 'Cleaner',
              pm25ReductionPct: 20,
              co2SavedKgPerMonth: 40,
            },
          ],
          maskGuidance: 'Optional.',
          disclaimer: 'Not medical advice.',
          generatedBy: 'gemini',
        }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Pune', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pune', exact: true }).click();
    await page.getByRole('button', { name: /Build my clean-air plan/i }).click();

    await expect(page.getByTestId('plan-error-state')).toBeVisible();
    await expect(page.getByTestId('plan-error-state')).toContainText(
      'Unable to reach the Saans server'
    );
    await expect(page.getByTestId('plan-error-state')).toContainText(
      'No sample data is shown'
    );
    await expect(page.getByTestId('plan-generator-badge')).toHaveCount(0);

    failPlan = false;
    await page
      .getByTestId('plan-error-state')
      .getByRole('button', { name: 'Try again' })
      .click();
    await expect(page.getByTestId('plan-generator-badge')).toHaveText(
      'Generated by Gemini'
    );
    await expect(page.getByTestId('plan-error-state')).toHaveCount(0);
  });

  test('Hindi full journey with validation, rate-limit 429 retry recovery, and persistence', async ({
    page,
  }) => {
    let hit429Once = true;
    await page.route('**/api/air-quality**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Delhi',
          aqi: 342,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T15:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
        }),
      });
    });

    await page.route('**/api/plan**', async (route) => {
      if (hit429Once) {
        hit429Once = false;
        await route.fulfill({
          status: 429,
          headers: { 'Retry-After': '5' },
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Rate limit exceeded.' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          aqi: {
            city: 'Delhi',
            aqi: 342,
            dominantPollutant: 'PM2.5',
            updatedAt: '2026-11-26T15:00:00+05:30',
            source: 'live',
          },
          summary: 'दिल्ली के लिए आपकी व्यक्तिगत स्वच्छ वायु योजना।',
          healthAdvisory: 'बहुत खराब वायु गुणवत्ता। यह चिकित्सीय सलाह नहीं है।',
          routine: [
            {
              timeSlot: 'morning',
              title: 'सुबह',
              detail: 'खिड़कियां बंद रखें।',
              impactNote: 'पीएम 2.5 रोकें',
            },
            {
              timeSlot: 'midday',
              title: 'दोपहर',
              detail: 'दोपहर वेंटिलेशन।',
              impactNote: 'हवा ताज़ा करें',
            },
            {
              timeSlot: 'evening',
              title: 'शाम',
              detail: 'एग्जॉस्ट चलाएं।',
              impactNote: 'धुआं निकालें',
            },
            {
              timeSlot: 'night',
              title: 'रात',
              detail: 'अंदर रहें।',
              impactNote: 'सुरक्षित नींद',
            },
          ],
          indoorHacks: [
            {
              title: 'गीला पोंछा',
              howTo: 'रोज़ गीला पोंछा लगाएं।',
              estimatedBenefit: 'कम धूल',
              costLevel: 'free',
            },
          ],
          alternatives: [
            {
              current: 'कार',
              swap: 'मेट्रो उपयोग करें',
              why: 'कम उत्सर्जन',
              pm25ReductionPct: 24,
              co2SavedKgPerMonth: 45,
            },
          ],
          maskGuidance: 'बाहर जाने पर फिटेड N95 पहनें।',
          disclaimer: 'यह चिकित्सीय सलाह नहीं है।',
          generatedBy: 'gemini',
        }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'हिन्दी' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');

    await page.locator('#saans-city-input').fill('');
    await page.getByRole('button', { name: 'मेरी स्वच्छ-वायु योजना बनाएं' }).click();
    await expect(page.locator('#saans-city-error')).toBeVisible();

    await page.locator('#saans-city-input').fill('Delhi');
    await page.getByRole('button', { name: 'मेरी स्वच्छ-वायु योजना बनाएं' }).click();
    await expect(page.getByTestId('plan-error-state')).toBeVisible();

    await page
      .getByTestId('plan-error-state')
      .getByRole('button', { name: 'फिर से कोशिश करें' })
      .click();
    await expect(page.getByTestId('plan-generator-badge')).toBeVisible();
    await expect(page.locator('#dashboard')).toContainText(
      'दिल्ली के लिए आपकी व्यक्तिगत स्वच्छ वायु योजना'
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#saans-city-input')).toHaveValue('Delhi');
  });

  test('geolocation denied shows honest notice cleanly without crashing', async ({
    page,
  }) => {
    await page.route('**/api/air-quality**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Delhi',
          aqi: 342,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T15:00:00+05:30',
          source: 'live',
        }),
      });
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) => {
            err({ code: 1, message: 'Permission denied' } as GeolocationPositionError);
          },
        },
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Use my location/i }).click();
    await expect(page.locator('#profile')).toContainText(
      /Location permission declined/i
    );
  });

  test('WCAG 2.2 AA reflow (320/390/768/1280), text-spacing override, target sizes >=24px, and axe across form-error/loading/error states', async ({
    page,
  }) => {
    let planDelayMs = 0;
    let shouldFail = false;
    await page.route('**/api/air-quality**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: 'Delhi',
          aqi: 310,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T15:00:00+05:30',
          source: 'live',
        }),
      });
    });
    await page.route('**/api/plan**', async (route) => {
      if (planDelayMs > 0) await new Promise((r) => setTimeout(r, planDelayMs));
      if (shouldFail) {
        await route.fulfill({ status: 503, body: 'Service Unavailable' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          aqi: {
            city: 'Delhi',
            aqi: 310,
            dominantPollutant: 'PM2.5',
            updatedAt: '2026-11-26T15:00:00+05:30',
            source: 'live',
          },
          summary: 'Clean-air plan ready.',
          healthAdvisory: 'Very Poor air quality. Not medical advice.',
          routine: [
            {
              timeSlot: 'morning',
              title: 'M',
              detail: 'Shut windows.',
              impactNote: 'Blocks PM2.5.',
            },
            {
              timeSlot: 'midday',
              title: 'D',
              detail: 'Ventilate 15m.',
              impactNote: 'Refreshes air.',
            },
            {
              timeSlot: 'evening',
              title: 'E',
              detail: 'Cook w/ exhaust.',
              impactNote: 'Vents fumes.',
            },
            {
              timeSlot: 'night',
              title: 'N',
              detail: 'Wet mop.',
              impactNote: 'Lowers dust.',
            },
          ],
          indoorHacks: [
            {
              title: 'Mop',
              howTo: 'Damp mop.',
              estimatedBenefit: 'Less dust',
              costLevel: 'free',
            },
          ],
          alternatives: [
            {
              current: 'Car',
              swap: 'Metro',
              why: 'Less tailpipe',
              pm25ReductionPct: 20,
              co2SavedKgPerMonth: 45,
            },
          ],
          maskGuidance: 'Wear N95 outdoors.',
          disclaimer: 'Not medical advice.',
          generatedBy: 'gemini',
        }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Check form error state + axe
    await page.locator('#saans-city-input').fill('');
    await page.getByRole('button', { name: 'Build my clean-air plan' }).click();
    await expect(page.locator('#saans-city-error')).toBeVisible();
    await runAxeAudit(page);

    // Check loading + error state + axe
    await page.locator('#saans-city-input').fill('Delhi');
    planDelayMs = 450;
    shouldFail = true;
    await page.getByRole('button', { name: 'Build my clean-air plan' }).click();
    await expect(page.getByTestId('plan-loading-status')).toBeVisible();
    await expect(page.getByTestId('plan-error-state')).toBeVisible();
    await runAxeAudit(page);

    // Recover plan cleanly
    planDelayMs = 0;
    shouldFail = false;
    await page
      .getByTestId('plan-error-state')
      .getByRole('button', { name: 'Try again' })
      .click();
    await expect(page.getByTestId('plan-generator-badge')).toBeVisible();

    // Check zero horizontal overflow + target sizes >= 24px across viewports + WCAG 1.4.12 text spacing
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await runAxeAudit(page);
      const overflowPx = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflowPx).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>(
        'p, h1, h2, h3, h4, span, label, button, a, li'
      )) {
        el.style.setProperty('line-height', '1.5', 'important');
        el.style.setProperty('letter-spacing', '0.12em', 'important');
        el.style.setProperty('word-spacing', '0.16em', 'important');
      }
    });
    const textSpacingOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(textSpacingOverflow).toBeLessThanOrEqual(1);

    const smallControls = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll('button, input:not(.sr-only), a[href]:not(.sr-only)')
      );
      return els
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const st = window.getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.display !== 'inline';
        })
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 24 || r.height < 24;
        })
        .map((el) => el.outerHTML.slice(0, 80));
    });
    expect(smallControls).toEqual([]);
  });
});
