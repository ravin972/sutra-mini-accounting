# AGENT_NOTES.md — Candid Engineering Reflections

## 1. AI & Coding Tools Used
- **Agent Environment**: Antigravity IDE Agentic Assistant (powered by Google DeepMind Gemini models).
- **Tooling Stack**:
  - Windows PowerShell (pwsh) runtime & process manager.
  - Native Go 1.23.2 / 1.25.0 toolchain with `pgx/v5` driver.
  - Native PostgreSQL 17 server running locally on Windows.
  - Node.js v22.23.2 + Next.js 14.2.35 + TypeScript.
  - Ripgrep, Git 2.55.0, GitHub CLI (`gh`).

---

## 2. Important Design Decisions & Rationale

1. **Transaction & Row Locking Strategy (`SELECT ... FOR UPDATE`)**:
   - *Decision*: Coordinated concurrent receipt creation using row-level locking on the `jobwork_issues` table, rather than relying on application-level locks (e.g. Go `sync.Mutex`).
   - *Rationale*: Multiple API replicas can run concurrently across machines. A distributed system cannot rely on process-local memory locks. By locking the specific issue row in PostgreSQL, all concurrent requests for the same issue serialize cleanly. Within that locked transaction, the database computes `COALESCE(SUM(qty), 0)` and asserts that `totalReceived + req.Qty <= issue.Qty`. If overshoot would occur, the transaction aborts and rolls back immediately, creating zero orphan receipts or vouchers.
2. **PostgreSQL-Enforced Idempotency & Request Hash Verification**:
   - *Decision*: Used a `UNIQUE` constraint on `jobwork_receipts.idempotency_key` and stored a SHA-256 `request_hash` of `(issue_id, qty, received_on)`.
   - *Rationale*:
     - If the identical payload is submitted with the same key, Sutra Mini detects it and returns the committed receipt and voucher with `is_replay: true`.
     - If the same key is reused with an altered payload (e.g., changed quantity), the hash mismatch immediately returns an HTTP 409 Conflict error.
     - If two identical requests race into PostgreSQL at the exact microsecond, PostgreSQL's unique constraint (error code `23505`) safely catches the race, rolls back the loser, and reads the winner's committed record.
3. **Worker Coordination via `SKIP LOCKED` and Durable Leases**:
   - *Decision*: Worker claims vouchers using a single atomic CTE:
     ```sql
     WITH next_voucher AS (
       SELECT id FROM vouchers
       WHERE status = 'pending'
         AND next_attempt_at <= NOW()
         AND (locked_until IS NULL OR locked_until < NOW())
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE vouchers v
     SET locked_until = NOW() + INTERVAL '30 seconds',
         locked_by = $1,
         attempts = attempts + 1
     ...
     ```
   - *Rationale*: `SKIP LOCKED` allows any number of worker instances to query simultaneously without blocking each other or double-claiming rows. If a worker crashes or network freezes, the lease expires after 30 seconds (`locked_until < NOW()`), and any healthy worker picks it up safely.
4. **Deterministic `client_ref` & Effectively-Once HTTP 409 Reconciliation**:
   - *Decision*: `client_ref` is permanently tied to the voucher: `VCHR-<receipt_id>`. It is never regenerated across retries.
   - *Rationale*: Distributed two-phase commit is absent. If the remote accounting server accepts the voucher, but the network drops or the worker crashes before PostgreSQL records the success, the worker simply retries with the same `client_ref`. The remote server detects the duplicate and responds with HTTP 409 Conflict containing the original `external_ref`. The worker parses this and transitions the voucher to `pushed`. This guarantees effectively-once logical delivery.
5. **Decoupled Concurrency in Worker**:
   - *Decision*: Used a buffered concurrency semaphore channel (`sem := make(chan struct{}, cfg.WorkerConcurrency)`) with worker goroutines.
   - *Rationale*: The case study notes that 10% of calls to the mock server hang for 5 seconds. If the worker processed sequentially on a single thread, a single 5-second hang would stall all other vouchers. With concurrent goroutine workers, delayed requests wait in their own goroutine while remaining slots continue processing pending vouchers without latency.

---

## 3. Bugs & Incorrect Suggestions Produced by Tools

1. **Go Error Wrapping with `%w` vs Direct Equality Check**:
   - *Tool Mistake*: During the first generation of `concurrency_test.go`, the test asserted:
     `else if err != nil && err == service.ErrOvershoot {`
   - *Why it failed*: In Go, `fmt.Errorf("%w: issued=%d...", ErrOvershoot)` wraps the error. Using `==` fails because the error value is wrapped in a dynamic `fmt.wrapError`. As a result, all 10 overshoot rejections fell through to the `else` branch and were logged as "unexpected errors", causing `TestConcurrentReceiptOvershoot` to fail even though PostgreSQL had correctly rejected all 10 requests!
   - *Fix*: Replaced all equality checks with standard `errors.Is(err, service.ErrOvershoot)`.
2. **HTTP Status Code Identifier Confusion in Main Router**:
   - *Tool Mistake*: In `backend/cmd/api/main.go`, the code initially used `http.NotFound` in `writeError(w, http.NotFound, ...)`.
   - *Why it failed*: In the Go standard library, `http.NotFound` is a function (`func(w http.ResponseWriter, r *http.Request)`), whereas the integer status code is `http.StatusNotFound` (404). The compiler caught this type mismatch immediately.
   - *Fix*: Corrected to `http.StatusNotFound`.
3. **Winget Machine-Wide Installer UAC Deadlock**:
   - *Tool Mistake*: Running `winget install --id GoLang.Go -e --silent` launched `msiexec.exe`, which hung indefinitely waiting for Windows Administrator UAC elevation.
   - *Fix*: Cancelled the hanging MSI task, downloaded the official Go 1.23.2 binary zip release directly into user-space (`$env:USERPROFILE\go_dist`), and created user PATH shims, allowing Go to run without admin prompts.

---

## 4. Issues Caught During Manual Review

1. **Test Worker Isolation & Mock Server 5-Second Hang Interference**:
   - *Issue*: During the initial test run of `TestWorkerReconcileDuplicate409`, the test timed out after 5 seconds because earlier pending vouchers from prior tests were still in the queue, and the worker picked up an unrelated voucher that randomly triggered the mock server's 10% 5-second delay.
   - *Fix*: Refactored `SyncWorker.ProcessVoucher` to be an exported method on the worker. In `TestWorkerReconcileDuplicate409`, the test directly claims and dispatches the specific voucher to `ProcessVoucher`, completely isolating it from random delays on other test rows.
2. **HTTP Client Timeouts vs Remote Mock Latency**:
   - *Issue*: Standard Go `http.DefaultClient` has no timeout (`Timeout: 0`). If an API hangs indefinitely, worker threads would leak. Conversely, if `Timeout` was set to 3 seconds, it would abort legitimate requests that took 5 seconds to complete.
   - *Fix*: Configured an explicit `http.Client` with `Timeout: 10 * time.Second` and transport keep-alive settings, ensuring the 5-second delay completes safely while bounding all remote calls.

---

## 5. Tests Actually Executed & Real Results

All tests were executed against native **PostgreSQL 17.11** running on `localhost:5432`:

```
=== RUN   TestConcurrentReceiptOvershoot
    concurrency_test.go:140: Concurrent test result: accepted=5, rejected=10, errors=0
--- PASS: TestConcurrentReceiptOvershoot (0.28s)
=== RUN   TestIdempotencyReplay
--- PASS: TestIdempotencyReplay (0.02s)
=== RUN   TestWorkerReconcileDuplicate409
2026/10/10 14:28:32 [MockAccounting] Successfully accepted voucher: client_ref=VCHR-882cae20-52ce-4132-939b-056aa389eac7 -> external_ref=ACC-EXT-f6fefb9d
2026/10/10 14:28:32 [MockAccounting] Duplicate client_ref: VCHR-882cae20-52ce-4132-939b-056aa389eac7 -> returning 409 with external_ref: ACC-EXT-f6fefb9d
2026/10/10 14:28:32 [worker-e1620baa] Reconciled duplicate client_ref VCHR-882cae20-52ce-4132-939b-056aa389eac7 with external_ref ACC-EXT-f6fefb9d
--- PASS: TestWorkerReconcileDuplicate409 (0.02s)
=== RUN   TestVoucherRetryApi
--- PASS: TestVoucherRetryApi (0.02s)
=== RUN   TestTwoWorkersConcurrentProcessing
--- PASS: TestTwoWorkersConcurrentProcessing (6.42s)
PASS
ok  	sutra-mini/tests	11.779s
```

### Live Scripts Executed:
- `pwsh -File ./scripts/test_replay.ps1` -> PASSED (Initial 201 Created, Replay 200 OK with `is_replay=true`, Conflict 409).
- `pwsh -File ./scripts/test_overshoot.ps1` -> PASSED (10 concurrent requests; 4 accepted, 6 rejected; zero overshoot).
- `pwsh -File ./scripts/test_crash_recovery.ps1` -> PASSED (Simulated worker crash after remote accept; worker restarted and successfully reconciled 409 to `pushed`).
- Next.js production build (`npm run build`) -> PASSED (0 lint/type errors, static page generated).
- Stretch endpoint `POST /ask` -> PASSED (Logged tool calls over PostgreSQL with aggregated balances).

---

## 6. Remaining Limitations & Unverified Behavior

1. **Remote Accounting Clock / State Forgetfulness**:
   - The mock accounting server uses an in-memory map. If the mock server process itself is hard restarted, its in-memory map resets. In production, the remote accounting software would persist its state in a persistent database.
2. **Neon Cloud Latency vs Concurrency Windows**:
   - Tests were verified against native local PostgreSQL 17. On cloud Neon serverless instances, cold starts (endpoint suspension) introduce a ~1-2s initial connection latency before the connection pool warms up. The pool configuration handles reconnects, but cold-start connection timeouts must allow at least 5-10 seconds.
3. **No External LLM API Key**:
   - The bonus `/ask` endpoint uses the requested fallback/stub model behavior: it executes the read-only SQL query tool against PostgreSQL, logs each tool call, formats the answer deterministically, and explicitly returns `"model_status": "stubbed (no external LLM API key configured; resolved safely using read-only database tool execution)"`.
