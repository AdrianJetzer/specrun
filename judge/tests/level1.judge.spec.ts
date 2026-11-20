import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore – reines ESM-Modul ohne Typen
import { TITLES, mixedState, allPassedState, invalidVariants } from '../lib/fixtures.mjs';

const TARGET = process.env.TARGET_DIR;
if (!TARGET) throw new Error('TARGET_DIR fehlt');
const RESULTS = path.join(TARGET, 'frontend/dist/results.json');
const SHOTS = process.env.JUDGE_SHOTS ?? '.out/screenshots';

// Ursprüngliche Datei sichern und nach allen Tests wiederherstellen.
let original: string | null = null;
test.beforeAll(() => {
  original = fs.existsSync(RESULTS) ? fs.readFileSync(RESULTS, 'utf8') : null;
});
test.afterAll(() => {
  if (original !== null) fs.writeFileSync(RESULTS, original);
});

function serve(content: string | null) {
  if (content === null) fs.rmSync(RESULTS, { force: true });
  else fs.writeFileSync(RESULTS, content);
}

async function open(page: Page, errors?: string[]) {
  if (errors) {
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
  }
  await page.goto('/');
  await expect(page.getByTestId('board')).not.toHaveAttribute('data-state', 'loading');
}

const card = (page: Page, n: number) => page.locator(`[data-testid="level-card"][data-level="${n}"]`);

test.describe('K2 Darstellung gültiger Daten', () => {
  test('K2.1 gemischte Status: Karten, Abzeichen, Fakten', async ({ page }) => {
    serve(JSON.stringify(mixedState()));
    await open(page);
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('notice')).toHaveCount(0);
    await expect(page.getByTestId('level-card')).toHaveCount(10);

    const expected: Array<[number, string, string, string, string, string]> = [
      [1, 'bestanden', 'Bestanden', '21.11.2026, 10:14', '850 ms', '5/5'],
      [2, 'bestanden', 'Bestanden', '21.11.2026, 10:14', '12,4 s', '2/2'],
      [3, 'fehlgeschlagen', 'Fehlgeschlagen', '21.11.2026, 10:14', '3,0 s', '1/3'],
      [4, 'gesperrt', 'Gesperrt', '–', '–', '–'],
      [10, 'gesperrt', 'Gesperrt', '–', '–', '–'],
    ];
    for (const [n, status, label, at, dur, checks] of expected) {
      const c = card(page, n);
      await expect(c).toHaveAttribute('data-status', status);
      await expect(c.getByTestId('level-status')).toHaveText(label);
      await expect(c.getByTestId('level-checked-at')).toHaveText(at);
      await expect(c.getByTestId('level-duration')).toHaveText(dur);
      await expect(c.getByTestId('level-checks')).toHaveText(checks);
    }
  });

  test('K2.2 feste Titel und Nummern L01–L10', async ({ page }) => {
    const d = mixedState();
    d.levels[0].title = 'Falscher Titel aus der Datei';
    serve(JSON.stringify(d));
    await open(page);
    for (let n = 1; n <= 10; n++) {
      await expect(card(page, n).getByTestId('level-title')).toHaveText(TITLES[n - 1]);
      await expect(card(page, n)).toContainText(`L${String(n).padStart(2, '0')}`);
    }
  });

  test('K2.3 Kopfzeile und Zusammenfassung', async ({ page }) => {
    serve(JSON.stringify(mixedState()));
    await open(page);
    await expect(page.getByTestId('run-id')).toHaveText('judge-run-42');
    await expect(page.getByTestId('run-version')).toHaveText('9.8.7');
    await expect(page.getByTestId('summary-reached')).toHaveText('2 / 10');
    await expect(page.getByTestId('summary-updated')).toHaveText('21.11.2026, 10:14');
    await expect(page.getByTestId('summary-progress')).toHaveAttribute('aria-label', '2 von 10 Levels erreicht');
    await expect(page.getByTestId('summary-progress').locator(':scope > *')).toHaveCount(10);
  });

  test('K2.4 alle bestanden → 10 / 10', async ({ page }) => {
    serve(JSON.stringify(allPassedState()));
    await open(page);
    await expect(page.getByTestId('summary-reached')).toHaveText('10 / 10');
    await expect(page.locator('[data-testid="level-card"][data-status="bestanden"]')).toHaveCount(10);
  });

  test('K2.5 Statusfarben laut Design-Tokens', async ({ page }) => {
    serve(JSON.stringify(mixedState()));
    await open(page);
    const color = (n: number) => card(page, n).getByTestId('level-status').evaluate((el) => getComputedStyle(el).color);
    expect(await color(1)).toBe('rgb(47, 191, 113)'); // #2fbf71
    expect(await color(3)).toBe('rgb(240, 82, 79)'); // #f0524f
    expect(await color(4)).toBe('rgb(95, 102, 112)'); // #5f6670
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(11, 13, 16)'); // #0b0d10
  });
});

test.describe('K3 fehlende und ungültige Daten', () => {
  test('K3.1 Datei fehlt → Hinweis „missing“ und Leerzustand', async ({ page }) => {
    serve(null);
    await open(page);
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'missing');
    await expect(page.getByTestId('notice')).toHaveAttribute('data-kind', 'missing');
    await expect(page.getByTestId('notice')).toContainText('Keine Ergebnisse gefunden. Die Datei results.json fehlt.');
    await expect(page.locator('[data-testid="level-card"][data-status="offen"]')).toHaveCount(10);
    await expect(page.getByTestId('summary-reached')).toHaveText('0 / 10');
    await expect(page.getByTestId('run-id')).toHaveText('–');
  });

  for (const [name, content] of Object.entries(invalidVariants() as Record<string, string>)) {
    test(`K3.2 ungültig (${name}) → Hinweis „invalid“`, async ({ page }) => {
      serve(content);
      await open(page);
      await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'invalid');
      await expect(page.getByTestId('notice')).toHaveAttribute('data-kind', 'invalid');
      await expect(page.getByTestId('notice')).toContainText('Die Ergebnisdatei ist ungültig. Es werden keine Ergebnisse angezeigt.');
      await expect(page.locator('[data-testid="level-card"][data-status="offen"]')).toHaveCount(10);
    });
  }
});

test.describe('K4 testids, Konsole, Layout', () => {
  test('K4.1 alle data-testids vorhanden', async ({ page }) => {
    serve(JSON.stringify(mixedState()));
    await open(page);
    for (const id of ['board', 'run-id', 'run-version', 'summary-reached', 'summary-progress', 'summary-updated']) {
      await expect(page.getByTestId(id), id).toHaveCount(1);
    }
    for (const id of ['level-title', 'level-status', 'level-checked-at', 'level-duration', 'level-checks']) {
      await expect(page.getByTestId(id), id).toHaveCount(10);
    }
    serve('{kaputt');
    await open(page);
    await expect(page.getByTestId('notice')).toHaveCount(1);
  });

  test('K4.2 keine Konsolenfehler (gültig, fehlend, ungültig)', async ({ page }) => {
    const errors: string[] = [];
    for (const content of [JSON.stringify(mixedState()), '{kaputt']) {
      serve(content);
      await open(page, errors);
    }
    expect(errors).toEqual([]);
  });

  test('K4.3 Raster: 5 / 2 / 1 Spalten, kein horizontales Scrollen', async ({ page }) => {
    serve(JSON.stringify(mixedState()));
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const [w, h, cols, name] of [[1440, 900, 5, 'desktop'], [900, 1000, 2, 'tablet'], [375, 812, 1, 'mobil']] as const) {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      const xs = await page.getByTestId('level-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
      expect(new Set(xs).size, `${name}: Spalten`).toBe(cols);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name}: Breite`).toBeLessThanOrEqual(w);
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
    }
  });
});
