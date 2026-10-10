package models

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
)

type VoucherStatus string

const (
	VoucherStatusPending VoucherStatus = "pending"
	VoucherStatusPushed  VoucherStatus = "pushed"
	VoucherStatusFailed  VoucherStatus = "failed"
)

type SKU struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	ImageURL  string    `json:"image_url"`
	CreatedAt time.Time `json:"created_at"`
}

type Party struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	CreatedAt time.Time `json:"created_at"`
}

type JobworkIssue struct {
	ID        string    `json:"id"`
	PartyID   string    `json:"party_id"`
	SKUID     string    `json:"sku_id"`
	Qty       int       `json:"qty"`
	IssuedOn  string    `json:"issued_on"`
	CreatedAt time.Time `json:"created_at"`
}

type IssueSummary struct {
	ID               string    `json:"id"`
	PartyID          string    `json:"party_id"`
	PartyName        string    `json:"party_name"`
	PartyPhone       string    `json:"party_phone"`
	SKUID            string    `json:"sku_id"`
	SKUCode          string    `json:"sku_code"`
	SKUName          string    `json:"sku_name"`
	SKUImageURL      string    `json:"sku_image_url"`
	IssuedQty        int       `json:"issued_qty"`
	TotalReceivedQty int       `json:"total_received_qty"`
	OutstandingQty   int       `json:"outstanding_qty"`
	IssuedOn         string    `json:"issued_on"`
	CreatedAt        time.Time `json:"created_at"`
}

type JobworkReceipt struct {
	ID             string    `json:"id"`
	IssueID        string    `json:"issue_id"`
	Qty            int       `json:"qty"`
	ReceivedOn     string    `json:"received_on"`
	IdempotencyKey string    `json:"idempotency_key"`
	RequestHash    string    `json:"request_hash"`
	CreatedAt      time.Time `json:"created_at"`
}

type Voucher struct {
	ID            string        `json:"id"`
	Type          string        `json:"type"`
	SourceID      string        `json:"source_id"`
	AmountPaise   int64         `json:"amount_paise"`
	Status        VoucherStatus `json:"status"`
	Attempts      int           `json:"attempts"`
	LastError     *string       `json:"last_error,omitempty"`
	ClientRef     string        `json:"client_ref"`
	ExternalRef   *string       `json:"external_ref,omitempty"`
	LockedUntil   *time.Time    `json:"locked_until,omitempty"`
	LockedBy      *string       `json:"locked_by,omitempty"`
	NextAttemptAt time.Time     `json:"next_attempt_at"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
}

type ReceiptCreateRequest struct {
	IssueID    string `json:"issue_id"`
	Qty        int    `json:"qty"`
	ReceivedOn string `json:"received_on"`
}

func (r *ReceiptCreateRequest) ComputeHash() string {
	data := fmt.Sprintf("%s:%d:%s", r.IssueID, r.Qty, r.ReceivedOn)
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

type ReceiptCreateResponse struct {
	Receipt  JobworkReceipt `json:"receipt"`
	Voucher  Voucher        `json:"voucher"`
	IsReplay bool           `json:"is_replay"`
}

type MockAccountingRequest struct {
	ClientRef   string `json:"client_ref"`
	Type        string `json:"type"`
	AmountPaise int64  `json:"amount_paise"`
	SourceID    string `json:"source_id"`
}

type MockAccountingResponse struct {
	Status      string `json:"status"`
	ExternalRef string `json:"external_ref"`
	Message     string `json:"message,omitempty"`
}
