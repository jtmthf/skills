# Playwright

E2E testing patterns, fixtures, assertions, and page object patterns for Playwright.

## Configuration

### `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html'],
    process.env.CI ? ['github'] : ['list'],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

## Writing Tests

### Basic structure

```typescript
import { test, expect } from '@playwright/test'

test('user can log in', async ({ page }) => {
  await page.goto('/login')

  await page.getByLabel('Email').fill('user@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
```

### Locator priority

Same philosophy as Testing Library — use accessible locators:

```typescript
// Best: role-based
page.getByRole('button', { name: 'Submit' })
page.getByRole('link', { name: 'Home' })
page.getByRole('textbox', { name: 'Email' })

// Good: label/text-based
page.getByLabel('Email address')
page.getByText('Welcome back')
page.getByPlaceholder('Search...')

// Acceptable: test ID
page.getByTestId('submit-button')

// Last resort: CSS/XPath selectors
page.locator('.submit-btn')
page.locator('#email-input')
```

### Assertions

```typescript
// Visibility
await expect(locator).toBeVisible()
await expect(locator).toBeHidden()

// Text content
await expect(locator).toHaveText('Welcome')
await expect(locator).toContainText('Welcome')

// Input values
await expect(locator).toHaveValue('hello')
await expect(locator).toBeChecked()
await expect(locator).toBeDisabled()
await expect(locator).toBeEnabled()
await expect(locator).toBeEditable()

// Count
await expect(locator).toHaveCount(3)

// Attributes
await expect(locator).toHaveAttribute('href', '/home')
await expect(locator).toHaveClass(/active/)

// Page
await expect(page).toHaveURL('/dashboard')
await expect(page).toHaveTitle('Dashboard')

// Screenshots
await expect(page).toHaveScreenshot('dashboard.png')
await expect(locator).toHaveScreenshot('button.png')
```

All assertions auto-retry until timeout (default 5s).

## Fixtures

### Custom fixtures

```typescript
import { test as base, expect } from '@playwright/test'

// Define fixture types
type Fixtures = {
  authenticatedPage: Page
  testUser: { email: string; password: string }
}

export const test = base.extend<Fixtures>({
  testUser: async ({}, use) => {
    // Create test user via API
    const user = { email: `test-${Date.now()}@example.com`, password: 'test123' }
    await fetch('http://localhost:3000/api/test/create-user', {
      method: 'POST',
      body: JSON.stringify(user),
    })
    await use(user)
    // Cleanup after test
    await fetch('http://localhost:3000/api/test/delete-user', {
      method: 'POST',
      body: JSON.stringify({ email: user.email }),
    })
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(testUser.email)
    await page.getByLabel('Password').fill(testUser.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('/dashboard')
    await use(page)
  },
})

export { expect }
```

### Using fixtures

```typescript
import { test, expect } from './fixtures'

test('authenticated user sees dashboard', async ({ authenticatedPage }) => {
  await expect(authenticatedPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
```

### Storage state (reuse auth across tests)

```typescript
// auth.setup.ts — runs once before all tests
import { test as setup, expect } from '@playwright/test'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/dashboard')
  await page.context().storageState({ path: '.auth/user.json' })
})
```

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
})
```

## Page Object Pattern + Fixtures

The strongest Playwright pattern combines page objects with fixtures. Page objects encapsulate locators and actions; fixtures provide them to tests with automatic setup/teardown. This avoids manual instantiation boilerplate in every test.

### Define page objects

```typescript
// pages/login.ts
import { type Page, type Locator } from '@playwright/test'

export class LoginPage {
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator

  constructor(private page: Page) {
    this.emailInput = page.getByLabel('Email')
    this.passwordInput = page.getByLabel('Password')
    this.submitButton = page.getByRole('button', { name: 'Sign in' })
    this.errorMessage = page.getByRole('alert')
  }

  async goto() {
    await this.page.goto('/login')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }
}

// pages/checkout.ts
export class CheckoutPage {
  constructor(private page: Page) {}

  readonly shippingName = this.page.getByLabel('Name')
  readonly shippingStreet = this.page.getByLabel('Street')
  readonly placeOrderButton = this.page.getByRole('button', { name: 'Place Order' })
  readonly confirmationHeading = this.page.getByRole('heading', { name: /order confirmed/i })

  async fillShipping(address: { name: string; street: string; city: string; state: string; zip: string }) {
    await this.shippingName.fill(address.name)
    await this.shippingStreet.fill(address.street)
    await this.page.getByLabel('City').fill(address.city)
    await this.page.getByLabel('State').fill(address.state)
    await this.page.getByLabel('Zip').fill(address.zip)
  }
}
```

### Wire page objects into fixtures

```typescript
// fixtures.ts
import { test as base, expect } from '@playwright/test'
import { LoginPage } from './pages/login'
import { CheckoutPage } from './pages/checkout'

type Fixtures = {
  loginPage: LoginPage
  checkoutPage: CheckoutPage
  authenticatedPage: Page
}

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page))
  },

  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page))
  },

  authenticatedPage: async ({ page, request }, use) => {
    // Auth via API, not UI
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password' }
    })
    const { token } = await response.json()
    await page.context().addCookies([{ name: 'session', value: token, url: 'http://localhost:3000' }])
    await use(page)
  },
})

export { expect }
```

### Use in tests — clean and focused

```typescript
// tests/login.spec.ts
import { test, expect } from '../fixtures'

test('successful login redirects to dashboard', async ({ loginPage, page }) => {
  await loginPage.goto()
  await loginPage.login('user@example.com', 'password123')
  await expect(page).toHaveURL('/dashboard')
})

test('shows error on invalid credentials', async ({ loginPage }) => {
  await loginPage.goto()
  await loginPage.login('user@example.com', 'wrong')
  await expect(loginPage.errorMessage).toContainText('Invalid credentials')
})

// tests/checkout.spec.ts
test('complete checkout flow', async ({ authenticatedPage, checkoutPage }) => {
  await authenticatedPage.goto('/checkout')
  await checkoutPage.fillShipping({ name: 'Alice', street: '123 Main', city: 'NYC', state: 'NY', zip: '10001' })
  await checkoutPage.placeOrderButton.click()
  await expect(checkoutPage.confirmationHeading).toBeVisible()
})
```

This pattern scales well — tests read like plain English while page objects handle the DOM details. Fixtures ensure consistent setup without manual `new PageObject(page)` in every test.

## API Testing (Test Setup)

Use API calls for fast test setup instead of clicking through UI:

```typescript
test('checkout flow', async ({ page, request }) => {
  // Fast setup via API
  await request.post('/api/test/seed', {
    data: {
      user: { email: 'test@example.com', cart: ['product-1', 'product-2'] },
    },
  })

  // Test only the checkout flow
  await page.goto('/checkout')
  await page.getByRole('button', { name: 'Confirm order' }).click()
  await expect(page.getByText('Order confirmed')).toBeVisible()
})
```

## Network Interception

```typescript
// Mock a specific API response
await page.route('/api/users', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 1, name: 'Alice' }]),
  })
})

// Modify a response
await page.route('/api/config', async (route) => {
  const response = await route.fetch()
  const json = await response.json()
  json.featureFlag = true
  await route.fulfill({ response, json })
})

// Abort requests (e.g., block analytics)
await page.route('**/analytics/**', (route) => route.abort())
```

## Tips

- Use `test.describe.serial()` for tests that must run in order (e.g., create → update → delete)
- Use `test.slow()` to triple the timeout for known slow tests
- Use `page.waitForResponse()` to wait for specific API calls to complete
- Use `trace: 'on-first-retry'` in CI for debugging failures — traces include screenshots, DOM snapshots, and network logs
- Keep E2E tests focused on critical business flows — don't replicate unit/integration test coverage
- Use `test.fixme()` to skip broken tests without removing them
- Playwright auto-waits for elements to be actionable before interactions — avoid explicit waits unless necessary
