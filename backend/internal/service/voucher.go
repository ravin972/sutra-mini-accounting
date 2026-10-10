package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sutra-mini/internal/models"
)

var (
	ErrVoucherNotFound     = errors.New("voucher not found")
	ErrVoucherAlreadyPushed = errors.New("cannot retry voucher that has already been pushed")
	ErrInvalidVoucherStatus = errors.New("invalid status parameter; allowed values are 'pending', 'pushed', 'failed'")
)

type VoucherService struct {
	pool *pgxpool.Pool
}

func NewVoucherService(pool *pgxpool.Pool) *VoucherService {
	return &VoucherService{pool: pool}
}

// ListVouchers returns vouchers, optionally filtered by status, with deterministic ordering.
func (s *VoucherService) ListVouchers(ctx context.Context, statusFilter string) ([]models.Voucher, error) {
	statusFilter = strings.TrimSpace(strings.ToLower(statusFilter))

	var query string
	var args []any

	if statusFilter != "" {
		if statusFilter != "pending" && statusFilter != "pushed" && statusFilter != "failed" {
			return nil, ErrInvalidVoucherStatus
		}
		query = `
			SELECT 
				id, type, source_id, amount_paise, status, attempts, last_error,
				client_ref, external_ref, locked_until, locked_by, next_attempt_at,
				created_at, updated_at
			FROM vouchers
			WHERE status = $1
			ORDER BY created_at DESC, id ASC;
		`
		args = append(args, statusFilter)
	} else {
		query = `
			SELECT 
				id, type, source_id, amount_paise, status, attempts, last_error,
				client_ref, external_ref, locked_until, locked_by, next_attempt_at,
				created_at, updated_at
			FROM vouchers
			ORDER BY created_at DESC, id ASC;
		`
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list vouchers: %w", err)
	}
	defer rows.Close()

	var vouchers []models.Voucher
	for rows.Next() {
		var (
			v      models.Voucher
			status string
		)
		err := rows.Scan(
			&v.ID, &v.Type, &v.SourceID, &v.AmountPaise, &status, &v.Attempts, &v.LastError,
			&v.ClientRef, &v.ExternalRef, &v.LockedUntil, &v.LockedBy, &v.NextAttemptAt,
			&v.CreatedAt, &v.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan voucher: %w", err)
		}
		v.Status = models.VoucherStatus(status)
		vouchers = append(vouchers, v)
	}

	if vouchers == nil {
		vouchers = []models.Voucher{}
	}

	return vouchers, nil
}

// RetryVoucher re-arms a failed voucher for immediate worker pickup.
// Historical attempt counts are preserved for auditing, but the failure lease is cleared
// and status transitions from 'failed' to 'pending' with next_attempt_at = NOW().
func (s *VoucherService) RetryVoucher(ctx context.Context, voucherID string) (*models.Voucher, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var (
		v      models.Voucher
		status string
	)

	// Lock the voucher row
	err = tx.QueryRow(ctx, `
		SELECT 
			id, type, source_id, amount_paise, status, attempts, last_error,
			client_ref, external_ref, locked_until, locked_by, next_attempt_at,
			created_at, updated_at
		FROM vouchers
		WHERE id = $1
		FOR UPDATE;
	`, voucherID).Scan(
		&v.ID, &v.Type, &v.SourceID, &v.AmountPaise, &status, &v.Attempts, &v.LastError,
		&v.ClientRef, &v.ExternalRef, &v.LockedUntil, &v.LockedBy, &v.NextAttemptAt,
		&v.CreatedAt, &v.UpdatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrVoucherNotFound
		}
		return nil, fmt.Errorf("query voucher for retry: %w", err)
	}

	v.Status = models.VoucherStatus(status)

	if v.Status == models.VoucherStatusPushed {
		return nil, ErrVoucherAlreadyPushed
	}

	// If already pending, it is already scheduled for worker
	if v.Status == models.VoucherStatusPending {
		// Just ensure lease is unlocked and scheduled now
		_, err = tx.Exec(ctx, `
			UPDATE vouchers
			SET locked_until = NULL,
				locked_by = NULL,
				next_attempt_at = NOW(),
				updated_at = NOW()
			WHERE id = $1;
		`, voucherID)
		if err != nil {
			return nil, fmt.Errorf("reset pending voucher: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &v, nil
	}

	// Voucher was failed; re-arm to pending, reset attempts to allow fresh retry cycle
	// while keeping note in last_error of historical retry.
	note := fmt.Sprintf("Manually re-armed for retry (previous attempts: %d)", v.Attempts)
	err = tx.QueryRow(ctx, `
		UPDATE vouchers
		SET status = 'pending',
			attempts = 0,
			locked_until = NULL,
			locked_by = NULL,
			next_attempt_at = NOW(),
			last_error = $2,
			updated_at = NOW()
		WHERE id = $1
		RETURNING status, attempts, next_attempt_at, updated_at;
	`, voucherID, note).Scan(&status, &v.Attempts, &v.NextAttemptAt, &v.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("update voucher to pending: %w", err)
	}

	v.Status = models.VoucherStatus(status)
	v.LastError = &note

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit voucher retry: %w", err)
	}

	return &v, nil
}
