# MessageFlow API

> Enterprise-grade REST API for a multi-tenant messaging backend with idempotent provider webhook processing, unidirectional status progression, concurrency-safe row locking, and deterministic pagination.

Built with **Node.js, Express, TypeScript, PostgreSQL, and Prisma ORM**.

---

## Table of Contents

- [1. Architecture & Design Highlights](#1-architecture--design-highlights)
- [2. Quickstart & Installation](#2-quickstart--installation)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Database Setup with Docker Compose](#database-setup-with-docker-compose)
  - [Running Migrations](#running-migrations)
  - [Starting the API Server](#starting-the-api-server)
- [3. Running Automated Tests](#3-running-automated-tests)
- [4. Interactive API Documentation (Swagger / OpenAPI)](#4-interactive-api-documentation-swagger--openapi)
- [5. API Reference & Sample Requests](#5-api-reference--sample-requests)
  - [Health Check](#health-check)
  - [Create Message](#create-message)
  - [Get Single Message](#get-single-message)
  - [Get Conversation Messages (Cursor Pagination)](#get-conversation-messages-cursor-pagination)
  - [Provider Webhook (Idempotent Event Ingestion)](#provider-webhook-idempotent-event-ingestion)
- [6. System Design Notes](#6-system-design-notes)
  - [A. Idempotency & Deduplication Strategy](#a-idempotency--deduplication-strategy)
  - [B. Status Progression vs. Timestamp Recording](#b-status-progression-vs-timestamp-recording)
  - [C. Concurrency & Race Condition Elimination](#c-concurrency--race-condition-elimination)
  - [D. Multi-Tenant Scoping & Isolation](#d-multi-tenant-scoping--isolation)
  - [E. High-Throughput & Production Architecture](#e-high-throughput--production-architecture)
- [7. Project Layout](#7-project-layout)

---

## 1. Architecture & Design Highlights

```
                              +-------------------------+
                              |   Client Applications   |
                              +-------------------------+
                                  |                 |
                POST /messages    |                 | GET /messages/:id
                (x-tenant-id)     |                 | GET /conversations/:id/messages
                                  v                 v
                        +------------------------------------+
                        |         MessageFlow API            |
                        |     (Node.js + Express + TS)       |
                        +------------------------------------+
                                  ^                 |
                                  |                 | Prisma Client (ACID Tx + Row Lock)
                POST /webhooks    |                 v
                (Provider Events) |     +-------------------------+
                                  |     |      PostgreSQL         |
                                  +-----| - messages              |
                      External Provider | - provider_events       |
                                        +-------------------------+
```

1. **Unidirectional Status Progression**: Message lifecycle transitions strictly forward (`QUEUED` $\to$ `SENT` $\to$ `DELIVERED` $\to$ `READ`). Out-of-order events (e.g. `DELIVERED` before `SENT`) advance the status without allowing delayed events to move the status backward.
2. **Independent Timestamp Recording**: Event timestamps (`sentAt`, `deliveredAt`, `readAt`, `failedAt`) are decoupled from status progression. An out-of-order `SENT` arriving after `DELIVERED` retains `DELIVERED` status but faithfully records `sentAt`.
3. **Atomic Concurrency Protection**: Webhook ingestion executes within an ACID transaction (`prisma.$transaction`) with pessimistic row locking (`SELECT ... FOR UPDATE`), preventing lost updates and race conditions during simultaneous webhook delivery.
4. **Resilient Idempotency**: Fast-path lookup combined with PostgreSQL unique constraint enforcement on `provider_events.event_id` ensures duplicate webhook retries return an idempotent `200 OK` (`applied: false`) without throwing 500 errors.
5. **Strict Multi-Tenant Scoping**: All message access endpoints require `x-tenant-id` and scope database queries to the requesting tenant. Cross-tenant access attempts return `404 Not Found`.
6. **Deterministic Pagination**: Compound cursor `(createdAt, id)` encoded in Base64 provides stable chronological ordering immune to timestamp collisions.
7. **Privacy-Preserving Logging**: Structured request logger masks recipient phone numbers (`to`) and redacts message text (`text`) to prevent leaking PII into log sinks.

---

## 2. Quickstart & Installation

### Prerequisites
- **Node.js**: v20+ or v22+ / v24+
- **npm**: v10+
- **Docker & Docker Compose** (or local PostgreSQL 16+ instance)

### Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default `.env` configuration:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/messageflow_db?schema=public"
```

### Database Setup with Docker Compose
Start PostgreSQL 16 in the background:
```bash
docker compose up -d
```

### Running Migrations
Install dependencies and apply Prisma migrations:
```bash
npm install
npx prisma migrate dev --name init
```

### Starting the API Server
Development mode (with auto-reload):
```bash
npm run dev
```

Production build and execution:
```bash
npm run build
npm start
```
The server will start listening on port `3000` (or `PORT` specified in `.env`).

---

## 3. Running Automated Tests

MessageFlow includes a comprehensive suite of unit and integration tests covering:
- Happy paths for message creation and status retrieval.
- Multi-tenant isolation enforcement.
- Out-of-order webhook delivery and independent timestamp preservation.
- Simultaneous concurrent webhook ingestion (`Promise.all` stress testing).
- Strict idempotency and duplicate event suppression.
- Input validation (E.164 phone formats, text length limits, enums).
- Cursor pagination stability.

Run tests:
```bash
npm test
```

Generate test coverage report:
```bash
npm run test:coverage
```

---

## 4. Interactive API Documentation (Swagger / OpenAPI)

MessageFlow API includes built-in interactive Swagger UI documentation and standard OpenAPI 3.0.3 specification JSON covering all main endpoints:

- **Interactive Swagger UI**: [http://localhost:3001/api-docs](http://localhost:3001/api-docs) (or [http://localhost:3001/docs](http://localhost:3001/docs))
- **OpenAPI 3.0.3 Spec JSON**: [http://localhost:3001/api-docs.json](http://localhost:3001/api-docs.json)
- **Ready-to-Import Postman Collection**: [`MessageFlow_API.postman_collection.json`](./MessageFlow_API.postman_collection.json)

### Endpoints Documented in Swagger:
| Method | Endpoint | Description | Auth Header |
|---|---|---|---|
| `GET` | `/health` | Service and PostgreSQL health probe | None |
| `POST` | `/api/v1/messages` | Create and queue message | `x-tenant-id` |
| `GET` | `/api/v1/messages/{messageId}` | Retrieve message details & timestamps | `x-tenant-id` |
| `GET` | `/api/v1/conversations/{conversationId}/messages` | Paginated conversation history | `x-tenant-id` |
| `POST` | `/api/v1/webhooks/provider` | Idempotent delivery webhook ingestion | None |

You can test every endpoint directly inside the Swagger UI browser interface by clicking **"Authorize"** and entering a tenant identifier (such as `tenant-alpha`).

---

## 5. API Reference & Sample Requests

### Health Check
**Endpoint**: `GET /health`

**cURL**:
```bash
curl -X GET http://localhost:3000/health
```

**Response `200 OK`**:
```json
{
  "status": "ok",
  "timestamp": "2026-10-24T11:00:00.000Z",
  "services": {
    "database": "up"
  }
}
```

---

### Create Message
**Endpoint**: `POST /api/v1/messages`  
**Headers**: `x-tenant-id: tenant-alpha`, `Content-Type: application/json`

**cURL**:
```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "x-tenant-id: tenant-alpha" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-alpha",
    "conversationId": "conv-100",
    "to": "+919876543210",
    "text": "Your Order #4567 has shipped."
  }'
```

**Response `201 Created`**:
```json
{
  "id": "c19a4e82-20c2-48f8-b394-814cb91dd78e",
  "tenantId": "tenant-alpha",
  "conversationId": "conv-100",
  "to": "+919876543210",
  "text": "Your Order #4567 has shipped.",
  "status": "QUEUED",
  "queuedAt": "2026-10-24T11:00:00.000Z",
  "createdAt": "2026-10-24T11:00:00.000Z"
}
```

---

### Get Single Message
**Endpoint**: `GET /api/v1/messages/:messageId`  
**Headers**: `x-tenant-id: tenant-alpha`

**cURL**:
```bash
curl -X GET http://localhost:3000/api/v1/messages/c19a4e82-20c2-48f8-b394-814cb91dd78e \
  -H "x-tenant-id: tenant-alpha"
```

**Response `200 OK`**:
```json
{
  "id": "c19a4e82-20c2-48f8-b394-814cb91dd78e",
  "tenantId": "tenant-alpha",
  "conversationId": "conv-100",
  "to": "+919876543210",
  "text": "Your Order #4567 has shipped.",
  "status": "DELIVERED",
  "queuedAt": "2026-10-24T11:00:00.000Z",
  "sentAt": "2026-10-24T11:05:00.000Z",
  "deliveredAt": "2026-10-24T11:15:00.000Z",
  "readAt": null,
  "failedAt": null,
  "createdAt": "2026-10-24T11:00:00.000Z",
  "updatedAt": "2026-10-24T11:15:00.000Z"
}
```

*Note: Attempting to query this message with `x-tenant-id: tenant-beta` returns `404 Not Found`.*

---

### Get Conversation Messages (Cursor Pagination)
**Endpoint**: `GET /api/v1/conversations/:conversationId/messages?limit=20&cursor=...`  
**Headers**: `x-tenant-id: tenant-alpha`

**cURL**:
```bash
curl -X GET "http://localhost:3000/api/v1/conversations/conv-100/messages?limit=20" \
  -H "x-tenant-id: tenant-alpha"
```

**Response `200 OK`**:
```json
{
  "data": [
    {
      "id": "c19a4e82-20c2-48f8-b394-814cb91dd78e",
      "tenantId": "tenant-alpha",
      "conversationId": "conv-100",
      "to": "+919876543210",
      "text": "Your Order #4567 has shipped.",
      "status": "DELIVERED",
      "queuedAt": "2026-10-24T11:00:00.000Z",
      "sentAt": "2026-10-24T11:05:00.000Z",
      "deliveredAt": "2026-10-24T11:15:00.000Z",
      "readAt": null,
      "failedAt": null,
      "createdAt": "2026-10-24T11:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "hasMore": false,
    "nextCursor": null
  }
}
```

---

### Provider Webhook (Idempotent Event Ingestion)
**Endpoint**: `POST /api/v1/webhooks/provider`  
**Headers**: `Content-Type: application/json`

**cURL (First Ingestion)**:
```bash
curl -X POST http://localhost:3000/api/v1/webhooks/provider \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-001",
    "messageId": "c19a4e82-20c2-48f8-b394-814cb91dd78e",
    "status": "DELIVERED",
    "occurredAt": "2026-10-24T11:15:00.000Z"
  }'
```

**Response `200 OK` (Processed)**:
```json
{
  "success": true,
  "status": "processed",
  "eventId": "evt-001",
  "messageId": "c19a4e82-20c2-48f8-b394-814cb91dd78e",
  "applied": true
}
```

**cURL (Duplicate Retry)**:
```bash
# Sending identical eventId a second time
curl -X POST http://localhost:3000/api/v1/webhooks/provider \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt-001",
    "messageId": "c19a4e82-20c2-48f8-b394-814cb91dd78e",
    "status": "DELIVERED",
    "occurredAt": "2026-10-24T11:15:00.000Z"
  }'
```

**Response `200 OK` (Duplicate - Idempotent)**:
```json
{
  "success": true,
  "status": "duplicate",
  "eventId": "evt-001",
  "messageId": "c19a4e82-20c2-48f8-b394-814cb91dd78e",
  "applied": false
}
```

---

## 6. System Design Notes

### A. Idempotency & Deduplication Strategy
External webhook senders guarantee *at-least-once delivery*, causing duplicate events during network timeouts and retries.
- We maintain a dedicated `provider_events` audit table with a unique constraint on `event_id`.
- The webhook processing pipeline performs a fast pre-check on `event_id`.
- If two identical events arrive concurrently, PostgreSQL's unique constraint triggers Prisma error `P2002`. The service intercepts this error and gracefully translates it into an idempotent `200 OK` (`applied: false`), preventing unhandled server crashes and informing the provider that the event is acknowledged.

### B. Status Progression vs. Timestamp Recording
Real-world delivery networks frequently deliver events out of order.
- **Progression Logic**: We assign monotonic ranks to message progression:
  $$\text{QUEUED (0)} < \text{SENT (1)} < \text{DELIVERED (2)} < \text{READ (3)}$$
  A message's current status only advances if the incoming status rank is higher than the current rank.
- **Timestamp Decoupling**: If `DELIVERED` arrives first, status advances to `DELIVERED` and `deliveredAt` is recorded. When a delayed `SENT` event arrives later, status remains `DELIVERED` (no backward regression), but `sentAt` is updated with the earlier timestamp.
- **Failure Rules**: `FAILED` can only transition from `QUEUED` or `SENT`. If a message has reached `DELIVERED` or `READ`, it cannot subsequently transition to `FAILED`.

### C. Concurrency & Race Condition Elimination
When multiple webhooks for the same message hit parallel API instances:
- Operations run inside `prisma.$transaction(async (tx) => { ... })`.
- A pessimistic row lock (`SELECT id FROM messages WHERE id = $1 FOR UPDATE`) serializes updates on that message row.
- Competing transactions wait for the lock and evaluate their state progression against the most recent committed state.

### D. Multi-Tenant Scoping & Isolation
- For this service, multi-tenancy is simulated via the `x-tenant-id` HTTP header representing authenticated tenant context.
- In production, this would be extracted from a cryptographically signed JWT or mutual TLS certificate.
- Every client query (`POST /messages`, `GET /messages/:id`, `GET /conversations/:id/messages`) strictly enforces `tenant_id` at the database query level, preventing cross-tenant data leakage.

### E. High-Throughput & Production Architecture
For scaling to millions of messages and webhooks per day:
1. **Asynchronous Buffer / Broker**: Replace immediate synchronous webhook execution with an ingestion queue using **Apache Kafka** or **AWS SQS**. The API endpoint immediately writes the raw payload to Kafka partitioned by `messageId` and returns `202 Accepted` in $< 10\text{ms}$.
2. **Key-Partitioned Consumers**: By partitioning by `messageId`, all events for a given message are consumed sequentially by the same worker instance, completely eliminating cross-worker row-lock contention.
3. **Dead-Letter Queue (DLQ)**: Poison pills and malformed events are automatically routed to a DLQ after exponential backoff retries.
4. **Database Sharding**: Partition PostgreSQL tables by `tenant_id` using Citus or horizontal tenant-based database routing.

---

## 7. Project Layout

```
messageflow-api/
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules
├── docker-compose.yml        # PostgreSQL 16 container definition
├── package.json              # Dependencies and NPM scripts
├── tsconfig.json             # TypeScript configuration
├── prisma/
│   ├── schema.prisma         # Prisma data models, indexes, and constraints
│   └── migrations/           # Versioned PostgreSQL migration scripts
├── src/
│   ├── server.ts             # Application entrypoint with graceful shutdown
│   ├── app.ts                # Express application configuration & Swagger mount
│   ├── config/
│   │   ├── env.ts            # Environment variables configuration
│   │   └── swagger.ts        # OpenAPI 3.0.3 specification for Swagger UI
│   ├── db/
│   │   └── prisma.ts         # PrismaClient singleton
│   ├── middlewares/
│   │   ├── tenant.middleware.ts     # Multi-tenant isolation enforcement
│   │   ├── validation.middleware.ts # Zod schema validator
│   │   ├── logging.middleware.ts    # Privacy-preserving request logging
│   │   └── error.middleware.ts      # Centralized error handler
│   ├── modules/
│   │   ├── messages/
│   │   │   ├── messages.controller.ts  # Controller for message endpoints
│   │   │   ├── messages.routes.ts      # Routes for /messages & /conversations
│   │   │   ├── messages.service.ts     # Scoped logic & cursor pagination
│   │   │   └── messages.validator.ts   # Zod validation schemas
│   │   ├── webhooks/
│   │   │   ├── webhooks.controller.ts  # Controller for webhook ingestion
│   │   │   ├── webhooks.routes.ts      # Routes for /webhooks
│   │   │   ├── webhooks.service.ts     # Atomic transaction & state machine
│   │   │   └── webhooks.validator.ts   # Zod validation schemas
│   │   └── health/
│   │       ├── health.controller.ts    # Controller for health probe
│   │       └── health.routes.ts        # Routes for /health
│   └── utils/
│       ├── cursor.util.ts           # Compound (createdAt, id) cursor codec
│       └── logger.util.ts           # Log redaction & masking
├── scripts/
│   └── test-api.js                  # Automated 44-assertion verification suite
├── test/
│   ├── app.test.ts                  # Health & basic route tests
│   ├── messages.test.ts             # Creation, retrieval, and pagination tests
│   ├── idempotency.test.ts          # Deduplication tests
│   ├── out-of-order.test.ts         # Status progression vs timestamp tests
│   ├── concurrency.test.ts          # Parallel webhook execution tests
│   └── test-utils.ts                # Test cleanup helpers
├── MessageFlow_API.postman_collection.json # Ready-to-import Postman Collection
├── requests.http             # Visual VS Code / IntelliJ HTTP request samples
└── README.md                 # Complete documentation & design note
```
