# Node.js Built-in Test Runner

The `node:test` module provides a test runner built into Node.js (stable since Node 20). Zero dependencies — no install needed.

## When to Use

- Node.js backend code, CLI tools, libraries
- Projects that want zero test dependencies
- Simple test setups without complex configuration needs
- Projects already using Node.js without a bundler

## Running Tests

```bash
# Run all test files (auto-discovers **/*.test.{js,mjs,cjs}, **/*.test.ts with --loader)
node --test

# Run specific files
node --test src/utils.test.ts

# With TypeScript (Node 22.6+ with --experimental-strip-types, or use tsx)
node --test --experimental-strip-types
# or
node --test --import tsx

# Watch mode
node --test --watch

# Coverage
node --test --experimental-test-coverage

# Filtering
node --test --test-name-pattern="validates email"

# Reporter
node --test --test-reporter=spec
```

## Writing Tests

### Basic structure

```typescript
import { describe, it, test, before, after, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

test('adds numbers', () => {
  assert.strictEqual(add(1, 2), 3)
})

// With describe grouping
describe('Calculator', () => {
  test('adds', () => assert.strictEqual(add(1, 2), 3))
  test('subtracts', () => assert.strictEqual(sub(3, 1), 2))
})
```

### Async tests

```typescript
test('fetches user data', async () => {
  const user = await getUser(1)
  assert.strictEqual(user.name, 'Alice')
})
```

### Subtests

```typescript
test('user operations', async (t) => {
  await t.test('creates a user', async () => {
    const user = await createUser({ name: 'Alice' })
    assert.strictEqual(user.name, 'Alice')
  })

  await t.test('updates a user', async () => {
    const user = await updateUser(1, { name: 'Bob' })
    assert.strictEqual(user.name, 'Bob')
  })
})
```

## Assert Module

`node:assert/strict` provides strict-mode assertions (uses `===` by default):

```typescript
import assert from 'node:assert/strict'

// Equality
assert.strictEqual(actual, expected)
assert.deepStrictEqual(actual, expected)
assert.notStrictEqual(actual, expected)
assert.notDeepStrictEqual(actual, expected)

// Truthiness
assert.ok(value)  // truthy
assert.ok(!value) // falsy

// Throws
assert.throws(() => fn(), { message: /expected error/ })
assert.throws(() => fn(), TypeError)
await assert.rejects(asyncFn(), { code: 'ERR_INVALID_ARG' })

// Does not throw
assert.doesNotThrow(() => fn())
await assert.doesNotReject(asyncFn())

// Pattern matching
assert.match('hello world', /hello/)
assert.doesNotMatch('hello world', /goodbye/)
```

## Mocking

### Function mocking

```typescript
import { mock, test } from 'node:test'

test('calls callback', () => {
  const callback = mock.fn()

  processItems([1, 2, 3], callback)

  assert.strictEqual(callback.mock.callCount(), 3)
  assert.deepStrictEqual(callback.mock.calls[0].arguments, [1])
})
```

### Method mocking

```typescript
test('overrides method', (t) => {
  const obj = { getValue: () => 42 }

  // Mock the method — automatically restored after test
  t.mock.method(obj, 'getValue', () => 100)

  assert.strictEqual(obj.getValue(), 100)
})
```

### Timer mocking

```typescript
import { mock, test } from 'node:test'

test('debounced function', () => {
  mock.timers.enable({ apis: ['setTimeout'] })

  const fn = mock.fn()
  debounce(fn, 300)('hello')

  mock.timers.tick(200)
  assert.strictEqual(fn.mock.callCount(), 0)

  mock.timers.tick(100)
  assert.strictEqual(fn.mock.callCount(), 1)

  mock.timers.reset()
})
```

### Module mocking (experimental in Node 22.3+, stable in Node 24+)

```typescript
import { mock, test } from 'node:test'

// Must be called before the module is imported
mock.module('./analytics', {
  namedExports: {
    track: mock.fn(),
  },
})
```

## Lifecycle Hooks

```typescript
describe('database tests', () => {
  let db

  before(async () => {
    db = await connectToTestDb()
  })

  after(async () => {
    await db.close()
  })

  beforeEach(async () => {
    await db.clear()
  })

  test('inserts record', async () => {
    await db.insert({ name: 'Alice' })
    const records = await db.findAll()
    assert.strictEqual(records.length, 1)
  })
})
```

## Test Planning

Ensure a specific number of assertions run:

```typescript
test('all branches execute', (t) => {
  t.plan(2)

  const result = processInput('valid')
  assert.ok(result.success)  // assertion 1
  assert.strictEqual(result.value, 42)  // assertion 2
  // If fewer or more than 2 assertions run, the test fails
})
```

## Parameterized Tests

```typescript
const cases = [
  { input: 'hello world', expected: 'hello-world' },
  { input: 'Hello World', expected: 'hello-world' },
  { input: '', expected: '' },
]

for (const { input, expected } of cases) {
  test(`slugify("${input}") → "${expected}"`, () => {
    assert.strictEqual(slugify(input), expected)
  })
}
```

## Snapshot Testing (experimental in Node 22.3+, stable in Node 23.4+)

```typescript
test('serializes config', (t) => {
  t.assert.snapshot(generateConfig({ env: 'production' }))
})
```

Run with `--test-update-snapshots` to update snapshots.

## Tips

- Use `node:assert/strict` (not `node:assert`) to get strict equality by default
- The `t.mock` API automatically restores mocks after each test — no manual cleanup needed
- Use `--test-concurrency` to control parallelism
- Combine with `--experimental-test-coverage` for built-in coverage (no nyc/c8 needed)
- For TypeScript, use `--experimental-strip-types` (Node 22.6+) or `--import tsx`
- The test runner outputs TAP format by default; use `--test-reporter=spec` for human-readable output
