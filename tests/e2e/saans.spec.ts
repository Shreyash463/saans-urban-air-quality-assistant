import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function runAxeAudit(page: Page) {
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
      rules: {
        region: { enabled: false },
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          city: route.request().url().includes('lat=')
            ? 'Your location (approx.)'
            : 'Delhi',
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
});
