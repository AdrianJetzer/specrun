import { defineConfig } from '@playwright/test';

// Prüfer-Suite. Läuft gegen eine bereits gestartete App (make level1) im Ordner TARGET_DIR.
// Seriell, weil die Tests nacheinander verschiedene results.json in den Build legen.
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 20_000,
  reporter: [['list'], ['json', { outputFile: process.env.JUDGE_PW_JSON ?? '.out/judge-playwright.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:8080',
    timezoneId: 'Europe/Zurich',
    locale: 'de-CH',
  },
});
