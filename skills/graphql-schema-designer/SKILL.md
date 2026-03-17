---
name: graphql-schema-designer
description: |
  GraphQL schema design, review, and evolution. MUST use this skill whenever the user creates, modifies, extends, reviews, or refactors a GraphQL schema — whether SDL files, code-first frameworks (Pothos, Nexus, TypeGraphQL, gqlgen, Strawberry, graphql-ruby, Hot Chocolate, Juniper), or federation. Trigger on: designing schemas for new apps or features, adding types/queries/mutations, reviewing schema quality, refactoring CRUD to domain mutations, adding payload unions or error types, modeling entity relationships, working with .graphql files, or any task whose output includes GraphQL type definitions. Also trigger on phrases like "GraphQL schema", "add a mutation", "new GraphQL type", "schema for", "design the API types", "review this schema", "payload union", "extend the schema". Do NOT trigger for: writing client queries/fragments, debugging resolvers, codegen config, DataLoaders, CORS, auth middleware, rate limiting, or testing endpoints.
license: Apache-2.0
metadata:
  author: Jack Moore
  version: "1.0"
compatibility: |
  Filesystem access recommended for scanning existing schemas and writing schema files.
  Works without filesystem in chat-only mode (user pastes schema, receives output in chat).
  Sub-agent support optional — enables parallel schema scanning and review.
---

# GraphQL Schema Designer

You are an expert GraphQL schema architect. You design schemas that are discoverable, evolvable, and make invalid states unrepresentable.

## Core Principles

These are the patterns that most schemas get wrong. They are the heart of what this skill teaches — internalize them.

### Domain Mutations Over CRUD

This is the single most impactful principle. `updateUser` is meaningless — it hides intent, makes authorization impossible to scope, and turns audit logs into noise. Every mutation should express a **specific business operation**:

```graphql
# Good: each mutation is a distinct business operation with clear boundaries
type Mutation {
  changeUserEmail(input: ChangeUserEmailInput!): ChangeUserEmailPayload!
  suspendUser(input: SuspendUserInput!): SuspendUserPayload!
  transferAccountOwnership(input: TransferAccountOwnershipInput!): TransferAccountOwnershipPayload!
}
```

Think about it from the authorization perspective: "Can this user update a user?" is unanswerable. "Can this user change another user's email?" is a concrete policy decision. Each domain mutation has its own validation rules, authorization checks, side effects (emails, webhooks), and audit trail entry.

When you find yourself writing `updateX` or `deleteX`, stop and ask: what business operations does this represent? Break them apart.

### Payload Unions for Expected Errors

Mutations return a **union type** — not a plain type with an errors field. The union includes a success type and typed error members. All error types implement a shared `Error` interface:

```graphql
interface Error {
  message: String!
  code: String!
}

type EmailAlreadyInUseError implements Error {
  message: String!
  code: String!
  email: Email!
}

type ChangeUserEmailSuccess {
  user: User!
}

union ChangeUserEmailPayload =
    ChangeUserEmailSuccess
  | EmailAlreadyInUseError
  | UserNotFoundError
  | NotAuthorizedError
```

The `interface Error` with `message: String!` and `code: String!` is required. `message` is for display, `code` is for programmatic handling. Every expected error gets its own type implementing this interface, carrying domain-specific context (which email was taken, which user wasn't found, which permission was missing).

This matters because clients get **exhaustive** error handling at compile time. A new error type added to the union triggers a type error in clients — they can't silently ignore it. Compare this to an errors array where new error codes slip through unnoticed.

GraphQL-level errors (`errors` array in the response) are reserved for unexpected server failures — authentication failures, database outages, bugs. If you can name the error, it belongs in the payload union.

### Custom Scalars for Domain Concepts

Never use bare `ID` or `String` for typed values. Define custom scalars that validate at parse time and prevent cross-type ID confusion:

```graphql
scalar UserId
scalar OrderId
scalar Email
scalar DateTime
scalar Money
scalar Cursor
```

This isn't just documentation — it's a correctness boundary. Without custom scalars, nothing prevents passing an `OrderId` where a `UserId` is expected. The schema should catch this at the boundary, not the resolver.

For identifiers specifically, every entity gets its own scalar ID type: `UserId`, `OrderId`, `ProjectId`. This makes the schema self-documenting and enables tooling to catch mismatched ID types.

### Make Invalid States Unrepresentable

Use unions to encode state machines rather than nullable fields that are "only valid when status is X". The problem: clients receive an object where half the fields are null and the other half are "trust me, these are set." There's no compile-time enforcement — a developer accessing `order.shippedAt` on a pending order gets `null` at runtime instead of a type error. Unions make the state machine explicit in the type system:

```graphql
# Bad: shippedAt is nullable and only valid when status >= SHIPPED
type Order {
  status: OrderStatus!
  shippedAt: DateTime
  deliveredAt: DateTime
  cancelledAt: DateTime
  cancellationReason: String
}

# Good: union encodes valid states — clients can't access shippedAt on a pending order
union OrderDetails =
    PendingOrderDetails
  | ShippedOrderDetails
  | CancelledOrderDetails

type ShippedOrderDetails {
  shippedAt: DateTime!
  trackingNumber: String!
}
```

Use `@oneOf` for mutually exclusive inputs. Push correctness into the type system wherever you can.

### Idempotency Keys

Mutations that create resources or trigger side effects should accept an `IdempotencyKey` scalar. Network failures happen, clients retry, and without idempotency, retries cause duplicates:

```graphql
scalar IdempotencyKey

input PlaceOrderInput {
  idempotencyKey: IdempotencyKey!
  items: [OrderItemInput!]!
}
```

Required for creates and side-effect mutations. Optional for naturally idempotent operations (set X to Y, toggles, deletes).

## Workflow

1. **Brownfield?** If there's an existing codebase, scan for existing schema artifacts first (delegate to `agents/schema-scanner.md` if sub-agents are available, otherwise search for `.graphql` files, `gql` tags, or code-first patterns). Match the existing framework and conventions.
2. **Identify domain entities and operations.** Ask clarifying questions if the user's request is ambiguous about entities, relationships, or business operations. Don't guess at domain rules.
3. **Design types first** — entities, enums, scalars, relationships. Read `references/type-design.md` if the domain involves complex relationships, state machines, or nullability decisions.
4. **Design queries** — noun-based, with filters and connections. Read `references/query-and-mutation-design.md` for non-obvious patterns.
5. **Design mutations** — domain-specific verb+noun operations with payload unions. Read `references/error-handling.md` when designing payloads.
6. **Review against core principles** — check every mutation for CRUD smell, every payload for union pattern, every ID for custom scalar.

## Reference Files

Read these on demand as specific topics arise. Do not front-load them.

- `references/query-and-mutation-design.md` — Detailed patterns for query naming, mutation naming, single input pattern, atomic scope, idempotency. **Read when designing queries or mutations.**
- `references/error-handling.md` — Payload union examples, field-level validation, GraphQL errors vs payload errors. **Read when designing mutation payloads or error types.**
- `references/type-design.md` — Relationships, connections, nullability, custom scalars, input types, unions vs interfaces, enums. **Read when designing or reviewing types.**
- `references/advanced-patterns.md` — Async patterns, authorization modeling, file handling, subscriptions, schema evolution. **Read when the topic involves auth, files, subscriptions, or breaking changes.**

## Sub-Agent Delegation

If sub-agents are available, delegate bounded autonomous tasks. If unavailable, do the work inline.

- `agents/schema-scanner.md` — Scans a codebase for existing GraphQL schema artifacts, framework, and conventions. **Delegate when starting work on a brownfield project.**
- `agents/schema-reviewer.md` — Reviews a schema against all best practices and produces a structured report. **Delegate when the user requests a review.**

## Output

Match the project's framework. If the project uses a code-first framework (Pothos, Nexus, TypeGraphQL, gqlgen, Strawberry, graphql-ruby, Hot Chocolate, etc.), output in that framework's idioms. If SDL-first, output `.graphql` files. If unknown, default to SDL.

When updating an existing schema, output only the changes needed.

For reviews, categorize findings as Critical, Warning, or Suggestion, with concrete fixes for each issue.
