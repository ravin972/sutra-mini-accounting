package worker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sutra-mini/internal/config"
	"sutra-mini/internal/models"
)

type SyncWorker struct {
	id          string
	pool        *pgxpool.Pool
	cfg         *config.Config
	httpClient  *http.Client
	sem         chan struct{}
	wg          sync.WaitGroup
	rng         *rand.Rand
	rngMu       sync.Mutex
	stopChan    chan struct{}
	stopOnce    sync.Once
}

type ClaimedVoucher struct {
	ID          string
	Type        string
	SourceID    string
	AmountPaise int64
	Attempts    int
	ClientRef   string
}

func NewSyncWorker(pool *pgxpool.Pool, cfg *config.Config) *SyncWorker {
	workerID := fmt.Sprintf("worker-%s", uuid.New().String()[:8])
	
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     30 * time.Second,
	}

	httpClient := &http.Client{
		Timeout:   10 * time.Second, // explicit request timeout (longer than 5s mock hang)
		Transport: transport,
	}

	return &SyncWorker{
		id:         workerID,
		pool:       pool,
		cfg:        cfg,
		httpClient: httpClient,
		sem:        make(chan struct{}, cfg.WorkerConcurrency),
		rng:        rand.New(rand.NewSource(time.Now().UnixNano())),
		stopChan:   make(chan struct{}),
	}
}

// Start runs the worker event loop until context is canceled.
func (w *SyncWorker) Start(ctx context.Context) error {
	log.Printf("[%s] Starting sync worker (concurrency=%d, lease=%ds, max_attempts=%d)...",
		w.id, w.cfg.WorkerConcurrency, w.cfg.WorkerLeaseSeconds, w.cfg.WorkerMaxAttempts)

	ticker := time.NewTicker(w.cfg.WorkerPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("[%s] Context canceled, stopping worker loop...", w.id)
			w.waitInFlight()
			return nil
		case <-w.stopChan:
			log.Printf("[%s] Stop signal received, stopping worker loop...", w.id)
			w.waitInFlight()
			return nil
		case <-ticker.C:
			w.claimAndDispatch(ctx)
		}
	}
}

func (w *SyncWorker) Stop() {
	w.stopOnce.Do(func() {
		close(w.stopChan)
	})
}

func (w *SyncWorker) waitInFlight() {
	log.Printf("[%s] Waiting for in-flight tasks to finish...", w.id)
	w.wg.Wait()
	log.Printf("[%s] All worker tasks finished.", w.id)
}

func (w *SyncWorker) claimAndDispatch(ctx context.Context) {
	// Attempt to fill available worker slots
	for {
		select {
		case w.sem <- struct{}{}:
			// Acquired concurrency slot; attempt to claim one voucher
			claimed, err := w.claimNextVoucher(ctx)
			if err != nil {
				<-w.sem
				if !errors.Is(err, pgx.ErrNoRows) && !errors.Is(err, context.Canceled) {
					log.Printf("[%s] Error claiming voucher: %v", w.id, err)
				}
				return
			}
			if claimed == nil {
				<-w.sem
				return // no work available right now
			}

			// Process independently in goroutine so slow requests do not block other slots
			w.wg.Add(1)
			go func(v ClaimedVoucher) {
				defer func() {
					<-w.sem
					w.wg.Done()
				}()
				w.ProcessVoucher(ctx, v)
			}(*claimed)

		default:
			// All concurrency slots currently busy
			return
		}
	}
}

// claimNextVoucher claims a single pending voucher atomically using FOR UPDATE SKIP LOCKED
// and sets a durable lease on the row.
func (w *SyncWorker) claimNextVoucher(ctx context.Context) (*ClaimedVoucher, error) {
	query := `
		WITH next_voucher AS (
			SELECT id
			FROM vouchers
			WHERE status = 'pending'
			  AND next_attempt_at <= NOW()
			  AND (locked_until IS NULL OR locked_until < NOW())
			ORDER BY next_attempt_at ASC, created_at ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE vouchers v
		SET locked_until = NOW() + ($1 * INTERVAL '1 second'),
		    locked_by = $2,
		    attempts = attempts + 1,
		    updated_at = NOW()
		FROM next_voucher
		WHERE v.id = next_voucher.id
		RETURNING v.id, v.type, v.source_id, v.amount_paise, v.attempts, v.client_ref;
	`

	var v ClaimedVoucher
	err := w.pool.QueryRow(ctx, query, w.cfg.WorkerLeaseSeconds, w.id).Scan(
		&v.ID, &v.Type, &v.SourceID, &v.AmountPaise, &v.Attempts, &v.ClientRef,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &v, nil
}

// ProcessVoucher executes the HTTP push to mock accounting and reconciles responses or failures.
func (w *SyncWorker) ProcessVoucher(ctx context.Context, v ClaimedVoucher) {
	log.Printf("[%s] Processing voucher %s (client_ref=%s, attempt=%d)...", w.id, v.ID, v.ClientRef, v.Attempts)

	payload := models.MockAccountingRequest{
		ClientRef:   v.ClientRef,
		Type:        v.Type,
		AmountPaise: v.AmountPaise,
		SourceID:    v.SourceID,
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		w.recordFailure(ctx, v, fmt.Sprintf("json marshal error: %v", err))
		return
	}

	reqURL := fmt.Sprintf("%s/api/vouchers", w.cfg.MockAccountingURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		w.recordFailure(ctx, v, fmt.Sprintf("http request create error: %v", err))
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := w.httpClient.Do(req)
	if err != nil {
		// Connection timeout, network error, or context cancellation
		w.recordFailure(ctx, v, fmt.Sprintf("http request failed: %v", err))
		return
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case http.StatusOK:
		var okResp models.MockAccountingResponse
		if err := json.Unmarshal(respBytes, &okResp); err != nil || okResp.ExternalRef == "" {
			w.recordFailure(ctx, v, fmt.Sprintf("invalid 200 response body: %s", string(respBytes)))
			return
		}
		w.recordSuccess(ctx, v, okResp.ExternalRef, "pushed")

	case http.StatusConflict:
		// Duplicate client_ref: Parse existing external_ref and reconcile!
		var conflictResp struct {
			Error       string `json:"error"`
			ExternalRef string `json:"external_ref"`
		}
		if err := json.Unmarshal(respBytes, &conflictResp); err == nil && conflictResp.ExternalRef != "" {
			log.Printf("[%s] Reconciled duplicate client_ref %s with external_ref %s", w.id, v.ClientRef, conflictResp.ExternalRef)
			w.recordSuccess(ctx, v, conflictResp.ExternalRef, "reconciled via 409 duplicate")
			return
		}
		w.recordFailure(ctx, v, fmt.Sprintf("409 conflict but missing external_ref: %s", string(respBytes)))

	default:
		w.recordFailure(ctx, v, fmt.Sprintf("remote error status %d: %s", resp.StatusCode, string(respBytes)))
	}
}

func (w *SyncWorker) recordSuccess(ctx context.Context, v ClaimedVoucher, externalRef, note string) {
	_, err := w.pool.Exec(ctx, `
		UPDATE vouchers
		SET status = 'pushed',
		    external_ref = $1,
		    locked_until = NULL,
		    locked_by = NULL,
		    last_error = NULL,
		    updated_at = NOW()
		WHERE id = $2;
	`, externalRef, v.ID)

	if err != nil {
		log.Printf("[%s] Error recording success for voucher %s: %v", w.id, v.ID, err)
		return
	}

	log.Printf("[%s] Successfully completed voucher %s (%s, external_ref=%s)", w.id, v.ID, note, externalRef)
}

func (w *SyncWorker) recordFailure(ctx context.Context, v ClaimedVoucher, reason string) {
	log.Printf("[%s] Failure for voucher %s (attempt %d/%d): %s", w.id, v.ID, v.Attempts, w.cfg.WorkerMaxAttempts, reason)

	if v.Attempts >= w.cfg.WorkerMaxAttempts {
		// Exhausted retry budget -> mark as permanently failed
		_, err := w.pool.Exec(ctx, `
			UPDATE vouchers
			SET status = 'failed',
			    last_error = $1,
			    locked_until = NULL,
			    locked_by = NULL,
			    updated_at = NOW()
			WHERE id = $2;
		`, reason, v.ID)

		if err != nil {
			log.Printf("[%s] Error marking voucher %s failed: %v", w.id, v.ID, err)
		} else {
			log.Printf("[%s] Voucher %s transitioned to 'failed' after %d attempts", w.id, v.ID, v.Attempts)
		}
		return
	}

	// Calculate exponential backoff with jitter
	// backoff = 2^(attempts-1) + jitter [0.1s to 1.0s]
	w.rngMu.Lock()
	jitter := w.rng.Float64() * 0.9 + 0.1
	w.rngMu.Unlock()

	backoffSec := math.Pow(2.0, float64(v.Attempts-1)) + jitter
	if backoffSec > 60 {
		backoffSec = 60
	}

	_, err := w.pool.Exec(ctx, `
		UPDATE vouchers
		SET next_attempt_at = NOW() + ($1 * INTERVAL '1 second'),
		    last_error = $2,
		    locked_until = NULL,
		    locked_by = NULL,
		    updated_at = NOW()
		WHERE id = $3;
	`, backoffSec, reason, v.ID)

	if err != nil {
		log.Printf("[%s] Error scheduling backoff for voucher %s: %v", w.id, v.ID, err)
	} else {
		log.Printf("[%s] Scheduled voucher %s for retry in %.2fs", w.id, v.ID, backoffSec)
	}
}
