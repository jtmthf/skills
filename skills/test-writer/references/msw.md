# Mock Service Worker (MSW)

Network-level API mocking for tests. MSW intercepts actual HTTP requests so your entire stack (fetch/axios, headers, serialization, error handling) is exercised.

> This reference covers MSW v2 (current). If you encounter a project using MSW v1 (`rest.get` instead of `http.get`), adapt accordingly but suggest upgrading.

## Why MSW Over Module Mocking

```typescript
// BAD: Module mock — skips the entire HTTP layer
vi.mock('../api', () => ({
  fetchUsers: vi.fn().mockResolvedValue([{ id: 1, name: 'Alice' }])
}))
// Your fetch call, headers, error handling, response parsing — NONE of it runs.

// GOOD: MSW — the full request/response cycle runs
http.get('/api/users', () => {
  return HttpResponse.json([{ id: 1, name: 'Alice' }])
})
// Your code calls fetch('/api/users'), sends headers, parses the response — all real.
```

## Setup

### Install

```bash
npm install msw --save-dev
```

### Server setup file

Create a shared server setup (e.g., `src/test/server.ts`):

```typescript
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

### Default handlers

Create default handlers that represent the "happy path" for your API (e.g., `src/test/handlers.ts`):

```typescript
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ])
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(
      { id: 3, ...body },
      { status: 201 }
    )
  }),

  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({
      id: Number(params.id),
      name: 'Alice',
      email: 'alice@example.com',
    })
  }),
]
```

### Global test setup

In your test setup file (e.g., `src/test/setup.ts`):

```typescript
import { server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

**`onUnhandledRequest: 'error'`** — Fails the test if any request doesn't have a matching handler. This catches requests you forgot to handle and prevents tests from hitting real APIs.

## Per-Test Overrides

Override default handlers in individual tests to simulate errors, edge cases, or specific responses:

```typescript
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'

test('shows error message when API fails', async () => {
  // Override just for this test
  server.use(
    http.get('/api/users', () => {
      return new HttpResponse(null, { status: 500 })
    })
  )

  render(<UserList />)
  await screen.findByText(/something went wrong/i)
})

test('shows empty state when no users', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json([])
    })
  )

  render(<UserList />)
  await screen.findByText(/no users found/i)
})
```

The `server.resetHandlers()` in `afterEach` restores the default handlers after each test.

## Common Patterns

### Request body validation

```typescript
test('sends correct data when creating user', async () => {
  let capturedBody: unknown

  server.use(
    http.post('/api/users', async ({ request }) => {
      capturedBody = await request.json()
      return HttpResponse.json({ id: 1, ...capturedBody }, { status: 201 })
    })
  )

  const user = userEvent.setup()
  render(<CreateUserForm />)

  await user.type(screen.getByLabelText(/name/i), 'Alice')
  await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
  await user.click(screen.getByRole('button', { name: /create/i }))

  await waitFor(() => {
    expect(capturedBody).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
    })
  })
})
```

### Request header validation

```typescript
test('sends auth token with request', async () => {
  let capturedHeaders: Headers

  server.use(
    http.get('/api/profile', ({ request }) => {
      capturedHeaders = request.headers
      return HttpResponse.json({ name: 'Alice' })
    })
  )

  render(<Profile />) // assumes auth context provides the token
  await screen.findByText('Alice')

  expect(capturedHeaders.get('Authorization')).toBe('Bearer test-token')
})
```

### Network errors

```typescript
test('handles network failure', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.error() // Simulates a network error (not an HTTP error)
    })
  )

  render(<UserList />)
  await screen.findByText(/network error/i)
})
```

### Delayed responses

```typescript
import { delay, http, HttpResponse } from 'msw'

test('shows loading state', async () => {
  server.use(
    http.get('/api/users', async () => {
      await delay(100)
      return HttpResponse.json([{ id: 1, name: 'Alice' }])
    })
  )

  render(<UserList />)
  expect(screen.getByText(/loading/i)).toBeInTheDocument()
  await screen.findByText('Alice')
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
})
```

### GraphQL

```typescript
import { graphql, HttpResponse } from 'msw'

export const handlers = [
  graphql.query('GetUsers', () => {
    return HttpResponse.json({
      data: {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      },
    })
  }),

  graphql.mutation('CreateUser', async ({ variables }) => {
    return HttpResponse.json({
      data: {
        createUser: { id: 3, name: variables.name },
      },
    })
  }),
]
```

## Tips

- **Start with happy-path handlers** in your default handler file, then override per-test for errors/edge cases
- **Use `onUnhandledRequest: 'error'`** to catch unmocked requests early
- **Don't over-specify handlers** — only return the fields your component actually uses
- **Share handlers across test files** via the default handler file
- **Keep handler logic simple** — handlers are test infrastructure, not application code
