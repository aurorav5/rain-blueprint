import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('RAIN E2E Mastering Flow', () => {
  const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'
  const testEmail = `e2e_${Date.now()}@test.rain`
  const testPassword = 'testpass123'

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
  })

  test('register → login → upload → master (free tier WASM render)', async ({ page }) => {
    // Register
    await page.goto(`${BASE_URL}/register`)
    await page.fill('[data-testid=email-input]', testEmail)
    await page.fill('[data-testid=password-input]', testPassword)
    await page.click('[data-testid=register-submit]')
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })

    // Upload test WAV
    const fileInput = page.locator('[data-testid=file-upload]')
    await fileInput.setInputFiles(path.join(__dirname, '../../backend/tests/fixtures/test_48k_stereo.wav'))
    await expect(page.locator('[data-testid=upload-zone]')).toContainText(/test_48k_stereo/, { timeout: 5000 })

    // Start mastering
    await page.click('[data-testid=master-button]')

    // Free tier: WASM render completes locally
    await expect(page.locator('[data-testid=status-indicator]')).toHaveText(/complete/i, { timeout: 30000 })
  })

  test('free tier: download button shows upgrade CTA', async ({ page }) => {
    // Login as free user and complete a session
    await page.goto(`${BASE_URL}/login`)
    await page.fill('[data-testid=email-input]', testEmail)
    await page.fill('[data-testid=password-input]', testPassword)
    await page.click('[data-testid=login-submit]')
    await expect(page).toHaveURL(/\/$/)

    // Check download is locked with upgrade CTA
    await expect(page.locator('[data-testid=upgrade-cta]')).toBeVisible({ timeout: 5000 })
  })

  test('stems tab locked for free/spark tier', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await page.fill('[data-testid=email-input]', testEmail)
    await page.fill('[data-testid=password-input]', testPassword)
    await page.click('[data-testid=login-submit]')

    await page.goto(`${BASE_URL}/stems`)
    await expect(page.locator('[data-testid=tier-gate]')).toBeVisible({ timeout: 5000 })
  })
})
