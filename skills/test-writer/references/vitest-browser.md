# Vitest Browser Mode

Run component tests in a real browser instead of jsdom/happy-dom. This gives true browser rendering, real CSS, native events, and actual layout.

## When to Use

Vitest browser mode is the **preferred approach for testing React components**. It runs tests in a real browser, giving you true rendering, native events, and real CSS — eliminating an entire class of false positives from jsdom/happy-dom. The Locator API auto-retries assertions (like Playwright), making tests more reliable.

Use browser mode for:
- All React/Vue/Svelte component tests (preferred over jsdom + Testing Library)
- Components that rely on browser APIs (IntersectionObserver, ResizeObserver, Canvas, Web Animations)
- CSS-dependent behavior (media queries, computed styles, layout)
- Drag-and-drop, clipboard, or pointer events

Fall back to jsdom only when browser mode isn't configured in the project or for pure logic tests that don't render components.

## Setup

### Install

```bash
npm install -D @vitest/browser playwright
```

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      // Browser instance(s) to run tests in
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})
```

### Multiple browsers

```typescript
test: {
  browser: {
    enabled: true,
    provider: 'playwright',
    instances: [
      { browser: 'chromium' },
      { browser: 'firefox' },
      { browser: 'webkit' },
    ],
  },
}
```

### Workspace setup (mix jsdom and browser tests)

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'browser',
      include: ['src/**/*.browser.test.tsx'],
      browser: {
        enabled: true,
        provider: 'playwright',
        instances: [{ browser: 'chromium' }],
      },
    },
  },
])
```

## Writing Tests

### Component rendering

```typescript
import { render } from 'vitest-browser-react' // or vitest-browser-vue, vitest-browser-svelte
import { page } from 'vitest/browser'

test('renders and interacts', async () => {
  const { getByRole } = render(<Counter initialCount={0} />)

  await expect.element(getByRole('status')).toHaveTextContent('0')

  await getByRole('button', { name: /increment/i }).click()

  await expect.element(getByRole('status')).toHaveTextContent('1')
})
```

### Key differences from jsdom Testing Library

1. **Queries return `Locator` objects**, not DOM elements. Locators auto-wait and auto-retry.
2. **Interactions are async and use Locator methods**: `await locator.click()`, `await locator.fill('text')`.
3. **Assertions use `expect.element()`** which auto-retries until the assertion passes or times out.
4. **No `screen` import** — use the return value from `render()` or `page` context.
5. **`userEvent` is available for keyboard/clipboard operations** — import from `vitest/browser` for `keyboard()`, `tab()`, `type()`, `copy()`, `cut()`, `paste()`. Locator methods cover click, fill, clear, hover, select.

### Locator interactions

```typescript
const { getByRole, getByLabelText } = render(<Form />)

// Click
await getByRole('button', { name: /submit/i }).click()

// Type text
await getByLabelText(/email/i).fill('user@test.com')

// Clear and type
await getByLabelText(/name/i).clear()
await getByLabelText(/name/i).fill('Alice')

// Select
await getByRole('combobox', { name: /country/i }).selectOptions('US')

// Toggle checkbox
await getByRole('checkbox', { name: /agree/i }).click()

// Keyboard (import userEvent from 'vitest/browser')
import { userEvent } from 'vitest/browser'
await userEvent.keyboard('{Enter}')
await userEvent.tab()

// Hover
await getByRole('button').hover()
```

### Assertions

```typescript
const { getByRole, getByText, queryByText } = render(<Component />)

// Element exists and has content
await expect.element(getByRole('heading')).toHaveTextContent('Welcome')

// Element is visible
await expect.element(getByRole('dialog')).toBeVisible()

// Element is disabled
await expect.element(getByRole('button')).toBeDisabled()

// Element does not exist
await expect.element(queryByText('Error')).not.toBeInTheDocument()

// Wait for element to appear (locators auto-retry, but you can be explicit)
await expect.element(getByText('Loaded!')).toBeVisible()
```

### Page-level interactions

```typescript
import { page } from 'vitest/browser'

test('screenshot comparison', async () => {
  render(<Dashboard data={testData} />)
  await expect(page.screenshot()).toMatchImageSnapshot()
})
```

## MSW in Browser Mode

MSW works in browser mode using the browser integration (service worker):

```typescript
// src/test/browser-setup.ts
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

const worker = setupWorker(...handlers)
await worker.start({ onUnhandledRequest: 'error' })
```

Reference this in your vitest config:

```typescript
test: {
  browser: {
    enabled: true,
    provider: 'playwright',
    instances: [{ browser: 'chromium' }],
  },
  setupFiles: ['./src/test/browser-setup.ts'],
}
```

## Fake Timers in Browser Mode

Components with delays (tooltips, debounce, animations) need fake timers in browser mode just like in jsdom. Set up timers in `beforeEach`/`afterEach` or test context — not inline in each test.

```typescript
import { vi, beforeEach, afterEach } from 'vitest'
import { render } from 'vitest-browser-react'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('tooltip appears after hover delay', async () => {
  const { getByText, getByRole } = render(
    <Tooltip content="Help text" delay={200}>Hover me</Tooltip>
  )

  await getByText('Hover me').hover()

  // Run all pending timers to trigger the delay — don't hardcode 200ms
  await vi.runAllTimersAsync()

  await expect.element(getByRole('tooltip')).toBeVisible()
})
```

The same timer principles from the Vitest reference apply here: prefer `vi.runAllTimersAsync()` over `vi.advanceTimersByTime(hardcoded)` to avoid coupling to implementation timing.

## Assertion Patterns

Prefer `toBeVisible()` over `toBeInTheDocument()` for visible elements. For asserting absence, use the Locator `.query()` method which returns null when the element doesn't exist:

```typescript
// Asserting visibility (preferred)
await expect.element(getByRole('tooltip')).toBeVisible()

// Asserting absence — use query() which doesn't throw
const error = queryByText('Error')
await expect.element(error).not.toBeInTheDocument()
```

Use `expect.element()` for all element assertions — it auto-retries, which is essential in a real browser where rendering is asynchronous.

## Tips

- Locators auto-retry by default, so you rarely need explicit waits
- Browser mode supports Vite's HMR — tests re-run on save
- Use the workspace config to run unit tests (node) and browser tests in the same project
- For visual regression, combine `page.screenshot()` with snapshot matching
