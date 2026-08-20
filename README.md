# DANVIC API

TypeScript and Express LMS API with admin/author/student authentication, free and Paystack-paid
courses, scheduled access, Cloudflare R2 uploads, BullMQ jobs, audit logging, pooled MongoDB/Redis
connections, and layered dependency injection.

## Setup

Requirements: Node.js 20.19 or newer, MongoDB, Redis, and Yarn 1.x.

```sh
cp .env.example .env
yarn install
yarn dev
```

For production:

```sh
yarn validate
yarn build
NODE_ENV=production yarn start
```

## Architecture

```text
src/
├── application/
│   └── startup.ts
├── entities/
│   ├── interfaces/
│   └── models/
└── infrastructure/
    ├── container.ts
    ├── database/
    ├── di/
    ├── http/
    ├── jobs/
    ├── logging/
    ├── repository/
    ├── storage/
    ├── validation/
    └── security/
```

- Entity interfaces define the contracts used by the application layer.
- Infrastructure contains third-party adapters for Pino, Express, Mongoose, Redis, password
  hashing, JWT, TOTP, BullMQ, Resend, Joi, and Cloudflare R2.
- `infrastructure/di/tokens.ts` declares TypeDI `Token<T>` identifiers for interface-backed
  dependencies.
- `infrastructure/container.ts` is the composition root: TypeDI factories initialize concrete
  adapters once and resolve them as singletons.
- TypeDI injects repositories and authentication/email contracts into the application services.
  Application code never imports TypeDI or an infrastructure implementation directly.
- MongoDB uses Mongoose's native pool and Redis uses the official client's native pool. Both
  default to a maximum of 20 connections.

## Application lifecycle

- The infrastructure container configures and owns the Express HTTP server.
- `services.ts` starts MongoDB, Redis, and the BullMQ email/activity workers in dependency order and
  closes them in reverse order.
- `init.ts` is the executable entry point. It starts the data services before HTTP begins
  listening, ensures a super admin exists, and handles graceful `SIGINT`/`SIGTERM` shutdown.

Both `yarn dev` and `yarn start` run `init.ts` (compiled to `dist/init.js` in production).

## HTTP response contract

Every JSON endpoint returns one stable envelope. The HTTP status code is authoritative and the
envelope's numeric `status` always repeats that same value for clients that persist or proxy the
body.

Successful response:

```json
{
  "success": true,
  "status": 200,
  "message": "Request completed successfully",
  "data": { "courses": [] },
  "error": null
}
```

Error response:

```json
{
  "success": false,
  "status": 404,
  "message": "Endpoint not found: GET /missing",
  "data": null,
  "error": { "code": "ENDPOINT_NOT_FOUND" }
}
```

The fields have fixed responsibilities:

- `success` is the only success/error discriminator.
- `status` mirrors the actual HTTP status; clients reject a response if the two disagree.
- `message` is safe, human-readable guidance and must not contain stack traces or secrets.
- `data` contains the endpoint result on success and is always `null` on failure.
- `error` is `null` on success. On failure it contains a stable machine-readable `code` and may
  contain structured `details`; clients must branch on `code`, not parse `message`.

The response middleware wraps all Express JSON output, including `/health`, validation failures,
application errors, malformed JSON, unknown-route 404s, and unexpected 500s. Operations that used
to return `204 No Content` return `200 OK` with this envelope because HTTP forbids content on a 204
response. The public certificate PDF endpoint is intentionally a binary `application/pdf`
representation rather than JSON; any JSON error produced before streaming the file still uses the
envelope.

All three backend-for-frontend applications forward this wire format. Their shared
`@danvic/api-client` parser validates the envelope and status match, returns `data` to UI code, and
throws `ApiClientError` with the HTTP `status`, machine `code`, optional `details`, and safe
`message`.

## Logging

`src/infrastructure/logging/pino.ts` implements the application-facing `Logger` contract. The
TypeDI container exports its initialized singleton. Use `logger.debug`, `logger.info`,
`logger.warn`, and `logger.error`. The minimum level is controlled by `LOG_LEVEL`, and common
credential fields are redacted.

## Super-admin bootstrap

Before the HTTP server starts, the admin application service checks for an existing super admin. If
one exists it initializes any missing security fields. Otherwise it hashes the configured password
and creates the initial account with all permissions.

Set these values in the runtime environment:

```sh
SUPER_ADMIN_FIRST_NAME=Super
SUPER_ADMIN_LAST_NAME=Admin
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=replace-with-a-secure-password
```

The first successful password login to the super-admin account returns a short-lived
`two-factor-setup` token instead of an access token. The caller must generate and confirm a TOTP
setup before an access token can be issued. Every later login requires a TOTP challenge. Successful
TOTP time steps are atomically recorded so a code cannot be used twice.

## Admin HTTP API

Challenge/setup tokens and access tokens are sent as `Authorization: Bearer <token>` where noted.

| Method | Endpoint                      | Authentication                  | Purpose                                                            |
| ------ | ----------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| POST   | `/admin/auth/login`           | Public                          | Password login; returns access, 2FA challenge, or 2FA setup status |
| POST   | `/admin/auth/2fa/setup`       | 2FA setup token                 | Generate an authenticator secret, URI, and QR data URL             |
| POST   | `/admin/auth/2fa/confirm`     | 2FA setup token                 | Confirm setup and issue an access token                            |
| POST   | `/admin/auth/2fa/verify`      | Login challenge token           | Consume a TOTP code and issue an access token                      |
| POST   | `/admin/auth/forgot-password` | Public                          | Queue a one-time reset code email                                  |
| POST   | `/admin/auth/reset-password`  | Public                          | Consume the reset code and replace the password                    |
| POST   | `/admin/auth/update-password` | Access token                    | Verify and replace the current password                            |
| GET    | `/admin/auth/me`              | Access token                    | Return the authenticated admin profile                             |
| POST   | `/admin/invitations`          | Access token + `invite_admin`   | Invite 1–50 unique email addresses                                 |
| GET    | `/admin/invitations`          | Access token + `invite_admin`   | List invitation audit records                                      |
| POST   | `/admin/invitations/accept`   | Public invitation token         | Create the invited admin account                                   |
| POST   | `/admin/author-invitations`   | Access token + `invite_author`  | Invite 1–50 author email addresses                                 |
| GET    | `/admin/author-invitations`   | Access token + `invite_author`  | List author invitation records                                     |
| POST   | `/admin/student-invitations`  | Access token + `invite_student` | Invite students to create an account                               |
| GET    | `/admin/student-invitations`  | Access token + `invite_student` | List student invitations sent by the admin                         |

Access-token middleware reloads the admin from MongoDB, checks disablement and token version, and
uses current database permissions rather than trusting possibly stale JWT permissions. Password
changes increment the token version and invalidate existing access tokens. Public authentication
operations and invitation sending also use shared Redis fixed-window rate limits.

## Author and course API

Authors are created through invitation acceptance. Author TOTP is optional: login immediately
returns an access token when it is disabled and a short-lived TOTP challenge when enabled.

| Method | Endpoint                                 | Authentication      | Purpose                                     |
| ------ | ---------------------------------------- | ------------------- | ------------------------------------------- |
| POST   | `/author/invitations/accept`             | Public token        | Accept an author invitation                 |
| POST   | `/author/auth/login`                     | Public              | Author password login                       |
| POST   | `/author/auth/2fa/setup`                 | Author access token | Begin optional TOTP setup                   |
| POST   | `/author/auth/2fa/confirm`               | Author access token | Confirm optional TOTP setup                 |
| POST   | `/author/auth/2fa/verify`                | Challenge token     | Verify TOTP and issue an access token       |
| GET    | `/author/auth/me`                        | Author access token | Return the authenticated author profile     |
| GET    | `/author/courses`                        | Author access token | List courses created by this author         |
| POST   | `/author/courses`                        | Author access token | Create course, modules, and attachments     |
| POST   | `/author/courses/:courseId/modules`      | Owning author       | Add one module                              |
| POST   | `/author/courses/:courseId/attachments`  | Owning author       | Add one uploaded attachment                 |
| POST   | `/author/uploads/sign`                   | Author access token | Generate an R2 signed PUT URL               |
| GET    | `/courses`                               | Public              | List courses that are currently available   |
| GET    | `/courses/:courseId`                     | Public              | Preview course outline and material names   |
| POST   | `/author/student-invitations`            | Author access token | Invite students to an owned course          |
| GET    | `/author/student-invitations`            | Author access token | List student invitations sent by the author |
| GET    | `/author/courses/:courseId/participants` | Owning author       | View participant module completion          |
| GET    | `/author/payments`                       | Author access token | View transaction logs for owned courses     |

## Student authentication and participation

Students can only be created through a course-specific invitation. Two-factor authentication is
mandatory: the first password login issues a setup token, and later logins issue a TOTP challenge.
Course metadata remains publicly discoverable, but modules, attachments, downloads, enrollment,
and progress require an authenticated student.

| Method | Endpoint                                                        | Authentication          | Purpose                                  |
| ------ | --------------------------------------------------------------- | ----------------------- | ---------------------------------------- |
| POST   | `/student/invitations/accept`                                   | Public invitation token | Create an invited student account        |
| POST   | `/student/invitations/accept-existing`                          | Student access token    | Accept another student invitation        |
| POST   | `/student/auth/login`                                           | Public                  | Start mandatory student 2FA              |
| POST   | `/student/auth/2fa/setup`                                       | 2FA setup token         | Generate authenticator setup             |
| POST   | `/student/auth/2fa/confirm`                                     | 2FA setup token         | Confirm setup and issue access           |
| POST   | `/student/auth/2fa/verify`                                      | Login challenge token   | Verify TOTP and issue access             |
| POST   | `/student/auth/forgot-password`                                 | Public                  | Email a one-time reset code              |
| POST   | `/student/auth/reset-password`                                  | Public                  | Consume reset code and change password   |
| POST   | `/student/courses/:courseId/enroll`                             | Student + free course   | Enroll idempotently                      |
| PUT    | `/student/courses/:courseId/bookmark`                           | Student access token    | Toggle 30/10-minute live reminders       |
| GET    | `/student/course-bookmarks`                                     | Student access token    | List active scheduled-course bookmarks  |
| POST   | `/student/courses/:courseId/payments/paystack/initialize`       | Student + paid course   | Create or resume a Paystack checkout     |
| GET    | `/student/payments`                                             | Student access token    | List saved cards and transaction history |
| POST   | `/student/payment-methods/paystack/setup`                       | Student access token    | Start hosted card verification           |
| DELETE | `/student/payment-methods/:paymentMethodId`                     | Student access token    | Deactivate a reusable authorization      |
| POST   | `/payments/paystack/verify`                                     | Public reference        | Verify callback and grant paid access    |
| POST   | `/payments/paystack/webhook`                                    | Paystack signature      | Process `charge.success` idempotently    |
| GET    | `/student/courses/:courseId`                                    | Enrolled student        | Read course content and progress         |
| POST   | `/student/courses/:courseId/modules/:moduleId/complete`         | Enrolled student        | Record sequential module completion      |
| GET    | `/student/courses/:courseId/attachments/:attachmentId/download` | Enrolled student        | Generate a short-lived download URL      |
| GET    | `/student/courses/:courseId/certificate`                        | Completed student       | Issue or retrieve the course certificate |
| POST   | `/student/certificates/:certificateId/email`                    | Certificate owner       | Queue PDF certificate email delivery     |
| GET    | `/certificates/:certificateNumber`                              | Public                  | Verify certificate details and validity  |
| GET    | `/certificates/:certificateNumber/pdf`                          | Public                  | View or download the certificate PDF     |

Courses have `name`, `durationMinutes`, `type` (`live` or `premade`), `scheduledAt`, `accessType`
(`free` or `paid`), and integer `priceKobo`. Free courses must have a zero price; paid courses must
cost at least one kobo. A schedule is mandatory for live courses and optional for premade courses.
Any scheduled course returns `COURSE_NOT_AVAILABLE`, including its ISO availability date, until
that time. Course mutations are author-only, and later module/attachment additions require course
ownership.

## Paystack payments

Set `PAYSTACK_SECRET_KEY` only on the API server. The browser never receives it. The API creates a
unique local payment record before calling Paystack, sends integer kobo and `NGN`, and returns only
Paystack's authorization URL/access code to the learner frontend. Concurrent clicks reuse one
active checkout for the same learner and course.

The learner callback calls Paystack's server-side Verify Transaction endpoint. Access is granted
only when the stored and verified reference, successful status, amount, currency, and customer
email match. Fulfilment and enrollment are idempotent, so the callback and webhook can safely race
or be retried.

Every initialization creates a transaction-ledger record before the Paystack request. After
verification, the record includes the course ID, student ID, amount and fees in kobo, currency,
adapter, Paystack reference and safe provider identifiers, environment, payment channel, gateway
and processor responses, issuing bank, account name, card brand/type/last four digits, country,
timestamps, verification source, and refund state. Learners see their own ledger; authors see only
transactions for courses they own. PAN, CVV, PIN, OTP, and full bank account numbers are never
collected or stored.

### Reusable cards

For a new course checkout, a learner may opt in to saving the card. The checkout is restricted to
Paystack's card channel in that case. On a verified payment, the API saves the authorization only
when Paystack marks it reusable. Paystack's stable instrument `signature` deduplicates the same
card; a different signature creates a different saved card. New authorization codes for an
existing signature replace the old code.

The authorization code is encrypted with AES-256-GCM under the separately generated
`PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY`. The associated authorization email is retained because
Paystack requires the same email for later charges. Saved-card payments call Paystack's Charge
Authorization endpoint from the API and support Paystack's additional-authentication redirect when
the issuer challenges the charge.

DANVIC does not use Paystack's raw-card zero-amount endpoint because it requires DANVIC to collect
PAN/CVV and is restricted to PCI-DSS-approved integrations. The Payments page instead uses hosted
Paystack checkout for the documented NGN 50 initial card-authentication charge, then immediately
requests a full refund and follows refund webhook states. Refund settlement remains controlled by
Paystack and the issuing bank.

Configure this HTTPS webhook URL in the Paystack dashboard:

```text
https://your-api.example/payments/paystack/webhook
```

The webhook accepts `charge.success` only after validating the exact raw request body against the
`x-paystack-signature` HMAC-SHA512 header. It also records refund lifecycle events. Set
`STUDENT_APP_BASE_URL` to the public learner app URL; the API supplies
`${STUDENT_APP_BASE_URL}/api/payments/paystack/callback` per transaction.

Use `sk_test_...` while testing and replace it with the live secret only after the callback and
webhook URLs are deployed over HTTPS. `PAYSTACK_API_BASE_URL` is overrideable outside production
for isolated tests; production is locked to `https://api.paystack.co`.

Generate the authorization encryption key independently from the TOTP encryption key:

```sh
PAYSTACK_AUTHORIZATION_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Modules store their course relationship, order, title, and plain-text content. Attachments retain
the course relationship, denormalized course name, and R2 object path.

## Input validation

Every route uses strict Joi schemas for its body, path parameters, and query parameters. Type
coercion and unknown fields are disabled. Nested course structures, ULIDs, OTPs, invitation tokens,
email lists, dates, sizes, MIME types, and attachment paths use explicit allowlists. Fields defined
as plain text reject markup and control characters. Validation failures return `VALIDATION_ERROR`
without executing the application service.

## Activity auditing

Audit middleware records every completed HTTP request, including failed logins, password resets,
2FA attempts, invitations, uploads, and course changes. Records contain the known actor, action,
outcome, request method/path, status, IP, user agent, safe metadata, and timestamps. Passwords,
tokens, OTPs, bodies, and TOTP secrets are never recorded. A dedicated BullMQ worker persists audit
records with retries.

## Background email jobs

Password-reset codes, invitations, and certificate deliveries are added to a BullMQ queue. A
lifecycle-managed worker sends HTML email through Resend, attaches generated certificate PDFs,
retries failures five times with exponential backoff, records invitation send/failure state, and
closes gracefully during shutdown. Queue producers fail quickly if Redis is unavailable; the worker
uses a persistent Redis connection.

For BullMQ reliability, configure the queue Redis instance with `maxmemory-policy=noeviction`.

Required authentication/email configuration includes:

```sh
JWT_SECRET="$(openssl rand -hex 32)"
TOTP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
RESEND_API_KEY=re_replace_me
EMAIL_FROM="DANVIC <admin@your-verified-domain.example>"
ADMIN_APP_BASE_URL=https://admin.example.com
AUTHOR_APP_BASE_URL=https://authors.example.com
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-course-assets-bucket
```

Signed R2 URLs permit one `PUT` operation for 15 minutes and bind the allowed content type. The
browser uploads the raw file directly to the R2 S3 API URL with `PUT` and the same `Content-Type`
header used to create the signature. Configure the bucket CORS policy to allow the author
application's exact origin, the `PUT` method, and the `Content-Type` request header. The server
generates every object key under the authenticated author prefix. Attachment creation then uses the
returned `attachmentPath`; R2 `HEAD` verification confirms that the object exists, its content type
matches its generated extension, and its actual size is between one byte and 1 GiB. Available-course
attachments use five-minute signed `GET` URLs.

TOTP secrets are encrypted at rest with AES-256-GCM. Password-reset and invitation values are
stored as keyed hashes; password-reset codes expire after ten minutes and are atomically consumed.
Invitation audit records retain their creation, expiry, send, acceptance, and delivery-error state.

Application functions receive repository contracts rather than importing Mongo repositories:

```ts
import type { Repository } from './entities/interfaces/database'
import type { Author } from './entities/models/Author'

const findAuthor = (authors: Repository<Author>, email: string) => authors.findOne({ email })
```
