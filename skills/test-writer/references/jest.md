# Jest

Configuration, matchers, mocking, and patterns specific to Jest.

## Configuration

### `jest.config.ts`

```typescript
import type { Config } from 'jest'

const config: Config = {
  // Use ts-jest or @swc/jest for TypeScript
  transform: {
    '^.+\\.tsx?$': ['@swc/jest'],
  },

  // Module name mapping (for path aliases, CSS modules, etc.)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|svg)$': '<rootDir>/src/test/__mocks__/fileMock.ts',
  },

  // Setup files
  setupFilesAfterSetup: ['<rootDir>/src/test/setup.ts'],  // Note: key is setupFilesAfterSetup in Jest 28+

  // Test environment
  testEnvironment: 'jsdom',  // for React/DOM testing
  // testEnvironment: 'node', // for Node.js/API testing

  // Coverage
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
}

export default config
```

### Setup file (`src/test/setup.ts`)

```typescript
import '@testing-library/jest-dom'

// MSW setup (if using)
import { server } from './server'
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

## Matchers

### Common jest-dom matchers

```typescript
expect(element).toBeInTheDocument()
expect(element).toBeVisible()
expect(element).toBeEnabled()
expect(element).toBeDisabled()
expect(element).toBeChecked()
expect(element).toHaveTextContent(/welcome/i)
expect(element).toHaveValue('hello')
expect(element).toHaveAttribute('href', '/home')
expect(element).toHaveClass('active')
expect(element).toHaveFocus()
expect(element).toBeRequired()
expect(element).toBeValid()
expect(element).toBeInvalid()
expect(element).toHaveStyle({ color: 'red' })
expect(element).toHaveAccessibleName('Submit form')
expect(element).toHaveAccessibleDescription('Click to submit the form')
```

### Standard Jest matchers

```typescript
// Equality
expect(value).toBe(exact)              // strict equality (===)
expect(value).toEqual(deep)            // deep equality
expect(value).toStrictEqual(deep)      // deep + no extra properties

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).toBeUndefined()
expect(value).toBeDefined()

// Numbers
expect(value).toBeGreaterThan(3)
expect(value).toBeCloseTo(0.3, 5)

// Strings
expect(value).toMatch(/pattern/)
expect(value).toContain('substring')

// Arrays/Iterables
expect(array).toContain(item)
expect(array).toContainEqual({ id: 1 })
expect(array).toHaveLength(3)

// Objects
expect(obj).toHaveProperty('key', 'value')
expect(obj).toMatchObject({ key: 'value' })

// Exceptions
expect(() => fn()).toThrow()
expect(() => fn()).toThrow(/message/)

// Async
await expect(promise).resolves.toBe(value)
await expect(promise).rejects.toThrow(/error/)

// Asymmetric matchers (useful inside toEqual/toHaveBeenCalledWith)
expect.any(String)
expect.stringContaining('partial')
expect.stringMatching(/pattern/)
expect.arrayContaining([1, 2])
expect.objectContaining({ key: 'value' })
```

## Mocking

### Function mocks

```typescript
const mockFn = jest.fn()
mockFn.mockReturnValue(42)
mockFn.mockReturnValueOnce(42)
mockFn.mockResolvedValue({ data: 'value' })
mockFn.mockResolvedValueOnce({ data: 'value' })
mockFn.mockImplementation((x) => x * 2)

// Assertions
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledTimes(2)
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
expect(mockFn).toHaveBeenLastCalledWith('arg')
```

### Module mocking

Use sparingly — prefer MSW for API mocking and real implementations where possible.

```typescript
// Mock an entire module
jest.mock('./analytics', () => ({
  track: jest.fn(),
}))

// Mock with partial implementation
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  generateId: jest.fn().mockReturnValue('test-id'),
}))

// Inline mock (auto-hoisted by Jest)
jest.mock('./config', () => ({
  API_URL: 'http://test-api.com',
}))
```

### Timer mocking

```typescript
test('debounced search', async () => {
  jest.useFakeTimers()
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  render(<SearchInput />)

  await user.type(screen.getByRole('searchbox'), 'hello')

  // Debounce hasn't fired yet
  expect(screen.queryByText(/results/i)).not.toBeInTheDocument()

  // Advance past debounce delay
  jest.advanceTimersByTime(300)
  await screen.findByText(/results/i)

  jest.useRealTimers()
})
```

**Important:** When using fake timers with userEvent, pass `advanceTimers: jest.advanceTimersByTime` to `userEvent.setup()`.

### Spying

```typescript
// Spy on an existing method
const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

// Verify and restore
expect(spy).toHaveBeenCalledWith('expected error')
spy.mockRestore()
```

## Snapshot Testing

Use sparingly and only for stable, small outputs. Large snapshots become noise.

```typescript
// Acceptable: small, stable output
test('formats currency correctly', () => {
  expect(formatCurrency(1234, 'USD')).toMatchInlineSnapshot(`"$12.34"`)
})

// Avoid: large component snapshots that change frequently
test('renders correctly', () => {
  const { container } = render(<ComplexComponent />)
  expect(container).toMatchSnapshot()  // Will break on every UI change
})
```

Prefer `toMatchInlineSnapshot()` over `toMatchSnapshot()` — inline snapshots are visible in the test file and easier to review.

## Configuration Tips

- Use `@swc/jest` or `esbuild-jest` for faster TypeScript transformation (10-20x faster than `ts-jest`)
- Set `testEnvironment: 'jsdom'` for DOM tests, `'node'` for API/backend tests
- Use `--bail` in CI to fail fast on first broken test
- Use `--watch` in development for fast feedback loops
- Configure `collectCoverageFrom` to exclude test files, type definitions, and config files
