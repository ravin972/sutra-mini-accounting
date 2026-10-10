package models

import (
	"testing"
)

func TestReceiptCreateRequestHash(t *testing.T) {
	req1 := ReceiptCreateRequest{
		IssueID:    "issue-123",
		Qty:        5,
		ReceivedOn: "2026-10-10",
	}
	req2 := ReceiptCreateRequest{
		IssueID:    "issue-123",
		Qty:        5,
		ReceivedOn: "2026-10-10",
	}
	req3 := ReceiptCreateRequest{
		IssueID:    "issue-123",
		Qty:        6, // different qty
		ReceivedOn: "2026-10-10",
	}

	hash1 := req1.ComputeHash()
	hash2 := req2.ComputeHash()
	hash3 := req3.ComputeHash()

	if hash1 != hash2 {
		t.Errorf("expected hash1 == hash2, got %s != %s", hash1, hash2)
	}
	if hash1 == hash3 {
		t.Errorf("expected hash1 != hash3, got %s == %s", hash1, hash3)
	}
}
