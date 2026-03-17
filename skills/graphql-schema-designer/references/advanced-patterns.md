# Advanced Patterns

## Table of Contents
- [Performance Expectations](#performance-expectations)
- [Async Mutation Patterns](#async-patterns)
- [Authorization Modeling](#authorization)
- [File Handling via Pre-signed URLs](#file-handling)
- [Subscriptions](#subscriptions)
- [Schema Evolution and Breaking Changes](#schema-evolution)
- [Boundaries](#boundaries)

---

## Performance Expectations

### Queries

Queries must have **no side effects**. Target response times:
- **< 100ms** for typical queries
- **< 1s** absolute upper bound for complex aggregations

When data is expensive to compute or takes seconds+:
- Do not expose it as a synchronous query field
- Model it as an asynchronous workflow: mutation to start, job ID returned, query to poll

### Mutations

Mutations should complete in **under 5 seconds**. Long-running work returns a job/task object for polling.

---

## Async Patterns

When operations may exceed 5 seconds, model them as jobs:

```graphql
type Mutation {
  """
  Initiates monthly report generation. Returns immediately with a job
  that can be polled for completion.
  """
  generateMonthlyReport(input: GenerateReportInput!): GenerateReportPayload!
}

union GenerateReportPayload =
    GenerateReportStarted
  | InvalidDateRangeError
  | ReportAlreadyExistsError

type GenerateReportStarted {
  job: ReportJob!
}

type ReportJob {
  id: ReportJobId!
  status: JobStatus!
  progress: Float

  """
  Available once status is COMPLETED.
  """
  report: Report

  """
  Available if status is FAILED.
  """
  failureReason: String
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

type Query {
  reportJob(id: ReportJobId!): ReportJob
}
```

Use for: report generation, bulk imports/exports, external service integrations with unpredictable latency.

---

## Authorization

Authorization affects schema design, not just resolver implementation. Choose between patterns based on UX needs.

### Pattern 1: Nullable Fields

Field returns `null` when viewer lacks permission. Simple but clients can't distinguish "no data" from "not authorized."

```graphql
type User {
  id: UserId!
  name: String!
  email: Email              # Null if viewer lacks permission
  compensation: Compensation # Null if viewer is not HR or the user themselves
}
```

### Pattern 2: Capability Fields

Expose what actions the viewer can take — drives UI state (show/hide edit buttons):

```graphql
type User {
  id: UserId!
  name: String!
  permissions: UserPermissions!
}

type UserPermissions {
  canEdit: Boolean!
  canViewCompensation: Boolean!
  canSuspend: Boolean!
  canChangeRole(to: UserRole!): Boolean!
}
```

### Pattern 3: Viewer-Scoped Root

Authorization context explicit at the query root:

```graphql
type Query {
  viewer: Viewer
}

type Viewer {
  user: User!
  teams: [Team!]!
  accessiblePortfolios: PortfolioConnection!
  isAdmin: Boolean!
}
```

### Anti-Pattern

Never have fields that sometimes throw GraphQL errors based on authorization:

```graphql
type User {
  socialSecurityNumber: String!  # Sometimes explodes — unpredictable
}
```

---

## File Handling

Avoid raw file uploads through GraphQL. Use mutations to generate **pre-signed URLs** for upload. Reference uploaded files by key/ID in subsequent mutations.

```graphql
type Mutation {
  requestDocumentUpload(
    input: RequestDocumentUploadInput!
  ): RequestDocumentUploadPayload!

  attachDocumentToClient(
    input: AttachDocumentToClientInput!
  ): AttachDocumentToClientPayload!
}

input RequestDocumentUploadInput {
  filename: String!
  contentType: String!
  sizeBytes: Int!
}

type RequestDocumentUploadSuccess {
  uploadUrl: Url!
  uploadKey: String!
  expiresAt: DateTime!
}
```

**Client flow:**
1. Call `requestDocumentUpload` to get pre-signed URL
2. PUT file directly to storage URL (bypassing GraphQL)
3. Call `attachDocumentToClient` with the upload key

---

## Subscriptions

Polling is simpler and handles most use cases. Use subscriptions sparingly.

### When to Use Subscriptions
- Real-time collaboration (multiple users editing)
- Live notifications where latency matters
- Long-running job completion (alternative to polling)
- Event-driven domains (chat, live feeds)

### When Polling Is Better
- Dashboard refreshes
- Status checks on jobs
- Data that changes every few seconds anyway

### Naming: Noun + Past-Tense Verb

```graphql
type Subscription {
  reportJobCompleted(jobId: ReportJobId!): ReportJobCompletedEvent!
  portfolioValueChanged(portfolioId: PortfolioId!): PortfolioValueChangedEvent!
  messagePosted(threadId: ThreadId!): MessagePostedEvent!
}
```

### Always Provide a Query Fallback

Clients might miss events (disconnect, app backgrounded):

```graphql
type Query {
  reportJob(id: ReportJobId!): ReportJob
  messages(threadId: ThreadId!, since: DateTime): [Message!]!
}
```

---

## Schema Evolution

The schema is a contract. Most changes can be made non-breaking with planning.

### Breaking Changes

| Change | Why It Breaks |
| --- | --- |
| Remove a field | Clients querying it get errors |
| Remove an enum value | Clients handling it break |
| Remove a union member | Fragment spreads fail |
| Make nullable → non-null | Server might return null |
| Make non-null → nullable | Codegen types change |
| Change a field's type | Serialization breaks |
| Remove an argument | Clients passing it get errors |
| Add required argument | Existing queries missing it fail |

### Safe Changes

| Change | Notes |
| --- | --- |
| Add a field | Clients ignore unknown fields |
| Add an optional argument | Defaults preserve behavior |
| Add an enum value | With client warning |
| Add a union member | With client warning |
| Add a type implementing interface | Safe |
| Deprecate anything | Safe — just metadata |

### Deprecation Pattern

```graphql
type User {
  name: String!
  fullName: String @deprecated(reason: "Use `name` instead. Will be removed 2025-06-01.")
}
```

Process: add replacement → deprecate old → monitor usage → communicate removal → remove when usage is zero.

---

## Boundaries

Keep these concerns outside GraphQL: authentication (REST/OAuth), large file uploads (pre-signed URLs), webhooks, health checks, and observability. The file handling section above covers the upload pattern.
