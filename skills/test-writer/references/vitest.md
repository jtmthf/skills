# Vitest

Configuration, differences from Jest, and patterns specific to Vitest.

## Why Vitest

Vitest is the testing framework for Vite-based projects. It uses Vite's transform pipeline, so your tests use the same config as your app — no separate Babel/SWC configuration. It's also Jest-compatible in most API surfaces.

## Configuration

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom or happy-dom for DOM testing
    environment: 'jsdom',
    // or 'happy-dom' — faster but less complete DOM implementation

    // Setup files
    setupFiles: ['./src/test/setup.ts'],

    // Globals (optional — enables describe/it/expect without imports)
    globals: true,

    // CSS handling
    css: false, // Skip CSS processing in tests (faster)

    // Coverage
    coverage: {
      provider: 'v8', // or 'istanbul'
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    },

    // Type checking (optional)
    typecheck: {
      enabled: true,
    },
  },
})
```

### Setup file (`src/test/setup.ts`)

```typescript
import '@testing-library/jest-dom/vitest'

// MSW setup (if using)
import { server } from './server'
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

Note: Import `@testing-library/jest-dom/vitest` (not just `@testing-library/jest-dom`) for proper Vitest matcher types.

## Key Differences from Jest

### Imports

If `globals: true` is NOT set (recommended for explicit imports):

```typescript
import { describe, it, test, expect, vi, beforeEach, afterEach } from 'vitest'
```

### Mocking

```typescript
// Vitest uses vi instead of jest
const mockFn = vi.fn()
vi.spyOn(object, 'method')
vi.mock('./module')
vi.useFakeTimers()
vi.advanceTimersByTime(1000)
vi.useRealTimers()
```

### Module mocking

```typescript
// Auto-mock
vi.mock('./analytics')

// Manual mock
vi.mock('./analytics', () => ({
  track: vi.fn(),
}))

// Partial mock — use vi.importActual (async!)
vi.mock('./utils', async () => {
  const actual = await vi.importActual('./utils')
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue('test-id'),
  }
})
```

**Key difference from Jest:** `vi.importActual` is async and returns a Promise. In Jest, `jest.requireActual` is synchronous.

### In-source testing

Vitest supports tests inside source files (opt-in):

```typescript
// src/utils.ts
export function add(a: number, b: number) {
  return a + b
}

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it('adds numbers', () => {
    expect(add(1, 2)).toBe(3)
  })
}
```

Enable with `define: { 'import.meta.vitest': 'undefined' }` in production config to tree-shake tests.

## Workspace Configuration

For monorepos or projects with multiple test environments:

### `vitest.workspace.ts`

```typescript
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
      name: 'components',
      include: ['src/**/*.test.tsx'],
      environment: 'jsdom',
    },
  },
])
```

## Test Context (Fixtures)

Vitest's `test.extend()` provides type-safe fixture injection — the preferred alternative to `beforeAll`/`beforeEach`/`afterAll` with mutable outer-scope variables. Fixtures are lazily initialized and automatically torn down.

```typescript
import { test as baseTest, expect } from 'vitest'

const test = baseTest.extend<{ server: ReturnType<typeof setupServer> }>({
  server: async ({}, use) => {
    const server = setupServer(
      http.get('/api/users', () => HttpResponse.json([{ id: 1, name: 'Alice' }]))
    )
    server.listen({ onUnhandledRequest: 'error' })
    await use(server)
    server.close()
  },
})

test('fetches users', async ({ server }) => {
  render(<UserList />)
  await expect(screen.findByText('Alice')).resolves.toBeVisible()
})

test('handles error', async ({ server }) => {
  server.use(http.get('/api/users', () => HttpResponse.error()))
  render(<UserList />)
  await expect(screen.findByRole('alert')).resolves.toBeVisible()
})
```

### Combining fixtures

```typescript
const test = baseTest.extend<{
  server: ReturnType<typeof setupServer>
  clock: void
}>({
  server: async ({}, use) => {
    const server = setupServer(/* handlers */)
    server.listen()
    await use(server)
    server.close()
  },
  clock: async ({}, use) => {
    vi.useFakeTimers()
    await use()
    vi.useRealTimers()
  },
})
```

## Timer Mocking

### Prefer running timers to completion

```typescript
// PREFERRED: Run all pending timers — doesn't couple to specific durations
await vi.runAllTimersAsync()
await vi.runOnlyPendingTimersAsync()

// USE SPARINGLY: Only when the specific duration is what's being tested
vi.advanceTimersByTime(300)
```

Hardcoded `advanceTimersByTime` values couple tests to implementation timing — if the debounce delay changes from 300ms to 500ms, the test breaks even though behavior is identical. Prefer `runAllTimersAsync()` or waiting for a visible condition.

### Set up timers in fixtures, not inline

```typescript
const test = baseTest.extend<{ clock: void }>({
  clock: async ({}, use) => {
    vi.useFakeTimers()
    await use()
    vi.useRealTimers()
  },
})

test('debounced search shows results', async ({ clock }) => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<SearchInput />)

  await user.type(screen.getByRole('searchbox'), 'hello')
  await vi.runAllTimersAsync()
  await screen.findByText(/results/i)
})
```

## Concurrent Tests

```typescript
// Run tests in this file concurrently
describe.concurrent('math utils', () => {
  test('adds', () => expect(add(1, 2)).toBe(3))
  test('subtracts', () => expect(sub(3, 1)).toBe(2))
})
```

## Type Testing

Vitest can test TypeScript types at compile time:

```typescript
import { expectTypeOf, test } from 'vitest'

test('returns string', () => {
  expectTypeOf(fn()).toEqualTypeOf<string>()
  expectTypeOf(fn()).not.toBeAny()
})
```

## Tips

- Use `happy-dom` over `jsdom` for speed unless you need specific browser APIs that happy-dom doesn't implement
- Vitest re-runs only affected tests on file change — leverage this in watch mode
- Use `vitest --reporter=verbose` for detailed output in CI
- Use `vitest --ui` for an interactive browser-based test UI
- Vitest shares Vite's resolve and transform config — path aliases, CSS modules, and asset imports work out of the box
