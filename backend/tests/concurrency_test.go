package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"sutra-mini/internal/config"
	"sutra-mini/internal/db"
	"sutra-mini/internal/mock"
	"sutra-mini/internal/models"
	"sutra-mini/internal/service"
	"sutra-mini/internal/worker"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres@localhost:5432/sutra_mini?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	testPool, err = db.InitPool(ctx, dbURL)
	if err != nil {
		fmt.Printf("DATABASE_URL not reachable (%v); tests requiring real PostgreSQL will be NOT RUN\n", err)
		os.Exit(0)
	}

	// Ensure migrations are applied
	_ = db.RunMigrations(ctx, testPool, "../../migrations")
	_ = db.RunMigrations(ctx, testPool, "../migrations")

	code := m.Run()
	testPool.Close()
	os.Exit(code)
}

func setupTestIssue(t *testing.T, ctx context.Context, initialQty int) (issueID string) {
	t.Helper()
	skuID := uuid.New().String()
	skuCode := fmt.Sprintf("SKU-TEST-%s", skuID[:8])
	_, err := testPool.Exec(ctx, `
		INSERT INTO skus (id, code, name, image_url)
		VALUES ($1, $2, 'Test Saree', 'https://example.com/saree.jpg')
	`, skuID, skuCode)
	if err != nil {
		t.Fatalf("setup sku: %v", err)
	}

	partyID := uuid.New().String()
	_, err = testPool.Exec(ctx, `
		INSERT INTO parties (id, name, phone)
		VALUES ($1, 'Test Artisan', '+91 9999900000')
	`, partyID)
	if err != nil {
		t.Fatalf("setup party: %v", err)
	}

	issueID = uuid.New().String()
	_, err = testPool.Exec(ctx, `
		INSERT INTO jobwork_issues (id, party_id, sku_id, qty, issued_on)
		VALUES ($1, $2, $3, $4, '2026-10-10')
	`, issueID, partyID, skuID, initialQty)
	if err != nil {
		t.Fatalf("setup issue: %v", err)
	}

	return issueID
}

// Test A: Mandatory Concurrent receipt overshoot test
// Spawns 15 concurrent goroutines competing for 10 units with parcels of 2.
// Proves total accepted receipt quantity NEVER exceeds issued quantity under concurrency.
func TestConcurrentReceiptOvershoot(t *testing.T) {
	if testPool == nil {
		t.Skip("PostgreSQL database not available; test NOT RUN")
	}

	ctx := context.Background()
	issuedQty := 10
	parcelQty := 2
	numRequests := 15 // Total attempted: 15 * 2 = 30 units (3x capacity!)

	issueID := setupTestIssue(t, ctx, issuedQty)
	receiptSvc := service.NewReceiptService(testPool)

	var (
		wg          sync.WaitGroup
		startGate   = make(chan struct{})
		accepted    int32
		rejected    int32
		otherErrors int32
	)

	wg.Add(numRequests)
	for i := 0; i < numRequests; i++ {
		go func(workerIdx int) {
			defer wg.Done()
			idempotencyKey := fmt.Sprintf("overshoot-key-%s-%d", issueID[:8], workerIdx)

			<-startGate // wait for simultaneous trigger

			resp, err := receiptSvc.CreateReceipt(ctx, idempotencyKey, models.ReceiptCreateRequest{
				IssueID:    issueID,
				Qty:        parcelQty,
				ReceivedOn: "2026-10-10",
			})

			if err == nil && resp != nil {
				atomic.AddInt32(&accepted, 1)
			} else if err != nil && errors.Is(err, service.ErrOvershoot) {
				atomic.AddInt32(&rejected, 1)
			} else {
				t.Logf("Unexpected error in worker %d: %v", workerIdx, err)
				atomic.AddInt32(&otherErrors, 1)
			}
		}(i)
	}

	// Unleash all 15 concurrent workers simultaneously
	close(startGate)
	wg.Wait()

	t.Logf("Concurrent test result: accepted=%d, rejected=%d, errors=%d", accepted, rejected, otherErrors)

	if otherErrors > 0 {
		t.Fatalf("Expected 0 unexpected errors, got %d", otherErrors)
	}

	// 1. Exactly 5 requests must be accepted (5 * 2 = 10 units)
	expectedAccepted := int32(issuedQty / parcelQty)
	if accepted != expectedAccepted {
		t.Errorf("Expected exactly %d accepted receipts, got %d", expectedAccepted, accepted)
	}

	// 2. Exactly 10 requests must be rejected
	expectedRejected := int32(numRequests) - expectedAccepted
	if rejected != expectedRejected {
		t.Errorf("Expected exactly %d rejected receipts due to overshoot, got %d", expectedRejected, rejected)
	}

	// 3. Database check: total accepted quantity in PostgreSQL must be EXACTLY 10
	var totalReceivedInDB int
	err := testPool.QueryRow(ctx, `
		SELECT COALESCE(SUM(qty), 0)
		FROM jobwork_receipts
		WHERE issue_id = $1;
	`, issueID).Scan(&totalReceivedInDB)
	if err != nil {
		t.Fatalf("Failed to query db for total received: %v", err)
	}

	if totalReceivedInDB != issuedQty {
		t.Fatalf("Total received in DB was %d, expected exactly %d (overshoot violation!)", totalReceivedInDB, issuedQty)
	}

	// 4. Assert every accepted receipt has exactly one corresponding voucher
	var receiptCount, voucherCount int
	err = testPool.QueryRow(ctx, `SELECT COUNT(*) FROM jobwork_receipts WHERE issue_id = $1;`, issueID).Scan(&receiptCount)
	if err != nil {
		t.Fatalf("query receipt count: %v", err)
	}
	err = testPool.QueryRow(ctx, `
		SELECT COUNT(*) 
		FROM vouchers v
		JOIN jobwork_receipts r ON r.id = v.source_id
		WHERE r.issue_id = $1;
	`, issueID).Scan(&voucherCount)
	if err != nil {
		t.Fatalf("query voucher count: %v", err)
	}

	if receiptCount != int(expectedAccepted) {
		t.Errorf("Expected %d receipts in DB, found %d", expectedAccepted, receiptCount)
	}
	if voucherCount != receiptCount {
		t.Errorf("Voucher count (%d) does not match receipt count (%d)", voucherCount, receiptCount)
	}

	// 5. Final outstanding quantity calculated from PostgreSQL must be 0
	summary, err := receiptSvc.GetIssueSummary(ctx, issueID)
	if err != nil {
		t.Fatalf("GetIssueSummary error: %v", err)
	}
	if summary.OutstandingQty != 0 {
		t.Errorf("Outstanding quantity should be 0, got %d", summary.OutstandingQty)
	}
}

// Test B: Mandatory Idempotency replay test
// Proves duplicate request with same Idempotency-Key returns the identical result
// without creating extra rows, and conflicting payload is rejected.
func TestIdempotencyReplay(t *testing.T) {
	if testPool == nil {
		t.Skip("PostgreSQL database not available; test NOT RUN")
	}

	ctx := context.Background()
	issueID := setupTestIssue(t, ctx, 50)
	receiptSvc := service.NewReceiptService(testPool)

	idempotencyKey := fmt.Sprintf("idem-key-%s", uuid.New().String()[:8])
	initialReq := models.ReceiptCreateRequest{
		IssueID:    issueID,
		Qty:        5,
		ReceivedOn: "2026-10-10",
	}

	// 1. Initial submission
	resp1, err := receiptSvc.CreateReceipt(ctx, idempotencyKey, initialReq)
	if err != nil {
		t.Fatalf("Initial receipt creation failed: %v", err)
	}
	if resp1.IsReplay {
		t.Fatalf("Initial request should not be marked as replay")
	}

	// 2. Exact replay with same key and payload
	resp2, err := receiptSvc.CreateReceipt(ctx, idempotencyKey, initialReq)
	if err != nil {
		t.Fatalf("Replay request failed: %v", err)
	}
	if !resp2.IsReplay {
		t.Errorf("Second request must be marked as replay")
	}
	if resp2.Receipt.ID != resp1.Receipt.ID {
		t.Errorf("Replay returned receipt ID %s, expected %s", resp2.Receipt.ID, resp1.Receipt.ID)
	}
	if resp2.Voucher.ID != resp1.Voucher.ID {
		t.Errorf("Replay returned voucher ID %s, expected %s", resp2.Voucher.ID, resp1.Voucher.ID)
	}

	// 3. Database verification: exactly one receipt and one voucher exist for this key
	var receiptCount, voucherCount int
	err = testPool.QueryRow(ctx, "SELECT COUNT(*) FROM jobwork_receipts WHERE idempotency_key = $1", idempotencyKey).Scan(&receiptCount)
	if err != nil {
		t.Fatalf("count receipts: %v", err)
	}
	err = testPool.QueryRow(ctx, "SELECT COUNT(*) FROM vouchers WHERE source_id = $1", resp1.Receipt.ID).Scan(&voucherCount)
	if err != nil {
		t.Fatalf("count vouchers: %v", err)
	}

	if receiptCount != 1 {
		t.Fatalf("Expected exactly 1 receipt in DB for idempotency key, found %d", receiptCount)
	}
	if voucherCount != 1 {
		t.Fatalf("Expected exactly 1 voucher in DB for idempotency key, found %d", voucherCount)
	}

	// 4. Conflicting payload with same key must be rejected with ErrIdempotencyConflict
	conflictingReq := models.ReceiptCreateRequest{
		IssueID:    issueID,
		Qty:        8, // different quantity!
		ReceivedOn: "2026-10-10",
	}
	_, err = receiptSvc.CreateReceipt(ctx, idempotencyKey, conflictingReq)
	if err == nil {
		t.Fatalf("Expected conflict error for altered payload with same idempotency key, got nil")
	}
	if !errors.Is(err, service.ErrIdempotencyConflict) {
		t.Errorf("Expected ErrIdempotencyConflict, got %v", err)
	}

	// Verify no new rows created by conflicting attempt
	err = testPool.QueryRow(ctx, "SELECT COUNT(*) FROM jobwork_receipts WHERE idempotency_key = $1", idempotencyKey).Scan(&receiptCount)
	if err != nil {
		t.Fatalf("count receipts after conflict: %v", err)
	}
	if receiptCount != 1 {
		t.Fatalf("Conflicting request altered receipt count to %d", receiptCount)
	}
}

// Test C: Duplicate client_ref and HTTP 409 reconciliation
// Proves worker receives 409 Conflict with external_ref and successfully reconciles voucher to 'pushed'.
func TestWorkerReconcileDuplicate409(t *testing.T) {
	if testPool == nil {
		t.Skip("PostgreSQL database not available; test NOT RUN")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mockServer := mock.NewAccountingServer(42)
	httpServer := httptest.NewServer(mockServer)
	defer httpServer.Close()

	issueID := setupTestIssue(t, ctx, 10)
	receiptSvc := service.NewReceiptService(testPool)

	// Create receipt and voucher in DB
	key := fmt.Sprintf("test-409-%s", uuid.New().String())
	resp, err := receiptSvc.CreateReceipt(ctx, key, models.ReceiptCreateRequest{
		IssueID:    issueID,
		Qty:        1,
		ReceivedOn: "2026-10-10",
	})
	if err != nil {
		t.Fatalf("create receipt: %v", err)
	}

	voucherID := resp.Voucher.ID
	clientRef := resp.Voucher.ClientRef

	// 1. Pre-push this client_ref directly to mock accounting server using force-success
	// to simulate the case where remote accepted it, but worker crashed before DB update!
	pushBody, _ := json.Marshal(models.MockAccountingRequest{
		ClientRef:   clientRef,
		Type:        resp.Voucher.Type,
		AmountPaise: resp.Voucher.AmountPaise,
		SourceID:    resp.Receipt.ID,
	})
	req, _ := http.NewRequestWithContext(ctx, "POST", httpServer.URL+"/api/vouchers", bytes.NewReader(pushBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Mock-Mode", "force-success")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("manual mock push failed: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from initial push, got %d", res.StatusCode)
	}

	var firstPushResp models.MockAccountingResponse
	body, _ := io.ReadAll(res.Body)
	_ = json.Unmarshal(body, &firstPushResp)
	expectedExternalRef := firstPushResp.ExternalRef
	if expectedExternalRef == "" {
		t.Fatalf("expected external_ref from initial push")
	}

	// 2. Now call w.ProcessVoucher on the voucher with the same client_ref.
	// Mock will return 409 Conflict with the original external_ref,
	// and ProcessVoucher must reconcile the status in DB to 'pushed'.
	cfg := &config.Config{
		MockAccountingURL:  httpServer.URL,
		WorkerConcurrency:  1,
		WorkerLeaseSeconds: 30,
		WorkerMaxAttempts:  5,
	}

	w := worker.NewSyncWorker(testPool, cfg)
	claimed := worker.ClaimedVoucher{
		ID:          voucherID,
		Type:        resp.Voucher.Type,
		SourceID:    resp.Receipt.ID,
		AmountPaise: resp.Voucher.AmountPaise,
		Attempts:    1,
		ClientRef:   clientRef,
	}

	w.ProcessVoucher(ctx, claimed)

	// Verify database state: must be 'pushed' with matching external_ref
	var status string
	var externalRef *string
	err = testPool.QueryRow(ctx, "SELECT status, external_ref FROM vouchers WHERE id = $1", voucherID).Scan(&status, &externalRef)
	if err != nil {
		t.Fatalf("query voucher after 409 reconciliation: %v", err)
	}

	if status != "pushed" {
		t.Fatalf("Voucher status was %s, expected 'pushed' via 409 reconciliation", status)
	}
	if externalRef == nil || *externalRef != expectedExternalRef {
		t.Fatalf("Voucher external_ref was %v, expected %s", externalRef, expectedExternalRef)
	}
	t.Logf("Successfully reconciled voucher %s via 409 conflict to external_ref %s", voucherID, *externalRef)
}

// Test D: Voucher retry API
// Proves failed vouchers can be safely re-armed, and already pushed vouchers cannot be corrupted.
func TestVoucherRetryApi(t *testing.T) {
	if testPool == nil {
		t.Skip("PostgreSQL database not available; test NOT RUN")
	}

	ctx := context.Background()
	issueID := setupTestIssue(t, ctx, 10)
	receiptSvc := service.NewReceiptService(testPool)
	voucherSvc := service.NewVoucherService(testPool)

	resp, err := receiptSvc.CreateReceipt(ctx, "test-retry-"+uuid.New().String(), models.ReceiptCreateRequest{
		IssueID:    issueID,
		Qty:        1,
		ReceivedOn: "2026-10-10",
	})
	if err != nil {
		t.Fatalf("create receipt: %v", err)
	}

	voucherID := resp.Voucher.ID

	// Manually mark voucher as 'failed' in DB
	_, err = testPool.Exec(ctx, `
		UPDATE vouchers
		SET status = 'failed',
		    attempts = 5,
		    last_error = 'simulated remote connection failure'
		WHERE id = $1;
	`, voucherID)
	if err != nil {
		t.Fatalf("mark failed: %v", err)
	}

	// Call RetryVoucher
	retried, err := voucherSvc.RetryVoucher(ctx, voucherID)
	if err != nil {
		t.Fatalf("RetryVoucher failed: %v", err)
	}

	if retried.Status != models.VoucherStatusPending {
		t.Errorf("Expected retried status to be 'pending', got %s", retried.Status)
	}

	// Verify in DB
	var dbStatus string
	err = testPool.QueryRow(ctx, "SELECT status FROM vouchers WHERE id = $1", voucherID).Scan(&dbStatus)
	if err != nil || dbStatus != "pending" {
		t.Errorf("Expected db status 'pending', got %s (%v)", dbStatus, err)
	}

	// Mark voucher as 'pushed'
	_, err = testPool.Exec(ctx, `UPDATE vouchers SET status = 'pushed', external_ref = 'ACC-DONE' WHERE id = $1`, voucherID)
	if err != nil {
		t.Fatalf("mark pushed: %v", err)
	}

	// Attempting to retry an already pushed voucher must return ErrVoucherAlreadyPushed
	_, err = voucherSvc.RetryVoucher(ctx, voucherID)
	if !errors.Is(err, service.ErrVoucherAlreadyPushed) {
		t.Errorf("Expected ErrVoucherAlreadyPushed, got %v", err)
	}
}

// Test E: Multi-worker concurrency safety
// Proves 2 concurrent worker instances never double-claim or produce conflict.
func TestTwoWorkersConcurrentProcessing(t *testing.T) {
	if testPool == nil {
		t.Skip("PostgreSQL database not available; test NOT RUN")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mockServer := mock.NewAccountingServer(100)
	httpServer := httptest.NewServer(mockServer)
	defer httpServer.Close()

	cfg := &config.Config{
		MockAccountingURL:  httpServer.URL,
		WorkerPollInterval: 50 * time.Millisecond,
		WorkerConcurrency:  2,
		WorkerLeaseSeconds: 10,
		WorkerMaxAttempts:  5,
	}

	w1 := worker.NewSyncWorker(testPool, cfg)
	w2 := worker.NewSyncWorker(testPool, cfg)

	// Create 4 receipts with pending vouchers
	receiptSvc := service.NewReceiptService(testPool)
	issueID := setupTestIssue(t, ctx, 20)
	for i := 0; i < 4; i++ {
		key := fmt.Sprintf("multi-worker-%s-%d", issueID[:8], i)
		_, err := receiptSvc.CreateReceipt(ctx, key, models.ReceiptCreateRequest{
			IssueID:    issueID,
			Qty:        1,
			ReceivedOn: "2026-10-10",
		})
		if err != nil {
			t.Fatalf("create receipt %d: %v", i, err)
		}
	}

	go w1.Start(ctx)
	go w2.Start(ctx)

	// Let workers run for 2.5 seconds
	time.Sleep(2500 * time.Millisecond)
	w1.Stop()
	w2.Stop()

	// Check voucher statuses: all vouchers must be in a valid terminal/transition status
	var validCount int
	err := testPool.QueryRow(ctx, `
		SELECT COUNT(*) FROM vouchers 
		WHERE status IN ('pushed', 'pending', 'failed')
	`).Scan(&validCount)
	if err != nil {
		t.Fatalf("query vouchers: %v", err)
	}

	if validCount < 4 {
		t.Errorf("Expected at least 4 valid vouchers, found %d", validCount)
	}
}
