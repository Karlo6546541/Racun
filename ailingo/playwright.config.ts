import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_SECRET = "e2e-secret";
export const WEBHOOK_SECRET = "whsec_e2e_test";
const TEST_DB = process.env.E2E_DATABASE_URL || "postgresql://ailingo:ailingo@localhost:5432/ailingo_test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { ...devices["Pixel 7"], baseURL: `http://localhost:${PORT}`, trace: "off", locale: "hr-HR" },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: TEST_DB,
      DIRECT_URL: TEST_DB,
      E2E: "1",
      E2E_TEST_SECRET: E2E_SECRET,
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      FREE_DAILY_MINUTES: "10",
      AUTH_URL: `http://localhost:${PORT}`,
      AUTH_TRUST_HOST: "true",
      AUTH_SECRET: process.env.AUTH_SECRET || "e2e-auth-secret-e2e-auth-secret-123",
      SESSION_HMAC_SECRET: "e2e-hmac-secret",
    },
  },
});
