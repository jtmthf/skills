# React Testing Library

Patterns, query priority, and common mistakes for testing React components with Testing Library.

> These patterns also apply to Preact Testing Library, Solid Testing Library, and other Testing Library variants. Adapt import paths accordingly.

## Query Priority

Use the most accessible query available. This order reflects how users (including screen reader users) find elements:

### 1. Accessible to everyone
- **`getByRole`** — The #1 query. Matches ARIA roles. Most elements have implicit roles.
  ```typescript
  screen.getByRole('button', { name: /submit/i })
  screen.getByRole('textbox', { name: /email/i })
  screen.getByRole('heading', { level: 2 })
  screen.getByRole('link', { name: /home/i })
  screen.getByRole('checkbox', { name: /agree/i })
  screen.getByRole('combobox', { name: /country/i })
  screen.getByRole('dialog')
  screen.getByRole('alert')
  screen.getByRole('navigation')
  ```
- **`getByLabelText`** — For form fields. Matches the associated `<label>`.
  ```typescript
  screen.getByLabelText(/email address/i)
  ```
- **`getByPlaceholderText`** — When no label exists (not ideal, but pragmatic).
- **`getByText`** — For non-interactive elements. Good for static text, paragraphs, spans.
  ```typescript
  screen.getByText(/no results found/i)
  ```
- **`getByDisplayValue`** — Current value of an input/select/textarea.

### 2. Semantic queries
- **`getByAltText`** — For images (`alt` attribute).
- **`getByTitle`** — For elements with a `title` attribute.

### 3. Last resort
- **`getByTestId`** — Only when no accessible query works (e.g., a dynamic container with no text/role).

### Query variants

| Variant | Returns | Throws on miss | Async |
|---------|---------|----------------|-------|
| `getBy*` | Element | Yes | No |
| `queryBy*` | Element \| null | No | No |
| `findBy*` | Promise<Element> | Yes | Yes |
| `getAllBy*` | Element[] | Yes | No |
| `queryAllBy*` | Element[] (may be empty) | No | No |
| `findAllBy*` | Promise<Element[]> | Yes | Yes |

**Rules:**
- Use `getBy*` for elements that should be present
- Use `queryBy*` ONLY for asserting non-existence: `expect(screen.queryByText(/error/i)).not.toBeInTheDocument()`
- Use `findBy*` for elements that appear asynchronously (replaces `waitFor` + `getBy*`)

## Common Mistakes

### 1. Not using `screen`

```typescript
// Outdated
const { getByRole } = render(<Component />)
getByRole('button')

// Current
render(<Component />)
screen.getByRole('button')
```

`screen` is always available and makes it clear you're querying the rendered output.

### 2. Using fireEvent instead of userEvent

```typescript
// Outdated: fireEvent dispatches a single DOM event
fireEvent.change(input, { target: { value: 'hello' } })

// Current: userEvent simulates real user behavior (focus, keydown, keyup, input, etc.)
const user = userEvent.setup()
await user.type(input, 'hello')
```

`userEvent` fires all the events a real browser would fire. `fireEvent` fires exactly one. This matters for components that listen to focus, blur, keydown, or other intermediate events.

**Always call `userEvent.setup()` before rendering.** This configures the user event instance.

### 3. Misusing waitFor

```typescript
// WRONG: Empty callback
await waitFor(() => {})

// WRONG: Side effects inside waitFor (it runs multiple times!)
await waitFor(() => {
  fireEvent.click(button)  // Clicks multiple times!
  expect(screen.getByText('done')).toBeInTheDocument()
})

// RIGHT: Only assertions inside waitFor
fireEvent.click(button)
await waitFor(() => {
  expect(screen.getByText('done')).toBeInTheDocument()
})

// BETTER: Use findBy instead
fireEvent.click(button)
await screen.findByText('done')
```

### 4. Using queryBy for existence assertions

```typescript
// WRONG: queryBy doesn't throw, so you get a less helpful error on failure
expect(screen.queryByText('Welcome')).toBeInTheDocument()

// RIGHT: getBy throws with a helpful error showing the current DOM
expect(screen.getByText('Welcome')).toBeInTheDocument()
```

### 5. Wrong assertions

```typescript
// BAD: Accessing DOM properties directly
expect(button.disabled).toBe(true)

// GOOD: Using jest-dom matchers
expect(button).toBeDisabled()
expect(input).toHaveValue('hello')
expect(element).toHaveTextContent(/welcome/i)
expect(link).toHaveAttribute('href', '/home')
expect(container).toHaveClass('active')
```

Install `@testing-library/jest-dom` for these matchers. They provide better error messages.

### 6. Wrapping in act() unnecessarily

```typescript
// UNNECESSARY: render and userEvent already wrap in act()
act(() => {
  render(<Component />)
})

// JUST DO:
render(<Component />)
```

If you see act() warnings, it usually means an async update happened after the test ended. Fix the root cause (wait for the update) instead of wrapping in act().

### 7. Adding unnecessary ARIA roles

```html
<!-- WRONG: <button> already has role="button" -->
<button role="button">Submit</button>

<!-- RIGHT: implicit roles work -->
<button>Submit</button>
```

Common implicit roles: `<button>` → button, `<a href>` → link, `<input type="text">` → textbox, `<input type="checkbox">` → checkbox, `<select>` → combobox, `<h1>`-`<h6>` → heading, `<nav>` → navigation, `<ul>`/`<ol>` → list.

## Testing Async Behavior

### Waiting for elements to appear

```typescript
// Element appears after async operation
const heading = await screen.findByRole('heading', { name: /dashboard/i })
expect(heading).toBeInTheDocument()
```

### Waiting for elements to disappear

```typescript
await waitForElementToBeRemoved(() => screen.queryByText(/loading/i))
// or
await waitFor(() => {
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
})
```

### Testing loading states

```typescript
test('shows loading then content', async () => {
  render(<UserList />)

  // Loading state
  expect(screen.getByText(/loading/i)).toBeInTheDocument()

  // Content loaded
  const items = await screen.findAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
})
```

## Testing Forms

```typescript
test('validates and submits the form', async () => {
  const onSubmit = vi.fn()
  const user = userEvent.setup()
  render(<ContactForm onSubmit={onSubmit} />)

  // Submit empty — validation errors
  await user.click(screen.getByRole('button', { name: /send/i }))
  expect(screen.getByText(/name is required/i)).toBeInTheDocument()

  // Fill in fields
  await user.type(screen.getByRole('textbox', { name: /name/i }), 'Alice')
  await user.type(screen.getByRole('textbox', { name: /email/i }), 'alice@example.com')
  await user.type(screen.getByRole('textbox', { name: /message/i }), 'Hello!')

  // Submit valid form
  await user.click(screen.getByRole('button', { name: /send/i }))
  expect(onSubmit).toHaveBeenCalledWith({
    name: 'Alice',
    email: 'alice@example.com',
    message: 'Hello!',
  })
})
```

## Testing with Context/Providers

```typescript
function renderWithProviders(ui, { theme = 'light', user = null, ...options } = {}) {
  function Wrapper({ children }) {
    return (
      <ThemeProvider theme={theme}>
        <AuthProvider user={user}>
          {children}
        </AuthProvider>
      </ThemeProvider>
    )
  }
  return render(ui, { wrapper: Wrapper, ...options })
}

test('shows user name in header', () => {
  renderWithProviders(<Header />, { user: { name: 'Alice' } })
  expect(screen.getByText('Alice')).toBeInTheDocument()
})
```

## ESLint Plugins

Use these plugins to catch Testing Library anti-patterns automatically:

- `eslint-plugin-testing-library` — Catches incorrect query usage, missing await, etc.
- `eslint-plugin-jest-dom` — Suggests better jest-dom matchers (e.g., `toBeDisabled()` over `toBe(true)`)
