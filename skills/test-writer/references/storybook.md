# Storybook Tests

Component Story Format (CSF), interaction tests with play functions, and portable stories for testing components in isolation.

## When to Use

- Component library documentation with built-in tests
- Visual testing of component states (variants, sizes, themes)
- Interaction testing of component behavior in a real browser
- Testing components in isolation without full application context
- When tests and documentation should live together

## Component Story Format (CSF 3)

### Basic story

```typescript
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta = {
  component: Button,
  args: {
    children: 'Click me',
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}
```

### Story with decorators (providers/wrappers)

```typescript
const meta = {
  component: UserProfile,
  decorators: [
    (Story) => (
      <ThemeProvider theme="light">
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof UserProfile>
```

## Interaction Tests (Play Functions)

Play functions let you simulate user interactions and make assertions within Storybook.

### Setup

```bash
npm install -D @storybook/test
```

> **Storybook 8.x** uses `@storybook/test` for imports. **Storybook 9+** moved to `storybook/test`. Check your project's version and adapt imports accordingly. The `@storybook/addon-interactions` is included by default in modern Storybook — no manual addon setup needed.

### Writing interaction tests

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn } from '@storybook/test' // Storybook 9+: import from 'storybook/test'
import { LoginForm } from './LoginForm'

const meta = {
  component: LoginForm,
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof LoginForm>

export default meta
type Story = StoryObj<typeof meta>

export const FilledForm: Story = {
  play: async ({ canvas, userEvent, args }) => {
    // canvas and userEvent are provided directly in the play function context
    // No need for within(canvasElement) or userEvent.setup()
    await userEvent.type(canvas.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(canvas.getByLabelText(/password/i), 'password123')
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    })
  },
}

export const ValidationError: Story = {
  play: async ({ canvas, userEvent }) => {
    // Submit empty form
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))

    await expect(canvas.getByText(/email is required/i)).toBeInTheDocument()
    await expect(canvas.getByText(/password is required/i)).toBeInTheDocument()
  },
}
```

### Sequential steps (building on previous stories)

```typescript
export const Step1_EmptyForm: Story = {}

export const Step2_FilledForm: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(canvas.getByLabelText(/password/i), 'password123')
  },
}

export const Step3_Submitted: Story = {
  play: async (context) => {
    // Reuse previous step
    await Step2_FilledForm.play!(context)

    const { canvas, userEvent } = context
    await userEvent.click(canvas.getByRole('button', { name: /sign in/i }))
    await expect(canvas.getByText(/welcome/i)).toBeInTheDocument()
  },
}
```

## Mocking in Stories

### MSW integration

```bash
npm install -D msw msw-storybook-addon
```

```typescript
// .storybook/preview.ts
import { initialize, mswLoader } from 'msw-storybook-addon'

initialize()

const preview = {
  loaders: [mswLoader],
}

export default preview
```

```typescript
// UserList.stories.tsx
import { http, HttpResponse } from 'msw'

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/users', () => {
          return HttpResponse.json([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ])
        }),
      ],
    },
  },
}

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/users', () => {
          return HttpResponse.json([])
        }),
      ],
    },
  },
}

export const Error: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/users', () => {
          return new HttpResponse(null, { status: 500 })
        }),
      ],
    },
  },
}
```

### Module mocking

```typescript
// Button.stories.tsx
import { fn } from '@storybook/test' // Storybook 9+: import from 'storybook/test'

const meta = {
  component: Button,
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof Button>
```

## Running Tests

### In Storybook UI

Interaction tests run automatically in the Storybook UI with the Interactions addon panel showing pass/fail status and step-through debugging.

### In CI with test-runner

```bash
npm install -D @storybook/test-runner
```

```json
{
  "scripts": {
    "test-storybook": "test-storybook"
  }
}
```

```bash
# Start Storybook first, then run tests
npm run storybook &
npx wait-on http://localhost:6006
npm run test-storybook
```

### Portable stories (run in Vitest/Jest)

Use stories as test cases in your regular test runner:

```typescript
// Button.test.tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import * as stories from './Button.stories'

const { Primary, Disabled } = composeStories(stories)

test('primary button renders', () => {
  render(<Primary />)
  expect(screen.getByRole('button')).toHaveTextContent('Click me')
})

test('disabled button is disabled', () => {
  render(<Disabled />)
  expect(screen.getByRole('button')).toBeDisabled()
})

test('primary button interaction', async () => {
  const { container } = render(<Primary />)
  await Primary.play!({ canvasElement: container })
  // Assertions from the play function run here
})
```

## Visual Testing

### With Chromatic

```bash
npm install -D chromatic
npx chromatic --project-token=<token>
```

Chromatic captures screenshots of every story and diffs them on each push.

### With Playwright

```typescript
// visual.spec.ts
import { test, expect } from '@playwright/test'

const stories = ['Primary', 'Secondary', 'Disabled']

for (const story of stories) {
  test(`Button/${story} visual`, async ({ page }) => {
    await page.goto(`/iframe.html?id=button--${story.toLowerCase()}`)
    await expect(page).toHaveScreenshot(`button-${story.toLowerCase()}.png`)
  })
}
```

## Tips

- Use play functions for interaction testing — they double as both documentation and tests
- MSW integration lets you show loading, error, and success states as separate stories
- Use `composeStories` to reuse stories in your regular test runner — no duplicate test setup
- Keep stories focused on one state/variant each
- Use `fn()` from `@storybook/test` or `storybook/test` (not `vi.fn()`) for mock functions in stories — they work in both Storybook UI and test-runner
- Sequential play functions (`Step1`, `Step2`, `Step3`) are great for documenting complex workflows
