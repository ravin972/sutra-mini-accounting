package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"sutra-mini/internal/models"
)

var (
	ErrIssueNotFound        = errors.New("issue not found")
	ErrOvershoot            = errors.New("overshoot: total received quantity cannot exceed issued quantity")
	ErrIdempotencyConflict  = errors.New("idempotency key reused with different request payload")
	ErrInvalidRequest       = errors.New("invalid request parameters")
	ErrMissingIdempotencyKey = errors.New("missing Idempotency-Key header")
)

type ReceiptService struct {
	pool *pgxpool.Pool
}

func NewReceiptService(pool *pgxpool.Pool) *ReceiptService {
	return &ReceiptService{pool: pool}
}

// CreateReceipt creates a receipt and voucher atomically while preventing overshoots and ensuring idempotency.
func (s *ReceiptService) CreateReceipt(ctx context.Context, idempotencyKey string, req models.ReceiptCreateRequest) (*models.ReceiptCreateResponse, error) {
	if strings.TrimSpace(idempotencyKey) == "" {
		return nil, ErrMissingIdempotencyKey
	}
	if req.Qty <= 0 {
		return nil, fmt.Errorf("%w: qty must be greater than 0", ErrInvalidRequest)
	}
	if strings.TrimSpace(req.IssueID) == "" {
		return nil, fmt.Errorf("%w: issue_id is required", ErrInvalidRequest)
	}
	if _, err := time.Parse("2006-01-02", req.ReceivedOn); err != nil {
		return nil, fmt.Errorf("%w: received_on must be YYYY-MM-DD", ErrInvalidRequest)
	}

	requestHash := req.ComputeHash()

	// 1. Check if the idempotency key was already recorded
	existing, err := s.lookupExistingReceiptByKey(ctx, idempotencyKey)
	if err != nil {
		return nil, fmt.Errorf("lookup idempotency key: %w", err)
	}
	if existing != nil {
		if existing.Receipt.RequestHash != requestHash {
			return nil, ErrIdempotencyConflict
		}
		existing.IsReplay = true
		return existing, nil
	}

	// 2. Begin transaction for coordinated creation
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 3. Acquire row lock on the issue to serialize concurrent receipt claims for this issue
	var issuedQty int
	err = tx.QueryRow(ctx, `
		SELECT qty FROM jobwork_issues
		WHERE id = $1
		FOR UPDATE;
	`, req.IssueID).Scan(&issuedQty)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrIssueNotFound
		}
		return nil, fmt.Errorf("lock jobwork issue: %w", err)
	}

	// 4. Calculate total received so far for this issue
	var totalReceived int
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(qty), 0)
		FROM jobwork_receipts
		WHERE issue_id = $1;
	`, req.IssueID).Scan(&totalReceived)
	if err != nil {
		return nil, fmt.Errorf("calculate total received: %w", err)
	}

	// 5. Enforce strictly that total received + new qty <= issued quantity
	if totalReceived+req.Qty > issuedQty {
		return nil, fmt.Errorf("%w: issued=%d, already_received=%d, requested=%d, remaining=%d",
			ErrOvershoot, issuedQty, totalReceived, req.Qty, issuedQty-totalReceived)
	}

	// 6. Insert the receipt row
	receiptID := uuid.New().String()
	var receiptCreatedAt time.Time
	var receivedOnDate time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO jobwork_receipts (id, issue_id, qty, received_on, idempotency_key, request_hash, created_at)
		VALUES ($1, $2, $3, $4::date, $5, $6, NOW())
		RETURNING created_at, received_on;
	`, receiptID, req.IssueID, req.Qty, req.ReceivedOn, idempotencyKey, requestHash).Scan(&receiptCreatedAt, &receivedOnDate)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			// Concurrent duplicate replay raced into insert; query the committed one
			_ = tx.Rollback(ctx)
			recheck, recheckErr := s.lookupExistingReceiptByKey(ctx, idempotencyKey)
			if recheckErr == nil && recheck != nil {
				if recheck.Receipt.RequestHash != requestHash {
					return nil, ErrIdempotencyConflict
				}
				recheck.IsReplay = true
				return recheck, nil
			}
		}
		return nil, fmt.Errorf("insert receipt: %w", err)
	}

	// 7. Insert the voucher row in the SAME database transaction
	voucherID := uuid.New().String()
	clientRef := fmt.Sprintf("VCHR-%s", receiptID)
	// Jobwork rate: 25000 paise (Rs. 250.00) per unit
	amountPaise := int64(req.Qty) * 25000

	var voucherCreatedAt, voucherUpdatedAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO vouchers (
			id, type, source_id, amount_paise, status, attempts,
			client_ref, next_attempt_at, created_at, updated_at
		) VALUES (
			$1, 'JOBWORK_RECEIPT', $2, $3, 'pending', 0,
			$4, NOW(), NOW(), NOW()
		)
		RETURNING created_at, updated_at;
	`, voucherID, receiptID, amountPaise, clientRef).Scan(&voucherCreatedAt, &voucherUpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("insert voucher: %w", err)
	}

	// 8. Commit the transaction
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit receipt transaction: %w", err)
	}

	return &models.ReceiptCreateResponse{
		Receipt: models.JobworkReceipt{
			ID:             receiptID,
			IssueID:        req.IssueID,
			Qty:            req.Qty,
			ReceivedOn:     req.ReceivedOn,
			IdempotencyKey: idempotencyKey,
			RequestHash:    requestHash,
			CreatedAt:      receiptCreatedAt,
		},
		Voucher: models.Voucher{
			ID:            voucherID,
			Type:          "JOBWORK_RECEIPT",
			SourceID:      receiptID,
			AmountPaise:   amountPaise,
			Status:        models.VoucherStatusPending,
			Attempts:      0,
			ClientRef:     clientRef,
			NextAttemptAt: voucherCreatedAt,
			CreatedAt:     voucherCreatedAt,
			UpdatedAt:     voucherUpdatedAt,
		},
		IsReplay: false,
	}, nil
}

// lookupExistingReceiptByKey looks up an already committed receipt and voucher for an idempotency key.
func (s *ReceiptService) lookupExistingReceiptByKey(ctx context.Context, key string) (*models.ReceiptCreateResponse, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT 
			r.id, r.issue_id, r.qty, r.received_on::text, r.idempotency_key, r.request_hash, r.created_at,
			v.id, v.type, v.source_id, v.amount_paise, v.status, v.attempts, v.last_error,
			v.client_ref, v.external_ref, v.locked_until, v.locked_by, v.next_attempt_at, v.created_at, v.updated_at
		FROM jobwork_receipts r
		JOIN vouchers v ON v.source_id = r.id
		WHERE r.idempotency_key = $1;
	`, key)

	var (
		rcpt    models.JobworkReceipt
		vchr    models.Voucher
		status  string
	)

	err := row.Scan(
		&rcpt.ID, &rcpt.IssueID, &rcpt.Qty, &rcpt.ReceivedOn, &rcpt.IdempotencyKey, &rcpt.RequestHash, &rcpt.CreatedAt,
		&vchr.ID, &vchr.Type, &vchr.SourceID, &vchr.AmountPaise, &status, &vchr.Attempts, &vchr.LastError,
		&vchr.ClientRef, &vchr.ExternalRef, &vchr.LockedUntil, &vchr.LockedBy, &vchr.NextAttemptAt, &vchr.CreatedAt, &vchr.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	vchr.Status = models.VoucherStatus(status)

	return &models.ReceiptCreateResponse{
		Receipt: rcpt,
		Voucher: vchr,
	}, nil
}

// GetIssueSummary returns the issue with current issued, received and outstanding quantities.
func (s *ReceiptService) GetIssueSummary(ctx context.Context, issueID string) (*models.IssueSummary, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT 
			i.id, i.party_id, p.name AS party_name, p.phone AS party_phone,
			i.sku_id, s.code AS sku_code, s.name AS sku_name, s.image_url AS sku_image_url,
			i.qty AS issued_qty,
			COALESCE(SUM(r.qty), 0)::int AS total_received_qty,
			(i.qty - COALESCE(SUM(r.qty), 0))::int AS outstanding_qty,
			i.issued_on::text AS issued_on,
			i.created_at
		FROM jobwork_issues i
		JOIN parties p ON p.id = i.party_id
		JOIN skus s ON s.id = i.sku_id
		LEFT JOIN jobwork_receipts r ON r.issue_id = i.id
		WHERE i.id = $1
		GROUP BY i.id, p.name, p.phone, s.code, s.name, s.image_url;
	`, issueID)

	var summary models.IssueSummary
	err := row.Scan(
		&summary.ID, &summary.PartyID, &summary.PartyName, &summary.PartyPhone,
		&summary.SKUID, &summary.SKUCode, &summary.SKUName, &summary.SKUImageURL,
		&summary.IssuedQty, &summary.TotalReceivedQty, &summary.OutstandingQty,
		&summary.IssuedOn, &summary.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrIssueNotFound
		}
		return nil, fmt.Errorf("query issue summary: %w", err)
	}

	return &summary, nil
}

// ListIssues returns all jobwork issues with their current status and remaining balance.
func (s *ReceiptService) ListIssues(ctx context.Context) ([]models.IssueSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT 
			i.id, i.party_id, p.name AS party_name, p.phone AS party_phone,
			i.sku_id, s.code AS sku_code, s.name AS sku_name, s.image_url AS sku_image_url,
			i.qty AS issued_qty,
			COALESCE(SUM(r.qty), 0)::int AS total_received_qty,
			(i.qty - COALESCE(SUM(r.qty), 0))::int AS outstanding_qty,
			i.issued_on::text AS issued_on,
			i.created_at
		FROM jobwork_issues i
		JOIN parties p ON p.id = i.party_id
		JOIN skus s ON s.id = i.sku_id
		LEFT JOIN jobwork_receipts r ON r.issue_id = i.id
		GROUP BY i.id, p.name, p.phone, s.code, s.name, s.image_url
		ORDER BY i.created_at DESC;
	`)
	if err != nil {
		return nil, fmt.Errorf("query issues: %w", err)
	}
	defer rows.Close()

	list := make([]models.IssueSummary, 0)
	for rows.Next() {
		var summary models.IssueSummary
		if err := rows.Scan(
			&summary.ID, &summary.PartyID, &summary.PartyName, &summary.PartyPhone,
			&summary.SKUID, &summary.SKUCode, &summary.SKUName, &summary.SKUImageURL,
			&summary.IssuedQty, &summary.TotalReceivedQty, &summary.OutstandingQty,
			&summary.IssuedOn, &summary.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan issue summary: %w", err)
		}
		list = append(list, summary)
	}

	return list, nil
}
