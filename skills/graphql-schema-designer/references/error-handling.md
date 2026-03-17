# Error Handling

## Table of Contents
- [Structured Mutation Errors (Payload Union Pattern)](#payload-union-pattern)
- [Field-Level Validation Errors](#field-level-validation)
- [GraphQL Errors vs Payload Errors](#graphql-errors-vs-payload-errors)

---

## Payload Union Pattern

Mutations return a **payload union type**. The union includes a success type and expected error types. All error types implement a common `Error` interface. Success types are named `{MutationName}Success`.

Clients exhaustively handle known error cases at compile time. New error types extend the union without breaking existing clients. Errors carry domain-specific context. There is a clear distinction between expected business errors and unexpected failures.

### Error Interface

```graphql
"""
Common interface for all expected mutation errors.
Clients can handle any error generically via this interface.
"""
interface Error {
  """
  Human-readable error message suitable for display.
  """
  message: String!

  """
  Machine-readable error code for programmatic handling.
  """
  code: String!
}

type EmailAlreadyInUseError implements Error {
  message: String!
  code: String!  # "EMAIL_ALREADY_IN_USE"

  """
  The email address that is already taken.
  """
  email: Email!
}

type UserNotFoundError implements Error {
  message: String!
  code: String!  # "USER_NOT_FOUND"

  """
  The user identifier that could not be found.
  """
  userId: UserId!
}

type NotAuthorizedError implements Error {
  message: String!
  code: String!  # "NOT_AUTHORIZED"

  """
  The specific permission that was missing.
  """
  requiredPermission: String
}
```

### Payload Union

```graphql
type ChangeUserEmailSuccess {
  """
  The updated user with new email.
  """
  user: User!
}

union ChangeUserEmailPayload =
    ChangeUserEmailSuccess
  | EmailAlreadyInUseError
  | UserNotFoundError
  | NotAuthorizedError
```

### Client Usage

```graphql
mutation ChangeEmail($input: ChangeUserEmailInput!) {
  changeUserEmail(input: $input) {
    ... on ChangeUserEmailSuccess {
      user { id email }
    }
    ... on EmailAlreadyInUseError {
      message
      email
    }
    ... on Error {
      message
      code
    }
  }
}
```

---

## Field-Level Validation

For mutations with complex inputs, provide field-level error reporting. Include a validation error type in the payload union. Field errors identify the exact input path that failed.

Forms need to display errors next to specific fields. "Invalid input" isn't actionable — users need to know what to fix.

```graphql
type ValidationError implements Error {
  message: String!
  code: String!  # "VALIDATION_ERROR"

  """
  Individual field validation failures.
  """
  fieldErrors: [FieldError!]!
}

type FieldError {
  """
  Path to the invalid field in the input, e.g., ["address", "zipCode"]
  """
  path: [String!]!

  """
  Human-readable error message for this field.
  """
  message: String!

  """
  Machine-readable validation code, e.g., "REQUIRED", "TOO_LONG", "INVALID_FORMAT"
  """
  code: String!
}

union CreateAccountPayload =
    CreateAccountSuccess
  | ValidationError
  | EmailAlreadyInUseError
```

### Example Response

```json
{
  "data": {
    "createAccount": {
      "__typename": "ValidationError",
      "message": "Please fix the following errors",
      "code": "VALIDATION_ERROR",
      "fieldErrors": [
        {
          "path": ["password"],
          "message": "Password must be at least 8 characters",
          "code": "TOO_SHORT"
        },
        {
          "path": ["profile", "phoneNumber"],
          "message": "Invalid phone number format",
          "code": "INVALID_FORMAT"
        }
      ]
    }
  }
}
```

---

## GraphQL Errors vs Payload Errors

Use **payload errors** for expected business failures. Use **GraphQL errors** only for unexpected server failures (5xx equivalent).

Expected errors are part of the API contract — model them in the schema. GraphQL errors are for "this shouldn't happen" scenarios. Clients can handle payload errors exhaustively; GraphQL errors require generic fallbacks.

| Scenario | Mechanism | Example |
| --- | --- | --- |
| Validation failure | Payload union | `ValidationError` |
| Business rule violation | Payload union | `InsufficientFundsError` |
| Resource not found | Payload union | `UserNotFoundError` |
| Authorization denied | Payload union | `NotAuthorizedError` |
| Authentication failure | GraphQL error | User not logged in |
| Database outage | GraphQL error | Connection failed |
| Bug in resolver | GraphQL error | Null pointer, etc. |
