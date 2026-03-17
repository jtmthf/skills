# Query and Mutation Design

## Table of Contents
- [Query Design: Noun-First, Minimal Surface Area](#query-design)
- [Mutation Naming: Verb + Noun, Domain-Specific](#mutation-naming)
- [Single Input Argument](#single-input-argument)
- [Mutation Scope: Atomic Operations](#mutation-scope)
- [Idempotency Keys](#idempotency-keys)

---

## Query Design

Queries start with a **noun** representing the object being resolved. Singular for a single object, plural for a collection. Minimize top-level queries that return the same type — prefer input filters over multiple similar queries.

This keeps the API discoverable, avoids combinatorial explosion, and encourages graph-oriented thinking over RPC patterns.

```graphql
# Good: one query per type, filters handle variation
type Query {
  user(id: UserId!): User
  users(filter: UserFilterInput, first: Int, after: Cursor): UserConnection!
}

input UserFilterInput {
  email: Email
  status: UserStatus
  createdAfter: DateTime
  search: String
}
```

```graphql
# Bad: separate query per filter dimension — explodes as requirements grow
type Query {
  getUserById(id: ID!): User
  getUserByEmail(email: String!): User
  activeUsers: [User!]!
  usersCreatedLastWeek: [User!]!
  searchUsers(query: String!): [User!]!
}
```

---

## Mutation Naming

Mutations start with a **verb**, followed by the **noun** being acted upon. Prefer **granular, domain-specific mutations** over generic CRUD. Mutations express business intent, not data manipulation.

CRUD mutations (`updateUser`) lack business meaning and authorization clarity. Domain mutations are easier to reason about, authorize, audit, and evolve. Intent-based naming reveals what the operation means, not just what it does.

```graphql
# Good: each mutation is a distinct business operation
type Mutation {
  """
  Activates a pending user account, sending them a welcome email.
  """
  activateUser(input: ActivateUserInput!): ActivateUserPayload!

  """
  Changes a user's email address. Requires email verification.
  """
  changeUserEmail(input: ChangeUserEmailInput!): ChangeUserEmailPayload!

  """
  Suspends a user account. Suspended users cannot log in.
  """
  suspendUser(input: SuspendUserInput!): SuspendUserPayload!

  """
  Transfers account ownership to another user.
  """
  transferAccountOwnership(input: TransferAccountOwnershipInput!): TransferAccountOwnershipPayload!
}
```

```graphql
# Bad: "updateUser" could mean anything — hides intent, complicates authorization and audit
type Mutation {
  updateUser(id: ID!, input: UserInput!): User
  deleteUser(id: ID!): Boolean
}
```

---

## Single Input Argument

Every mutation accepts exactly **one input object**. Name the input after the mutation: `{MutationName}Input`.

This makes mutations extensible without breaking changes (new optional fields never break clients), provides clear validation boundaries, enables `@oneOf` patterns for mutually exclusive options, and ensures consistent tooling.

```graphql
# Good
input ChangeUserEmailInput {
  """
  The user whose email is being changed.
  """
  userId: UserId!

  """
  The new email address. Must be unique across all users.
  """
  newEmail: Email!
}

type Mutation {
  changeUserEmail(input: ChangeUserEmailInput!): ChangeUserEmailPayload!
}
```

```graphql
# Bad: positional arguments are brittle and confusing
type Mutation {
  changeUserEmail(userId: ID!, newEmail: String!, sendNotification: Boolean): User
}
```

---

## Mutation Scope

A mutation represents a **single business operation** that either fully succeeds or fully fails. Clients should never need to chain mutations to complete one logical action.

Leaking transaction management to clients creates inconsistent states. Partial failures across multiple mutations are difficult to recover from. Business operations rarely map 1:1 to database tables.

```graphql
# Good: atomic operation
type Mutation {
  """
  Places an order, validating inventory, creating order items,
  and initiating payment authorization. Either all steps succeed
  or the entire operation fails.
  """
  placeOrder(input: PlaceOrderInput!): PlaceOrderPayload!
}

input PlaceOrderInput {
  idempotencyKey: IdempotencyKey!
  items: [OrderItemInput!]!
  shippingAddress: AddressInput!
  paymentMethod: PaymentMethodRefInput!
}
```

### Distributed Systems

When operations span multiple services, true database transactions aren't possible. The schema should still present atomic semantics to clients, but may model in-progress states explicitly:

```graphql
union PlaceOrderPayload =
    PlaceOrderPending
  | PlaceOrderSuccess
  | PlaceOrderFailed
  | InsufficientInventoryError
  | PaymentDeclinedError

type PlaceOrderPending {
  order: Order!
}

enum OrderStatus {
  PAYMENT_PENDING
  PAYMENT_FAILED
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}
```

---

## Idempotency Keys

Mutations that create resources or trigger side effects should accept an **idempotency key** — a client-generated UUID. Repeated requests with the same key return the original result.

Network failures happen, clients retry, and without idempotency, retries cause duplicates. This is critical for financial operations, order placement, or anything with real-world consequences.

```graphql
"""
Client-generated unique identifier for request deduplication.
Must be a valid UUID. Requests with the same key within 24 hours
return the cached result from the first request.
"""
scalar IdempotencyKey

input PlaceOrderInput {
  idempotencyKey: IdempotencyKey!
  # ...
}
```

### When to Require Idempotency Keys

| Mutation Type | Idempotency Key |
| --- | --- |
| Creates a resource | Required |
| Triggers external side effects (email, payment) | Required |
| Updates to specific values (set X to Y) | Optional — naturally idempotent |
| Toggles (activate/deactivate) | Optional — naturally idempotent |
| Deletes | Optional — naturally idempotent |

Note: an idempotency key is distinct from Relay Classic's `clientMutationId`, which was for optimistic updates and cache rollbacks, not server-side deduplication.
