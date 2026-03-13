# Testing Best Practices

Detailed patterns and anti-patterns for writing tests that give real confidence. These principles apply across all JavaScript/TypeScript testing frameworks.

## Table of Contents
- [Test Behavior, Not Implementation](#test-behavior-not-implementation)
- [The Testing Trophy](#the-testing-trophy)
- [Write Fewer, Longer Tests](#write-fewer-longer-tests)
- [Flat Test Structure](#flat-test-structure)
- [AHA Testing — Smart Abstractions](#aha-testing--smart-abstractions)
- [Use Case Coverage](#use-case-coverage)
- [Mocking Strategy](#mocking-strategy)
- [Avoid the Test User](#avoid-the-test-user)

---

## Test Behavior, Not Implementation

Implementation detail tests verify HOW something works internally. Behavioral tests verify WHAT the user experiences. Only the latter gives real confidence.

### Two failure modes of implementation-detail tests

**False negatives (brittle tests):** Refactoring internals breaks tests even though behavior is unchanged. You rename a state variable, extract a helper function, or change an internal data structure — tests fail, but the app works perfectly.

**False positives (missed bugs):** Tests pass even when functionality is broken because they never verified the user-facing wiring. You test that setState is called with the right value, but never test that the value actually renders.

### What counts as an implementation detail

Anything that the user (end user or developer) doesn't directly interact with:

- Internal component state (`useState` values, Redux store shape)
- Instance methods or private functions
- Component internal structure (child component names, DOM nesting)
- CSS class names (unless they're the public API)
- Internal event handler names
- Specific hook calls or render counts

### What to test instead

- Rendered output visible to the user
- Responses to user interactions (clicks, typing, navigation)
- Side effects the user cares about (network requests, navigation, stored data)
- Error messages and loading states
- Accessibility (can a screen reader user interact with this?)

### Assert visibility, not just existence

Prefer `toBeVisible()` over `toBeInTheDocument()`. An element can be in the DOM but hidden via CSS (`display: none`, `visibility: hidden`, `opacity: 0`). `toBeVisible()` catches these — `toBeInTheDocument()` doesn't. Use `toBeInTheDocument()` only when asserting DOM presence regardless of visibility.

```typescript
// PREFERRED: Verifies the user can actually see it
await expect.element(getByRole('alert')).toBeVisible()

// WEAKER: Element could be hidden
expect(screen.getByRole('alert')).toBeInTheDocument()
```

### Examples

```typescript
// BAD: Tests implementation details
test('sets loading state when fetching', () => {
  const { result } = renderHook(() => useUsers())
  act(() => result.current.fetchUsers())
  expect(result.current.isLoading).toBe(true)  // testing internal state
})

// GOOD: Tests behavior
test('shows loading spinner while fetching users', async () => {
  render(<UserList />)
  expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  await screen.findByRole('list')  // loading is done
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
```

```typescript
// BAD: Tests implementation (which function is called)
test('calls onSort when header is clicked', () => {
  const onSort = vi.fn()
  render(<Table onSort={onSort} data={data} />)
  fireEvent.click(screen.getByText('Name'))
  expect(onSort).toHaveBeenCalledWith('name', 'asc')
})

// GOOD: Tests behavior (what happens to the data)
test('sorts table by name when name header is clicked', async () => {
  const user = userEvent.setup()
  render(<Table data={[{ name: 'Zara' }, { name: 'Alex' }]} />)
  await user.click(screen.getByRole('columnheader', { name: /name/i }))
  const rows = screen.getAllByRole('row')
  expect(rows[1]).toHaveTextContent('Alex')
  expect(rows[2]).toHaveTextContent('Zara')
})
```

### The refactoring litmus test

After writing a test, ask: "If I refactored the implementation without changing behavior, would this test break?" If yes, you're testing implementation details.

---

## The Testing Trophy

The Testing Trophy prioritizes integration tests over unit tests, inverting the traditional testing pyramid:

```
    ╱╲        E2E — Few, critical paths only
   ╱  ╲       (Playwright, Cypress)
  ╱────╲
 ╱██████╲     Integration — The bulk of your tests
╱████████╲    (Testing Library + MSW)
╲████████╱
 ╲██████╱     Unit — Complex logic, algorithms, utilities
  ╲────╱
   ╲  ╱       Static — TypeScript, ESLint
    ╲╱
```

**Static analysis** (TypeScript, ESLint): Catches typos, type errors, and basic mistakes. Zero runtime cost.

**Unit tests**: For pure functions, complex algorithms, and business logic with many edge cases. If it takes inputs and returns outputs with no side effects, unit test it.

**Integration tests**: Render a component with its children, wire up a real (intercepted) API, and verify the user flow. This is where most confidence comes from. An integration test for a login form renders the form, types credentials, submits, and verifies the redirect — catching bugs in the form, the API call, the error handling, and the navigation.

**E2E tests**: For critical business flows (checkout, signup, payment). Expensive to run and maintain, so use sparingly. One E2E test for the happy path of your most important features.

### When to use each level

| Level | Use when... | Example |
|-------|------------|---------|
| Unit | Pure function with complex logic | Price calculation, validation rules, date formatting |
| Integration | Component/page with user interactions | Login form, search results page, settings panel |
| E2E | Critical business flow across pages | Checkout flow, user registration, payment processing |

---

## Write Fewer, Longer Tests

Abandon "one assertion per test." Instead, write tests that follow complete user workflows with multiple Act/Assert phases.

### Why

- Shared state across tests (via beforeAll/beforeEach) creates coupling and ordering bugs
- Test isolation is per-test, not per-assertion — one render per test, multiple assertions
- Modern test runners show exactly which assertion failed and on which line
- A manual QA tester wouldn't test "button renders" separately from "button submits form"

### Pattern: Multiple phases in one test

```typescript
test('user can create, edit, and delete a todo', async () => {
  const user = userEvent.setup()
  render(<TodoApp />)

  // Create
  await user.type(screen.getByRole('textbox'), 'Buy groceries')
  await user.click(screen.getByRole('button', { name: /add/i }))
  expect(screen.getByText('Buy groceries')).toBeInTheDocument()

  // Edit
  await user.click(screen.getByRole('button', { name: /edit/i }))
  const input = screen.getByDisplayValue('Buy groceries')
  await user.clear(input)
  await user.type(input, 'Buy organic groceries')
  await user.click(screen.getByRole('button', { name: /save/i }))
  expect(screen.getByText('Buy organic groceries')).toBeInTheDocument()

  // Delete
  await user.click(screen.getByRole('button', { name: /delete/i }))
  expect(screen.queryByText('Buy organic groceries')).not.toBeInTheDocument()
})
```

### When to split tests

Split when tests truly exercise different scenarios, not different steps of the same scenario:
- Happy path vs error path (different user experiences)
- Different user roles (admin vs regular user)
- Different initial states (empty list vs populated list)

---

## Flat Test Structure

Nested `describe`/`beforeEach` blocks force readers to mentally trace variable assignments across scopes. Prefer flat, self-contained tests with test context.

### The problem with nesting

```typescript
// BAD: Variable declared in outer scope, assigned in beforeEach,
// reassigned in inner beforeEach. To understand any test, you must
// read all ancestor scopes.
describe('LoginForm', () => {
  let user
  let onSubmit

  beforeEach(() => {
    onSubmit = vi.fn()
    user = userEvent.setup()
  })

  describe('when valid credentials', () => {
    beforeEach(async () => {
      render(<LoginForm onSubmit={onSubmit} />)
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')
    })

    it('enables submit button', () => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()
    })

    it('calls onSubmit', async () => {
      await user.click(screen.getByRole('button', { name: /submit/i }))
      expect(onSubmit).toHaveBeenCalled()
    })
  })
})
```

### The flat alternative with test context

```typescript
// BEST: Test context provides type-safe fixtures. No mutable outer-scope variables.
import { test as baseTest } from 'vitest'

const test = baseTest.extend<{ user: UserEvent; onSubmit: Mock }>({
  user: async ({}, use) => { await use(userEvent.setup()) },
  onSubmit: async ({}, use) => { await use(vi.fn()) },
})

test('enables submit when credentials are valid', async ({ user, onSubmit }) => {
  render(<LoginForm onSubmit={onSubmit} />)
  await user.type(screen.getByLabelText(/email/i), 'test@example.com')
  await user.type(screen.getByLabelText(/password/i), 'password123')
  expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled()
})

test('submits valid credentials', async ({ user, onSubmit }) => {
  render(<LoginForm onSubmit={onSubmit} />)
  await user.type(screen.getByLabelText(/email/i), 'test@example.com')
  await user.type(screen.getByLabelText(/password/i), 'password123')
  await user.click(screen.getByRole('button', { name: /submit/i }))
  expect(onSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'password123',
  })
})
```

### Setup function alternative (when test context isn't available)

```typescript
function setup(overrides = {}) {
  const props = { onSubmit: vi.fn(), ...overrides }
  const user = userEvent.setup()
  render(<LoginForm {...props} />)
  return { user, ...props }
}
```

### When nesting is acceptable

- A single `describe` block to group related tests (no nesting deeper than 1 level)
- Never nest `describe` blocks more than one level deep

## One Concept Per Test File

Test files don't need to mirror source files 1:1. If a source file exports multiple distinct functions or concepts, each can have its own test file. This makes tests easier to name, navigate, and reason about.

```
// Source: src/cart-utils.ts (exports 5 functions)

// Tests: split by concept
src/__tests__/calculate-subtotal.test.ts
src/__tests__/calculate-tax.test.ts
src/__tests__/calculate-total.test.ts
src/__tests__/apply-discount.test.ts
src/__tests__/format-currency.test.ts
```

This doesn't mean every function needs its own file — group related functions when they share context. But when functions are conceptually independent, separate files are clearer than one giant file with describe blocks acting as file separators.

---

## AHA Testing — Smart Abstractions

Find the sweet spot between zero abstraction (massive duplication) and over-abstraction (conditional logic in test utilities).

### Test Object Factory pattern

```typescript
// Factory with sensible defaults and overrides
function buildUser(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'member',
    ...overrides,
  }
}

function buildOrder(overrides = {}) {
  return {
    id: 'order-1',
    status: 'pending',
    items: [{ id: 'item-1', name: 'Widget', price: 999 }],
    total: 999,
    ...overrides,
  }
}

// Tests override only what matters — the meaningful difference is visible
test('shows admin badge for admin users', () => {
  render(<UserProfile user={buildUser({ role: 'admin' })} />)
  expect(screen.getByText(/admin/i)).toBeInTheDocument()
})

test('hides admin badge for regular users', () => {
  render(<UserProfile user={buildUser({ role: 'member' })} />)
  expect(screen.queryByText(/admin/i)).not.toBeInTheDocument()
})
```

### Render helper pattern (for components)

```typescript
function renderUserSettings(overrides = {}) {
  const props = {
    user: buildUser(),
    onSave: vi.fn(),
    ...overrides,
  }
  const user = userEvent.setup()
  render(<UserSettings {...props} />)
  return {
    user,
    ...props,
    nameInput: screen.getByRole('textbox', { name: /name/i }),
    emailInput: screen.getByRole('textbox', { name: /email/i }),
    saveButton: screen.getByRole('button', { name: /save/i }),
  }
}
```

### Parameterized tests for pure functions

```typescript
test.each([
  { input: 'hello world', expected: 'hello-world' },
  { input: 'Hello World', expected: 'hello-world' },
  { input: 'hello  world', expected: 'hello-world' },
  { input: 'hello---world', expected: 'hello-world' },
  { input: '', expected: '' },
])('slugify($input) → $expected', ({ input, expected }) => {
  expect(slugify(input)).toBe(expected)
})
```

### Signs of over-abstraction

- Test helper takes boolean flags to control behavior
- You need to read the helper to understand what the test does
- The helper has more logic than the code it's testing
- Tests break when you modify the helper, not the source code

---

## Use Case Coverage

Code coverage measures lines executed, not use cases covered. 100% code coverage can still miss use cases, and 70% coverage might cover all critical paths.

### Prioritization strategy

1. Ask: "What part of this app would make me most upset if broken?"
2. Write one E2E test for the happy path of top-priority features
3. Add integration tests for edge cases and error states
4. Add unit tests for complex business logic
5. Build incrementally — add tests when you add features or fix bugs

### Reading coverage reports correctly

Don't ask "what lines aren't covered?" Ask "what use cases do these uncovered lines support?" An uncovered line in a critical checkout flow matters more than an uncovered line in an admin-only debug panel.

### Diminishing returns

Beyond roughly 70% code coverage, each additional percentage point costs exponentially more effort for linearly less confidence. The remaining 30% is often error handling for unlikely scenarios, defensive code paths, and platform-specific branches that are better verified by static analysis or manual review.

---

## Mocking Strategy

Every mock removes confidence in the integration between components. Mock only what you must.

### What to mock

- **Network requests**: Use MSW — it intercepts at the network level so your entire HTTP stack (fetch, axios, headers, serialization) is exercised
- **Timers**: Use fake timers for debounce, animation, setTimeout-based logic
- **Environment**: Mock environment variables, window.location, matchMedia
- **Heavy external services**: Payment processors, email services, third-party APIs

### What NOT to mock

- **Your own modules**: If you mock your API client, you don't know if it works. Let it make real (intercepted) requests.
- **Child components**: Render real components. Mocking children means you don't test integration.
- **State management**: Use real stores/contexts. Mocking Redux or Zustand removes confidence.
- **The router**: Use MemoryRouter or equivalent. Don't mock useNavigate.
- **Framework utilities**: Don't mock React hooks or framework internals.

### MSW over module mocking

```typescript
// BAD: Mocking the API client — you don't know if it's used correctly
vi.mock('../api/users', () => ({
  fetchUsers: vi.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
}))

// GOOD: MSW intercepts the actual network request
const server = setupServer(
  http.get('/api/users', () => {
    return HttpResponse.json([{ id: 1, name: 'Alice' }])
  })
)
```

With MSW, your test exercises the entire chain: component → API client → fetch → MSW handler. Module mocking skips the API client entirely.

---

## Avoid the Test User

Components have two real users:
1. **End user**: Sees the rendered UI, clicks buttons, types in inputs
2. **Developer**: Passes props, calls functions, uses the component API

There is no "test user." If your tests verify something neither the end user nor the developer interacts with, you're testing implementation details.

### When refactoring breaks tests, ask:

- **Did the developer API change?** (Props, function signatures, exports) → Legitimate. Update tests to match new API.
- **Did end-user behavior change?** (Different UI, different interaction flow) → Legitimate. Update tests to match new behavior.
- **Did only the implementation change?** (Internal refactor, same API, same behavior) → Tests should NOT break. If they do, they're testing implementation details — fix the tests.

### E2E test setup

Don't click through a UI flow that isn't the thing you're testing. If your checkout test requires a logged-in user with items in the cart:

```typescript
// BAD: Clicking through login and product browsing for every checkout test
test('checkout flow', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[name=email]', 'user@test.com')
  await page.fill('[name=password]', 'password')
  await page.click('button[type=submit]')
  await page.goto('/products')
  await page.click('text=Add to Cart')
  // ... finally test checkout
})

// GOOD: Direct setup, test only what you're testing
test('checkout flow', async ({ page, apiContext }) => {
  // Setup via API — fast and reliable
  await apiContext.post('/api/test/seed', {
    data: { user: 'user@test.com', cart: ['product-1'] }
  })
  await page.goto('/checkout')
  // ... test checkout directly
})
```
