export interface SchemaColumn {
  name: string;
  type: string;
  constraints: string;
  description: string;
}

export interface SchemaTable {
  tableName: string;
  purpose: string;
  relationships: string[];
  columns: SchemaColumn[];
  indexes: string[];
}

export interface ApiEndpointSpec {
  id: string;
  resource: 'Auth & Users' | 'Events' | 'Tickets';
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  livePath: string;
  role: 'Public' | 'Attendee / Admin' | 'Admin / Host Only' | 'Owner / Admin';
  summary: string;
  description: string;
  requestExample?: string;
  responseExample: string;
  statusCodes: { code: number; label: string; condition: string }[];
}

export interface SdlcStage {
  stage: string;
  environment: string;
  objective: string;
  tooling: string[];
  steps: { title: string; detail: string; command: string }[];
  exitGate: string;
}

export const DATABASE_SCHEMA_TABLES: SchemaTable[] = [
  {
    tableName: 'users',
    purpose: 'Stores authenticated principals with hashed passwords and RBAC role assignments.',
    relationships: [
      '1 : N → events (host_id)',
      '1 : N → tickets (user_id)',
      '1 : N → waitlist_entries (user_id)',
    ],
    columns: [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Immutable user identifier' },
      { name: 'email', type: 'VARCHAR(255)', constraints: 'UNIQUE NOT NULL', description: 'Normalized lowercase login identifier' },
      { name: 'password_hash', type: 'TEXT', constraints: 'NOT NULL', description: 'Argon2id / bcrypt salted credential hash' },
      { name: 'full_name', type: 'VARCHAR(120)', constraints: 'NOT NULL', description: 'Display name on host rosters & tickets' },
      { name: 'role', type: 'user_role_enum', constraints: "NOT NULL DEFAULT 'ATTENDEE'", description: "Enum: 'ADMIN' | 'ATTENDEE'" },
      { name: 'organization', type: 'VARCHAR(120)', constraints: 'NULLABLE', description: 'Host venue or attendee company' },
      { name: 'created_at', type: 'TIMESTAMPTZ', constraints: 'NOT NULL DEFAULT NOW()', description: 'Account creation timestamp (UTC)' },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));',
    ],
  },
  {
    tableName: 'events',
    purpose: 'Stores hosted events, pricing, capacity ceilings, and real-time booked seat counters.',
    relationships: [
      'N : 1 → users (host_id)',
      '1 : N → tickets (event_id)',
      '1 : N → waitlist_entries (event_id)',
    ],
    columns: [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Unique event identifier' },
      { name: 'host_id', type: 'UUID', constraints: 'NOT NULL REFERENCES users(id) ON DELETE RESTRICT', description: 'Admin/Host owner FK' },
      { name: 'title', type: 'VARCHAR(180)', constraints: 'NOT NULL', description: 'Public event headline' },
      { name: 'category', type: 'VARCHAR(60)', constraints: 'NOT NULL', description: 'Filterable category (Engineering, Workshop, Culture)' },
      { name: 'venue', type: 'VARCHAR(180)', constraints: 'NOT NULL', description: 'Physical venue or virtual room location' },
      { name: 'starts_at', type: 'TIMESTAMPTZ', constraints: 'NOT NULL', description: 'Event start date/time in UTC' },
      { name: 'price_cents', type: 'INTEGER', constraints: 'NOT NULL CHECK (price_cents >= 0)', description: 'Ticket unit price in integer cents' },
      { name: 'capacity', type: 'INTEGER', constraints: 'NOT NULL CHECK (capacity > 0)', description: 'Maximum seat limit enforced by DB' },
      { name: 'booked_seats', type: 'INTEGER', constraints: 'NOT NULL DEFAULT 0 CHECK (booked_seats >= 0 AND booked_seats <= capacity)', description: 'Atomic counter preventing overbooking' },
      { name: 'status', type: 'event_status_enum', constraints: "NOT NULL DEFAULT 'PUBLISHED'", description: "Enum: 'PUBLISHED' | 'SOLD_OUT' | 'CANCELLED'" },
      { name: 'created_at', type: 'TIMESTAMPTZ', constraints: 'NOT NULL DEFAULT NOW()', description: 'Creation timestamp' },
    ],
    indexes: [
      'CREATE INDEX idx_events_status_starts ON events (status, starts_at);',
      'CREATE INDEX idx_events_host_id ON events (host_id);',
    ],
  },
  {
    tableName: 'tickets',
    purpose: 'Immutable booking ledger tracking seat allocations, payments, and cancellations.',
    relationships: [
      'N : 1 → events (event_id)',
      'N : 1 → users (user_id)',
      '1 : 1 → payment_transactions (ticket_id)',
    ],
    columns: [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Ticket primary key' },
      { name: 'booking_code', type: 'VARCHAR(24)', constraints: 'UNIQUE NOT NULL', description: 'Human-readable check-in reference (e.g. EL-9402)' },
      { name: 'event_id', type: 'UUID', constraints: 'NOT NULL REFERENCES events(id) ON DELETE CASCADE', description: 'Target event FK' },
      { name: 'user_id', type: 'UUID', constraints: 'NOT NULL REFERENCES users(id) ON DELETE RESTRICT', description: 'Attendee owner FK' },
      { name: 'quantity', type: 'INTEGER', constraints: 'NOT NULL CHECK (quantity BETWEEN 1 AND 10)', description: 'Number of reserved seats' },
      { name: 'total_price_cents', type: 'INTEGER', constraints: 'NOT NULL CHECK (total_price_cents >= 0)', description: 'Captured charge snapshot' },
      { name: 'status', type: 'ticket_status_enum', constraints: "NOT NULL DEFAULT 'CONFIRMED'", description: "Enum: 'CONFIRMED' | 'CANCELLED' | 'REFUNDED'" },
      { name: 'booked_at', type: 'TIMESTAMPTZ', constraints: 'NOT NULL DEFAULT NOW()', description: 'Booking commit timestamp' },
      { name: 'cancelled_at', type: 'TIMESTAMPTZ', constraints: 'NULLABLE', description: 'Populated when attendee/admin cancels' },
    ],
    indexes: [
      'CREATE INDEX idx_tickets_user_status ON tickets (user_id, status);',
      'CREATE INDEX idx_tickets_event_id ON tickets (event_id);',
    ],
  },
  {
    tableName: 'waitlist_entries',
    purpose: 'FIFO queue for sold-out events; auto-promoted inside the cancellation transaction.',
    relationships: [
      'N : 1 → events (event_id)',
      'N : 1 → users (user_id)',
    ],
    columns: [
      { name: 'id', type: 'UUID', constraints: 'PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Waitlist entry identifier' },
      { name: 'event_id', type: 'UUID', constraints: 'NOT NULL REFERENCES events(id) ON DELETE CASCADE', description: 'Sold-out event reference' },
      { name: 'user_id', type: 'UUID', constraints: 'NOT NULL REFERENCES users(id) ON DELETE CASCADE', description: 'Queued attendee reference' },
      { name: 'requested_seats', type: 'INTEGER', constraints: 'NOT NULL DEFAULT 1 CHECK (requested_seats >= 1)', description: 'Seats requested upon release' },
      { name: 'status', type: 'waitlist_status_enum', constraints: "NOT NULL DEFAULT 'WAITING'", description: "Enum: 'WAITING' | 'PROMOTED' | 'EXPIRED'" },
      { name: 'created_at', type: 'TIMESTAMPTZ', constraints: 'NOT NULL DEFAULT NOW()', description: 'FIFO ordering key' },
    ],
    indexes: [
      "CREATE UNIQUE INDEX uq_waitlist_active_user ON waitlist_entries (event_id, user_id) WHERE status = 'WAITING';",
      "CREATE INDEX idx_waitlist_fifo ON waitlist_entries (event_id, created_at ASC) WHERE status = 'WAITING';",
    ],
  },
];

export const POSTGRES_DDL_SQL = `-- PostgreSQL 16 Schema for EventLedger (FastAPI + SQLAlchemy / Alembic)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role_enum AS ENUM ('ADMIN', 'ATTENDEE');
CREATE TYPE event_status_enum AS ENUM ('PUBLISHED', 'SOLD_OUT', 'CANCELLED');
CREATE TYPE ticket_status_enum AS ENUM ('CONFIRMED', 'CANCELLED', 'REFUNDED');
CREATE TYPE waitlist_status_enum AS ENUM ('WAITING', 'PROMOTED', 'EXPIRED');

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    role          user_role_enum NOT NULL DEFAULT 'ATTENDEE',
    organization  VARCHAR(120),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));

CREATE TABLE events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title         VARCHAR(180) NOT NULL,
    category      VARCHAR(60) NOT NULL,
    venue         VARCHAR(180) NOT NULL,
    starts_at     TIMESTAMPTZ NOT NULL,
    price_cents   INTEGER NOT NULL CHECK (price_cents >= 0),
    capacity      INTEGER NOT NULL CHECK (capacity > 0),
    booked_seats  INTEGER NOT NULL DEFAULT 0 CHECK (booked_seats >= 0 AND booked_seats <= capacity),
    status        event_status_enum NOT NULL DEFAULT 'PUBLISHED',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_status_starts ON events (status, starts_at);

CREATE TABLE tickets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_code      VARCHAR(24) UNIQUE NOT NULL,
    event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
    status            ticket_status_enum NOT NULL DEFAULT 'CONFIRMED',
    booked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at      TIMESTAMPTZ
);
CREATE INDEX idx_tickets_user_status ON tickets (user_id, status);

CREATE TABLE waitlist_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_seats INTEGER NOT NULL DEFAULT 1 CHECK (requested_seats >= 1),
    status          waitlist_status_enum NOT NULL DEFAULT 'WAITING',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_waitlist_active_user
    ON waitlist_entries (event_id, user_id) WHERE status = 'WAITING';
CREATE INDEX idx_waitlist_fifo
    ON waitlist_entries (event_id, created_at ASC) WHERE status = 'WAITING';`;

export const DOCKER_COMPOSE_YAML = `services:
  postgres:
    image: postgres:16-alpine
    container_name: eventledger_pg
    environment:
      POSTGRES_DB: eventledger
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-dev_only_secret}
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
      - ./db/schema.sql:/docker-entrypoint-initdb.d/01_schema.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app_user -d eventledger"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: eventledger_redis
    ports:
      - "6379:6379"

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: eventledger_fastapi
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      DATABASE_URL: postgresql+asyncpg://app_user:dev_only_secret@postgres:5432/eventledger
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET: \${JWT_SECRET:-replace-in-prod}
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pg_data:`;

export const API_ENDPOINTS: ApiEndpointSpec[] = [
  {
    id: 'auth-register',
    resource: 'Auth & Users',
    method: 'POST',
    path: '/api/v1/auth/register',
    livePath: '/api/v1/auth/register',
    role: 'Public',
    summary: 'Register a new Attendee or Admin/Host user',
    description: 'Validates payload, hashes password with Argon2id/bcrypt, enforces unique email, and issues a signed JWT.',
    requestExample: JSON.stringify(
      {
        email: 'alex.rivera@example.com',
        password: 'secure-password-123',
        fullName: 'Alex Rivera',
        role: 'ATTENDEE',
        organization: 'Horizon Labs',
      },
      null,
      2
    ),
    responseExample: JSON.stringify(
      {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        token_type: 'bearer',
        user: { id: 'usr_a1b2c3d4', email: 'alex.rivera@example.com', role: 'ATTENDEE' },
      },
      null,
      2
    ),
    statusCodes: [
      { code: 201, label: 'Created', condition: 'User registered & JWT returned' },
      { code: 409, label: 'Conflict', condition: 'Email address already exists' },
      { code: 422, label: 'Unprocessable Entity', condition: 'Pydantic validation failure (short password / bad email)' },
    ],
  },
  {
    id: 'auth-login',
    resource: 'Auth & Users',
    method: 'POST',
    path: '/api/v1/auth/login',
    livePath: '/api/v1/auth/login',
    role: 'Public',
    summary: 'Authenticate user and issue JWT Bearer token',
    description: 'Verifies credentials against stored hash and returns a short-lived JWT containing sub, email, and role claims.',
    requestExample: JSON.stringify(
      {
        email: 'marcus.chen@attendee.io',
        password: 'attendee-pass-2026',
      },
      null,
      2
    ),
    responseExample: JSON.stringify(
      {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        token_type: 'bearer',
        user: { id: 'usr_att_01', role: 'ATTENDEE', fullName: 'Marcus Chen' },
      },
      null,
      2
    ),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Valid credentials, token issued' },
      { code: 401, label: 'Unauthorized', condition: 'Invalid email or password' },
    ],
  },
  {
    id: 'users-me',
    resource: 'Auth & Users',
    method: 'GET',
    path: '/api/v1/users/me',
    livePath: '/api/v1/users/me',
    role: 'Attendee / Admin',
    summary: 'Fetch current authenticated user profile',
    description: 'Extracts JWT via OAuth2PasswordBearer and returns sanitized profile metadata.',
    responseExample: JSON.stringify(
      {
        id: 'usr_att_01',
        email: 'marcus.chen@attendee.io',
        fullName: 'Marcus Chen',
        role: 'ATTENDEE',
      },
      null,
      2
    ),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Valid Bearer token' },
      { code: 401, label: 'Unauthorized', condition: 'Missing, malformed, or expired JWT' },
    ],
  },
  {
    id: 'users-list',
    resource: 'Auth & Users',
    method: 'GET',
    path: '/api/v1/users',
    livePath: '/api/v1/users',
    role: 'Admin / Host Only',
    summary: 'List registered platform accounts (RBAC protected)',
    description: 'Requires role == ADMIN; rejects Attendee tokens with 403 Forbidden.',
    responseExample: JSON.stringify({ items: [{ id: 'usr_admin_01', role: 'ADMIN' }], total: 3 }, null, 2),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Authenticated as ADMIN' },
      { code: 401, label: 'Unauthorized', condition: 'Not authenticated' },
      { code: 403, label: 'Forbidden', condition: 'Authenticated as ATTENDEE (insufficient role)' },
    ],
  },
  {
    id: 'events-list',
    resource: 'Events',
    method: 'GET',
    path: '/api/v1/events',
    livePath: '/api/v1/events',
    role: 'Public',
    summary: 'List published events with live remaining seat counts',
    description: 'Supports ?category=, ?status=, and ?q= query filters for catalog browsing.',
    responseExample: JSON.stringify(
      {
        items: [{ id: 'evt_sys_2026', title: 'Distributed Systems Summit', capacity: 120, bookedSeats: 118, availableSeats: 2 }],
        total: 4,
      },
      null,
      2
    ),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Returns paginated event catalog' },
    ],
  },
  {
    id: 'events-create',
    resource: 'Events',
    method: 'POST',
    path: '/api/v1/events',
    livePath: '/api/v1/events',
    role: 'Admin / Host Only',
    summary: 'Create a new hosted event with seat capacity',
    description: 'Protected by require_role("ADMIN"). Validates capacity > 0 and stores host_id from JWT.',
    requestExample: JSON.stringify(
      {
        title: 'API Resilience Workshop',
        category: 'Engineering',
        venue: 'Foundry Hall · Boston',
        startsAt: '2027-02-14T18:00:00.000Z',
        priceCents: 12500,
        capacity: 50,
      },
      null,
      2
    ),
    responseExample: JSON.stringify(
      { id: 'evt_92a1', title: 'API Resilience Workshop', capacity: 50, availableSeats: 50, status: 'PUBLISHED' },
      null,
      2
    ),
    statusCodes: [
      { code: 201, label: 'Created', condition: 'Event persisted by Admin/Host' },
      { code: 401, label: 'Unauthorized', condition: 'Missing or expired JWT' },
      { code: 403, label: 'Forbidden', condition: 'Caller has ATTENDEE role' },
      { code: 422, label: 'Unprocessable Entity', condition: 'Invalid capacity or missing required fields' },
    ],
  },
  {
    id: 'events-patch',
    resource: 'Events',
    method: 'PATCH',
    path: '/api/v1/events/{event_id}',
    livePath: '/api/v1/events/evt_sys_2026',
    role: 'Admin / Host Only',
    summary: 'Update event capacity, price, or title',
    description: 'Prevents lowering capacity below already booked_seats using a 409 Conflict guard.',
    requestExample: JSON.stringify({ capacity: 140 }, null, 2),
    responseExample: JSON.stringify({ id: 'evt_sys_2026', capacity: 140, bookedSeats: 118, availableSeats: 22 }, null, 2),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Event updated' },
      { code: 403, label: 'Forbidden', condition: 'Caller is not ADMIN' },
      { code: 404, label: 'Not Found', condition: 'Event ID does not exist' },
      { code: 409, label: 'Conflict', condition: 'New capacity < booked_seats' },
    ],
  },
  {
    id: 'events-delete',
    resource: 'Events',
    method: 'DELETE',
    path: '/api/v1/events/{event_id}',
    livePath: '/api/v1/events/evt_nonexistent',
    role: 'Admin / Host Only',
    summary: 'Delete an event (or cancel)',
    description: 'Admin-only deletion. Returns 404 when the target event ID does not exist.',
    responseExample: JSON.stringify({ deleted: true, id: 'evt_123' }, null, 2),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Event deleted' },
      { code: 403, label: 'Forbidden', condition: 'Caller is not ADMIN' },
      { code: 404, label: 'Not Found', condition: 'Event ID does not exist' },
    ],
  },
  {
    id: 'tickets-book',
    resource: 'Tickets',
    method: 'POST',
    path: '/api/v1/tickets',
    livePath: '/api/v1/tickets',
    role: 'Attendee / Admin',
    summary: 'Book ticket(s) with payment verification & row-level capacity lock',
    description: 'Acquires SELECT ... FOR UPDATE on events row, checks payment authorization (402), enforces capacity >= booked_seats + qty (409), and commits ticket.',
    requestExample: JSON.stringify(
      {
        eventId: 'evt_wrk_2026',
        quantity: 1,
        simulatePaymentFailure: false,
      },
      null,
      2
    ),
    responseExample: JSON.stringify(
      {
        ticket: { id: 'tkt_301', bookingCode: 'EL-5192', status: 'CONFIRMED', quantity: 1 },
        event: { id: 'evt_wrk_2026', availableSeats: 13 },
      },
      null,
      2
    ),
    statusCodes: [
      { code: 201, label: 'Created', condition: 'Payment captured & seats locked atomically' },
      { code: 401, label: 'Unauthorized', condition: 'Authentication required' },
      { code: 402, label: 'Payment Required', condition: 'Payment gateway declined / insufficient funds' },
      { code: 404, label: 'Not Found', condition: 'Event does not exist' },
      { code: 409, label: 'Conflict', condition: 'Event sold out (0 seats left) or insufficient seats' },
    ],
  },
  {
    id: 'tickets-list',
    resource: 'Tickets',
    method: 'GET',
    path: '/api/v1/tickets',
    livePath: '/api/v1/tickets',
    role: 'Attendee / Admin',
    summary: 'List tickets owned by current user (or all with ?scope=all for Admin)',
    description: 'Returns booking records with event metadata and cancellation timestamps.',
    responseExample: JSON.stringify({ items: [{ id: 'tkt_1001', bookingCode: 'EL-9402-SF', status: 'CONFIRMED' }], total: 2 }, null, 2),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Returns authorized ticket list' },
      { code: 401, label: 'Unauthorized', condition: 'Missing or invalid JWT' },
    ],
  },
  {
    id: 'tickets-cancel',
    resource: 'Tickets',
    method: 'PATCH',
    path: '/api/v1/tickets/{ticket_id}/cancel',
    livePath: '/api/v1/tickets/tkt_1001/cancel',
    role: 'Owner / Admin',
    summary: 'Cancel ticket, release seats atomically, and promote FIFO waitlist',
    description: 'Validates ownership, prevents double cancellation (409), decrements events.booked_seats, and promotes the oldest WAITING waitlist entry if seats match.',
    responseExample: JSON.stringify(
      {
        ticket: { id: 'tkt_1001', status: 'CANCELLED', cancelledAt: '2026-11-16T12:15:00Z' },
        promotedWaitlist: null,
      },
      null,
      2
    ),
    statusCodes: [
      { code: 200, label: 'OK', condition: 'Ticket cancelled & capacity restored' },
      { code: 403, label: 'Forbidden', condition: 'Caller does not own ticket and is not ADMIN' },
      { code: 404, label: 'Not Found', condition: 'Ticket ID not found' },
      { code: 409, label: 'Conflict', condition: 'Ticket is already cancelled' },
    ],
  },
  {
    id: 'events-waitlist',
    resource: 'Tickets',
    method: 'POST',
    path: '/api/v1/events/{event_id}/waitlist',
    livePath: '/api/v1/events/evt_sym_2026/waitlist',
    role: 'Attendee / Admin',
    summary: 'Join FIFO waitlist when an event is fully booked',
    description: 'Only permitted when availableSeats == 0; otherwise returns 409 instructing caller to book directly.',
    responseExample: JSON.stringify({ waitlistEntry: { id: 'wl_88', status: 'WAITING' } }, null, 2),
    statusCodes: [
      { code: 201, label: 'Created', condition: 'Added to FIFO waitlist' },
      { code: 404, label: 'Not Found', condition: 'Event not found' },
      { code: 409, label: 'Conflict', condition: 'Seats still available or user already waitlisted' },
    ],
  },
];

export const SDLC_PIPELINE_STAGES: SdlcStage[] = [
  {
    stage: '01. Local Development',
    environment: 'Dev (Docker Compose)',
    objective: 'Reproducible local environment with hot-reloading FastAPI, React Vite, and containerized PostgreSQL 16.',
    tooling: ['Docker Compose', 'FastAPI + Uvicorn', 'Alembic', 'React + Vite'],
    steps: [
      {
        title: 'Spin up Postgres & Redis containers',
        detail: 'Mount schema.sql into docker-entrypoint-initdb.d and verify pg_isready healthcheck.',
        command: 'docker compose up -d postgres redis',
      },
      {
        title: 'Apply versioned Alembic migrations',
        detail: 'Keep SQLAlchemy ORM models and PostgreSQL constraints synchronized via tracked migration revisions.',
        command: 'alembic upgrade head',
      },
      {
        title: 'Run FastAPI & React dev servers',
        detail: 'FastAPI serves OpenAPI docs at /docs while React proxies /api/v1/* requests locally.',
        command: 'uvicorn app.main:app --reload --port 8000',
      },
    ],
    exitGate: 'Pre-commit hooks pass (Ruff lint, Mypy type check, ESLint, TypeScript tsc --noEmit).',
  },
  {
    stage: '02. Automated Verification',
    environment: 'Test (CI Runner + Ephemeral DB)',
    objective: 'Verify RBAC boundaries, concurrent booking race conditions, and payment failure rollbacks before merge.',
    tooling: ['Pytest + httpx', 'Testcontainers (Postgres)', 'Locust / k6', 'GitHub Actions'],
    steps: [
      {
        title: 'Unit & Contract Tests (FastAPI TestClient)',
        detail: 'Assert 401/403 RBAC rules, 402 payment decline handling, and Pydantic schema contracts.',
        command: 'pytest tests/unit --cov=app --cov-fail-under=85',
      },
      {
        title: 'Concurrency & Overbooking Integration Tests',
        detail: 'Fire 50 parallel asyncio booking requests against a 10-seat event in Testcontainers Postgres to verify 10x 201 and 40x 409.',
        command: 'pytest tests/integration/test_capacity_locks.py -v',
      },
      {
        title: 'Container Image Build & Vulnerability Scan',
        detail: 'Build multi-stage immutable Docker images and scan OS/Python dependencies with Trivy.',
        command: 'docker build -t eventledger-api:${GIT_SHA} ./backend && trivy image eventledger-api:${GIT_SHA}',
      },
    ],
    exitGate: '100% integration tests green, zero high/critical CVEs, staging smoke test passes.',
  },
  {
    stage: '03. Production Release',
    environment: 'Prod (Managed K8s / Cloud Run + RDS)',
    objective: 'Zero-downtime deployment with backward-compatible migrations, connection pooling, and observability.',
    tooling: ['Kubernetes / ECS', 'Managed PostgreSQL + PgBouncer', 'Nginx / ALB', 'Prometheus + OpenTelemetry'],
    steps: [
      {
        title: 'Run backward-compatible DB migration job',
        detail: 'Execute Alembic migration as an idempotent pre-deploy job before rolling new API pods.',
        command: 'kubectl run alembic-migrate --rm -i --image=eventledger-api:${GIT_SHA} -- alembic upgrade head',
      },
      {
        title: 'Blue-Green / Rolling Pod Rollout',
        detail: 'Route traffic only after /api/v1/health readiness probes succeed; keep N-1 image ready for instant rollback.',
        command: 'kubectl rollout status deployment/eventledger-api --timeout=180s',
      },
      {
        title: 'Synthetic Booking Probe & SLO Alerting',
        detail: 'Monitor p95 latency (<120ms), 5xx error rate (<0.1%), and PgBouncer active connection saturation.',
        command: 'curl -fsS https://api.eventledger.io/api/v1/health',
      },
    ],
    exitGate: 'Error budget nominal for 30 minutes post-rollout; canary promoted to 100% traffic.',
  },
];
