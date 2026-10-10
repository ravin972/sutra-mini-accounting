# Sutra Mini: Reliable Jobwork Accounting Push
### Shree Radha Studio — Engineering Assessment Case Study

Sutra Mini is a resilient, transactional accounting synchronization engine built for **Shree Radha Studio**, a women's ethnicwear manufacturer. Fabric is dispatched to embroidery and stitching job-workers (parties) and received back in installments across multiple days. Every receipt has an immediate accounting consequence that must reach the remote accounting system, whose API is slow, erratic (20% 500s, 10% 5-second delays), and prone to network drops.

Sutra Mini guarantees **transactional correctness**, **strict overshoot prevention under high concurrency**, **database-enforced idempotency**, and **crash-safe effectively-once synchronization** using database leases (`FOR UPDATE SKIP LOCKED`) and duplicate HTTP 409 reconciliation.

---

## Architecture Overview

```
                      +-----------------------------------+
                      |       Next.js Web Client          |
                      |   (/sync Dashboard & Test Form)   |
                      +-----------------+-----------------+
                                        | HTTP (CORS)
                                        v
                      +-----------------------------------+
                      |      Go Backend HTTP API          |
                      |  POST /jobwork/receipts (IdemKey) |
                      |  GET  /issues/{id}                |
                      |  GET  /vouchers?status=           |
                      |  POST /vouchers/{id}/retry        |
                      |  POST /ask (Bonus Read-Only Tool) |
                      +--------+-----------------+--------+
                               |                 |
                   Atomically  |                 | Reads summary
                   Enforces    |                 |
                               v                 v
                      +-----------------------------------+
                      |      PostgreSQL 17 / Neon DB      |
                      |   - jobwork_issues (Row Locked)   |
                      |   - jobwork_receipts (Idem UNIQUE)|
                      |   - vouchers (Leased Queue)       |
                      +-----------------+-----------------+
                                        ^
                   FOR UPDATE           | Durable Leases
                   SKIP LOCKED          | & Status Updates
                                        v
                      +-----------------------------------+
                      |     Sync Worker Daemon(s)         |
                      |   (Worker 1, Worker 2 Concurrency)|
                      +-----------------+-----------------+
                                        | HTTP POST /api/vouchers
                                        | (Bounded retries & backoff)
                                        v
                      +-----------------------------------+
                      |      Mock Accounting Server       |
                      |   - 20% Simulated HTTP 500        |
                      |   - 10% 5-second Delay            |
                      |   - Duplicate client_ref -> 409   |
                      +-----------------------------------+
```

---

## 1. Prerequisites

- **Go**: 1.22+ (tested with Go 1.23 / 1.25)
- **Node.js**: v18+ or v20+ (tested with v22) & npm
- **PostgreSQL**: PostgreSQL 14+ (Local instance or [Neon Serverless Postgres](https://neon.tech))
- **Git**

---

## 2. Environment Variables Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

On Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

### `.env` File Reference
```env
# Database connection (Neon PostgreSQL or local PostgreSQL)
DATABASE_URL=postgres://postgres@localhost:5432/sutra_mini?sslmode=disable

# Backend API Configuration
PORT=8080

# Mock Accounting Service Configuration
MOCK_ACCOUNTING_PORT=8081
MOCK_ACCOUNTING_URL=http://localhost:8081

# Sync Worker Configuration
WORKER_POLL_INTERVAL=1s
WORKER_CONCURRENCY=4
WORKER_LEASE_SECONDS=30
WORKER_MAX_ATTEMPTS=5

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## 3. Neon PostgreSQL Provisioning & Setup

1. Create a free PostgreSQL project on [Neon](https://neon.tech).
2. Copy your Neon connection string from the dashboard (ensure `sslmode=require` is present):
   ```env
   DATABASE_URL=postgres://alex:secret_pw@ep-quiet-moon-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Update `DATABASE_URL` in your `.env` file.
   *(Alternatively, run against local PostgreSQL e.g. `postgres://postgres@localhost:5432/sutra_mini?sslmode=disable`)*.

---

## 4. Running Migrations and Seed Data

Apply versioned SQL migrations (`001_initial_schema.sql` and `002_seed_data.sql`):

### Option A: Using Go CLI Runner
```bash
cd backend
go run ./cmd/migrate
```

### Option B: Using psql CLI
```bash
psql "$DATABASE_URL" -f migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f migrations/002_seed_data.sql
```

*Note: Migrations and seed scripts are strictly idempotent (`ON CONFLICT DO NOTHING / UPDATE`). Re-running them will never corrupt data or create duplicates.*

---

## 5. Starting the Go Backend API

From repository root:

```bash
cd backend
go run ./cmd/api
```
The API server starts on `http://localhost:8080` (or `PORT`).

---

## 6. Starting the Mock Accounting Server

In a separate terminal:

```bash
cd backend
go run ./cmd/mock
```
The mock server starts on `http://localhost:8081` (or `MOCK_ACCOUNTING_PORT`).
It simulates:
- 20% random HTTP 500 errors
- 10% 5-second simulated latency followed by 200 OK
- Duplicate `client_ref` detection returning HTTP 409 Conflict with the original `external_ref`
- Concurrency-safe in-memory voucher ledger

---

## 7. Starting the Synchronization Worker

### Running One Worker Instance
In a separate terminal:
```bash
cd backend
go run ./cmd/worker
```

### Running Two Worker Instances Concurrently
Two workers coordinate safely using PostgreSQL row locks (`FOR UPDATE SKIP LOCKED`) and durable leases (`locked_until`):

In Terminal A:
```bash
cd backend
go run ./cmd/worker
```

In Terminal B:
```bash
cd backend
go run ./cmd/worker
```

Or on Windows PowerShell, run the helper script:
```powershell
pwsh -File ./scripts/run_two_workers.ps1
```

---

## 8. Running the Next.js Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000/sync](http://localhost:3000/sync) in your browser.

Features:
- Live voucher queue split into **Pending**, **Pushed**, and **Failed** columns.
- Automatic live polling (every 3 seconds) with instant toggle.
- Interactive **"Retry"** button on failed vouchers that invokes `POST /vouchers/{id}/retry`.
- Built-in **Receipt Tester** drawer allowing you to submit receipts and test idempotency directly from the browser.

---

## 9. Running Automated Tests

All tests run against a real PostgreSQL instance to rigorously verify database concurrency and locking guarantees.

```bash
cd backend
go test -v ./tests
```

### What the Tests Prove:
1. **`TestConcurrentReceiptOvershoot` (Test A - Mandatory)**:
   - Spawns 15 concurrent goroutines simultaneously competing for an issue with remaining quantity of 10 in parcels of 2.
   - Asserts: Exactly 5 requests accepted (10 pcs total), 10 requests rejected with HTTP 422 `ErrOvershoot`.
   - Database verification: Total accepted receipts in PostgreSQL = exactly 10, each accepted receipt has exactly 1 voucher, final outstanding quantity = 0.
2. **`TestIdempotencyReplay` (Test B - Mandatory)**:
   - Submits receipt request with `Idempotency-Key: X`.
   - Submits identical payload with `Idempotency-Key: X` -> returns `is_replay: true` with identical receipt and voucher IDs, creates 0 duplicate rows.
   - Submits altered payload with same key -> rejected with HTTP 409 `ErrIdempotencyConflict`.
3. **`TestWorkerReconcileDuplicate409`**:
   - Pre-registers `client_ref` on remote mock server.
   - Worker processes voucher with same `client_ref`, intercepts HTTP 409 Conflict, parses remote `external_ref`, and reconciles local status to `pushed`.
4. **`TestVoucherRetryApi`**:
   - Re-arms failed voucher back to `pending` with cleared leases and preserved historical counts.
   - Proves retry rejects already `pushed` vouchers.
5. **`TestTwoWorkersConcurrentProcessing`**:
   - Runs two worker instances processing simultaneously, verifying zero double-pushes or deadlocks.

---

## 10. Manual Verification & Demo Commands

### A. Replaying a Receipt with the Same Idempotency Key

```bash
# 1. First Submission (Created)
curl -i -X POST http://localhost:8080/jobwork/receipts \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-001" \
  -d '{"issue_id":"c0000000-0000-0000-0000-000000000001","qty":2,"received_on":"2026-10-10"}'

# 2. Replay with identical payload (Returns 200 OK, is_replay=true, zero extra rows)
curl -i -X POST http://localhost:8080/jobwork/receipts \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-001" \
  -d '{"issue_id":"c0000000-0000-0000-0000-000000000001","qty":2,"received_on":"2026-10-10"}'

# 3. Conflict Replay with altered quantity (Returns 409 Conflict)
curl -i -X POST http://localhost:8080/jobwork/receipts \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-001" \
  -d '{"issue_id":"c0000000-0000-0000-0000-000000000001","qty":10,"received_on":"2026-10-10"}'
```

Or run the automated script:
```powershell
pwsh -File ./scripts/test_replay.ps1
```

---

### B. Testing 10 Concurrent Receipts (Overshoot Guard)

Run the automated concurrency verification script:
```powershell
pwsh -File ./scripts/test_overshoot.ps1
```
On Linux/macOS:
```bash
./scripts/test_overshoot.sh
```

---

### C. Demonstrating Crash Safety & Duplicate Reconciliation

Simulates worker killing during the 5-second remote delay and restarting:
```powershell
pwsh -File ./scripts/test_crash_recovery.ps1
```

What this does:
1. Submits a receipt and voucher into PostgreSQL (`status = 'pending'`).
2. Pushes the voucher directly to Mock Accounting server with `X-Mock-Mode: force-success`. Mock server records the voucher and assigns `external_ref: ACC-EXT-XYZ`. (Simulating remote system receiving the voucher right before worker process was killed).
3. The worker daemon restarts, claims the pending voucher, and retries the HTTP push using the stable `client_ref`.
4. Remote server recognizes the duplicate `client_ref`, responds with HTTP 409 Conflict and `external_ref: ACC-EXT-XYZ`.
5. Worker reconciles the 409 response, updates PostgreSQL, and transitions the voucher to `status = 'pushed'` with the matching `external_ref`!

---

### D. Testing the Bonus Natural Language Query (`POST /ask`)

Answers queries regarding jobwork inventory using logged read-only database tools:

```bash
curl -s -X POST http://localhost:8080/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"how much of SKU-KURTI-001 is still with job-worker Rafiq?"}' | jq
```

Response:
```json
{
  "question": "how much of SKU-KURTI-001 is still with job-worker Rafiq?",
  "answer": "Job-worker 'Rafiq Embroidery Works' currently holds 355 units of Anarkali Embroidered Kurti (Crimson Red) (SKU-KURTI-001). (Issued: 400, Received: 45, Outstanding: 355)",
  "tool_calls": [
    {
      "tool_name": "query_jobwork_balances",
      "arguments": { "query": "how much of SKU-KURTI-001 is still with job-worker Rafiq?" },
      "timestamp": "2026-10-10T09:11:34Z"
    }
  ],
  "model_status": "stubbed (no external LLM API key configured; resolved safely using read-only database tool execution)"
}
```

---

## 11. Known Distributed-Systems Limitations

1. **Two-Phase Commit vs. Effectively-Once Semantics**:
   Because PostgreSQL and the remote accounting server do not share a distributed two-phase commit (2PC) transaction coordinator, true "exactly-once" delivery across independent network boundaries is impossible (Two Generals' Problem). Sutra Mini achieves *effectively-once* logical semantics by pairing durable, database-backed leases with immutable, deterministic `client_ref` identifiers and remote 409 duplicate reconciliation.
2. **Clock Drift on Lease Expiration**:
   Worker lease expiry relies on PostgreSQL `NOW()`. If database system time skews significantly, lease calculations could expire earlier or later than intended.
3. **Database Connection Pool Exhaustion under Extreme Concurrency**:
   Long-running transaction locks (`FOR UPDATE`) on the same `issue_id` serialize concurrent receipt requests for that specific issue. If hundreds of requests target the exact same issue simultaneously, connection pools must be sized appropriately to prevent client timeouts.

---

## 12. Project Structure

```
.
├── backend/
│   ├── cmd/
│   │   ├── api/main.go          # HTTP API server & route handlers
│   │   ├── worker/main.go       # Background synchronization worker
│   │   ├── mock/main.go         # Mock accounting server
│   │   └── migrate/main.go      # CLI migration runner
│   ├── internal/
│   │   ├── config/config.go     # Environment variables loader
│   │   ├── db/db.go             # pgxpool connection & migration engine
│   │   ├── models/models.go     # Domain entities and request types
│   │   ├── service/receipt.go   # Transactional receipt & overshoot logic
│   │   ├── service/voucher.go   # Voucher listing and retry logic
│   │   ├── worker/worker.go     # Leased claim (SKIP LOCKED) & 409 reconciliation
│   │   ├── mock/mock.go         # Concurrency-safe mock accounting service
│   │   └── ask/ask.go           # Read-only DB tool caller (/ask stretch goal)
│   └── tests/
│       └── concurrency_test.go  # Real PostgreSQL concurrency & idempotency tests
├── frontend/
│   ├── src/app/
│   │   ├── sync/page.tsx        # Next.js /sync dashboard with retry & test drawer
│   │   ├── layout.tsx           # Application layout
│   │   └── globals.css          # Design system & dark theme styling
│   ├── package.json
│   └── tsconfig.json
├── migrations/
│   ├── 001_initial_schema.sql   # Tables, constraints, and indexes
│   └── 002_seed_data.sql        # 5 SKUs, 2 job-workers, 4 open issues
├── scripts/
│   ├── test_overshoot.ps1       # 10 concurrent requests demonstration
│   ├── test_overshoot.sh        # Bash version
│   ├── test_replay.ps1          # Idempotency replay demonstration
│   ├── test_replay.sh           # Bash version
│   ├── test_crash_recovery.ps1  # Simulated worker crash & 409 reconciliation
│   └── run_two_workers.ps1      # Multi-worker concurrency demo
├── docker-compose.yml           # Full infrastructure orchestration
├── .env.example
├── .gitignore
├── README.md
└── AGENT_NOTES.md
```
