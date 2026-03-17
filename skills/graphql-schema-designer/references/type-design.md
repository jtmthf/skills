# Type Design

## Table of Contents
- [Model Relationships, Not Foreign Keys](#relationships-not-foreign-keys)
- [Avoid Type Duplication](#avoid-type-duplication)
- [Relay-Style Connections for Collections](#connections)
- [Nullability Models Business Semantics](#nullability)
- [Custom Scalars for Domain Concepts](#custom-scalars)
- [Input Types and @oneOf](#input-types)
- [Unions vs Interfaces](#unions-vs-interfaces)
- [Enum Design and Evolution](#enum-design)
- [Schema as Correctness Boundary](#correctness-boundary)

---

## Relationships, Not Foreign Keys

Avoid fields that expose raw foreign key IDs. Relationships should be first-class objects in the graph. If a client needs only the ID, they select `customer { id }`.

Foreign key fields create field duplication (`customerId` + `customer.id`). Cache normalization tools (Apollo, urql) won't automatically update `customerId` when `customer` changes. Graph traversal is the entire point of GraphQL.

```graphql
# Good
type Order {
  id: OrderId!
  customer: User!
  advisor: User
  items: [OrderItem!]!
}
```

```graphql
# Bad: redundant IDs, cache inconsistency
type Order {
  id: ID!
  customerId: ID!      # Redundant, breaks cache updates
  customer: User!
  advisorId: ID        # Nullable ID — is advisor null or just not loaded?
  advisor: User
}
```

**Exception**: IDs that are properties, not relationships — e.g., `externalTransactionId` from a payment processor, `custodianReferenceNumber`. These are fine because they're not foreign keys to other nodes in your graph.

### Optimizing id-only Selection

Resolvers do not have to fully hydrate objects. Return just enough for downstream field resolvers:

```typescript
Order: {
  customer: (order: OrderModel) => {
    // Return a *reference*, not a hydrated user
    return { id: order.customerId }
  },
}

User: {
  id: (user) => user.id,
  name: async (user, _, ctx) => {
    // Only runs if `name` is requested
    const fullUser = await ctx.loaders.userById.load(user.id)
    return fullUser.name
  },
}
```

---

## Avoid Type Duplication

Do not create multiple types representing the same entity. Let clients select the fields they need. Avoid "summary" vs "detail" type variants.

Duplicate types diverge over time. Clients must learn which type to use where. Cache normalization becomes complicated. Field additions require updating multiple types.

```graphql
# Good: one type, clients select what they need
type User {
  id: UserId!
  name: String!
  avatarUrl: Url
  email: Email!
  createdAt: DateTime!
  settings: UserSettings!
}
```

```graphql
# Bad: UserSummary and UserDetail will diverge
type UserSummary {
  id: ID!
  name: String!
  avatarUrl: Url
}

type UserDetail {
  id: ID!
  name: String!
  avatarUrl: Url
  email: Email!
  createdAt: DateTime!
  settings: UserSettings!
}
```

---

## Connections

Use **connection types** for any unbounded or paginated list. Connections provide stable pagination, metadata, and room for growth. Cursors are opaque — they can internally be keyset positions or encoded offsets.

```graphql
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: Cursor!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: Cursor
  endCursor: Cursor
}

scalar Cursor
```

### Usage

```graphql
type Query {
  users(
    filter: UserFilterInput
    first: Int
    after: Cursor
    last: Int
    before: Cursor
  ): UserConnection!
}
```

### When to Use Simple Lists

Short, bounded lists that will never need pagination:

```graphql
type User {
  phoneNumbers: [PhoneNumber!]!  # Maximum of 5
  roles: [Role!]!                # System-defined and limited
}
```

---

## Nullability

Nullability should reflect **business reality**, not defensive programming. A field is non-null when the value is guaranteed to exist. A field is nullable when absence is a valid business state. When in doubt, lean towards nullable.

Both directions are breaking changes:
- nullable → non-null: Breaks runtime (server might return null)
- non-null → nullable: Breaks codegen (client types change)

```graphql
type User {
  # Non-null: every user MUST have these to exist
  id: UserId!
  email: Email!
  createdAt: DateTime!

  # Nullable: legitimately optional
  avatarUrl: Url           # Not everyone uploads an avatar
  phoneNumber: PhoneNumber # Optional contact method
  deletedAt: DateTime      # Only set if soft-deleted

  # Nullable: might not be visible to all viewers
  settings: UserSettings   # Null if viewer lacks permission
}
```

**Decision guide:**
1. Can this field ever be absent for a valid record? → Nullable
2. Is this field required for the entity to exist? → Non-null
3. Might authorization hide this field? → Nullable (or separate type)
4. Could this become optional in the future? → Consider nullable now

---

## Custom Scalars

The core principle (typed ID scalars, domain scalars over bare `String`/`ID`) is covered in SKILL.md. Additional guidance:

**Common scalar catalog:**

| Category | Scalars |
| --- | --- |
| Identifiers | `UserId`, `OrderId`, `PortfolioId` (one per entity) |
| Validated formats | `Email`, `PhoneNumber`, `Url` |
| Temporal | `DateTime` (ISO 8601 with tz), `Date` (date only) |
| Financial | `Money` (or a type with amount + currency), `Percentage` |
| Other | `Cursor`, `IdempotencyKey` |

Avoid the `JSON` scalar — it opts out of GraphQL's type system entirely. The only acceptable use is truly opaque metadata that the server doesn't interpret.

---

## Input Types

Use **nested input types** to encode field dependencies. Use **`@oneOf`** when exactly one variant must be provided.

### @oneOf for Mutually Exclusive Inputs

```graphql
"""
Identifies a user by exactly one of the available criteria.
"""
input UserRefInput @oneOf {
  id: UserId
  email: Email
  externalId: String
}
```

### Nested Inputs for Conditional Fields

```graphql
input NotificationDeliveryInput @oneOf {
  email: EmailDeliveryInput
  sms: SmsDeliveryInput
  push: PushDeliveryInput
}

input EmailDeliveryInput {
  subject: String!
  replyTo: Email
}
```

### Shared Input Types

Reuse input types when they represent the same concept:

```graphql
input AddressInput {
  street1: String!
  street2: String
  city: String!
  state: String!
  zipCode: String!
  country: String!
}

input CreateAccountInput {
  billingAddress: AddressInput!
  shippingAddress: AddressInput
}
```

---

## Unions vs Interfaces

Use **interfaces** when types share common fields and semantics. Use **unions** when types are conceptually distinct but appear in the same position.

### Interface: Shared Fields

```graphql
interface FeedItem {
  id: ID!
  timestamp: DateTime!
  actor: User!
}

type CommentFeedItem implements FeedItem {
  id: ID!
  timestamp: DateTime!
  actor: User!
  comment: Comment!
}
```

Clients can query common fields without type discrimination.

### Union: Distinct Types

```graphql
union PlaceOrderPayload =
    PlaceOrderSuccess
  | InsufficientInventoryError
  | PaymentDeclinedError
```

### Decision Matrix

| Scenario | Choice |
| --- | --- |
| Types share 3+ meaningful fields | Interface |
| Types happen to have `id` but nothing else | Union |
| Mutation success + errors | Union + error interface |
| Polymorphic collection with common behavior | Interface |
| Completely distinct things in same slot | Union |

---

## Enum Design

Enums are **closed** sets — adding values can break clients with exhaustive switch statements.

### Mitigation Strategies

**1. Document that enum may grow:**
```graphql
"""
Current status of an order. New values may be added over time;
clients should handle unknown values gracefully.
"""
enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
}
```

**2. Include a catch-all from the start:**
```graphql
enum OrderStatus {
  UNKNOWN
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}
```

**3. For highly volatile sets, use a type instead:**
```graphql
type OrderStatus {
  value: String!
  displayName: String!
  description: String
}
```

---

## Correctness Boundary

The union-as-state-machine pattern is covered in SKILL.md. Additional guidance on when to apply it:

**Use union encoding when:**
- An entity has 3+ states with state-dependent fields
- Nullable fields are only valid in certain states
- State transitions affect which fields are accessible

**Keep flat (enum + nullable fields) when:**
- States differ only in the enum value, not in available fields
- The entity has at most 1-2 conditional nullable fields
- State-dependent fields are purely informational (timestamps) with no complex structures

When using the union pattern, expose the union as a field on the entity rather than making the entity itself a union — this preserves a stable type for cache normalization:

```graphql
# Good: Order is always Order, details vary by state
type Order {
  id: OrderId!
  items: [OrderItem!]!
  details: OrderDetails!
}
union OrderDetails = PendingOrderDetails | ShippedOrderDetails | CancelledOrderDetails
```
