package ask

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AskService struct {
	pool *pgxpool.Pool
}

func NewAskService(pool *pgxpool.Pool) *AskService {
	return &AskService{pool: pool}
}

type AskRequest struct {
	Question string `json:"question"`
}

type ToolCallLog struct {
	ToolName  string `json:"tool_name"`
	Arguments any    `json:"arguments"`
	Timestamp string `json:"timestamp"`
	Result    any    `json:"result"`
}

type AskResponse struct {
	Question    string        `json:"question"`
	Answer      string        `json:"answer"`
	ToolCalls   []ToolCallLog `json:"tool_calls"`
	ModelStatus string        `json:"model_status"`
}

type BalanceResult struct {
	PartyName      string `json:"party_name"`
	PartyPhone     string `json:"party_phone"`
	SKUCode        string `json:"sku_code"`
	SKUName        string `json:"sku_name"`
	TotalIssued    int    `json:"total_issued"`
	TotalReceived  int    `json:"total_received"`
	OutstandingQty int    `json:"outstanding_qty"`
}

type VoucherStatsResult struct {
	TotalVouchers    int   `json:"total_vouchers"`
	PushedCount      int   `json:"pushed_count"`
	PendingCount     int   `json:"pending_count"`
	FailedCount      int   `json:"failed_count"`
	TotalAmountPaise int64 `json:"total_amount_paise"`
}

type FailedVoucherResult struct {
	ID        string `json:"id"`
	ClientRef string `json:"client_ref"`
	Attempts  int    `json:"attempts"`
	LastError string `json:"last_error"`
}

func (s *AskService) HandleAsk(w http.ResponseWriter, r *http.Request) {
	var req AskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Question) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "question field is required"})
		return
	}

	ctx := r.Context()
	qLower := strings.ToLower(req.Question)
	toolLogs := make([]ToolCallLog, 0)
	var answer strings.Builder

	// Intent Classification
	isVoucherQuery := strings.Contains(qLower, "voucher") || strings.Contains(qLower, "failed") ||
		strings.Contains(qLower, "pushed") || strings.Contains(qLower, "pending") ||
		strings.Contains(qLower, "ledger") || strings.Contains(qLower, "sync") ||
		strings.Contains(qLower, "settlement") || strings.Contains(qLower, "error")

	isBalanceQuery := strings.Contains(qLower, "rafiq") || strings.Contains(qLower, "laxmi") ||
		strings.Contains(qLower, "artisan") || strings.Contains(qLower, "balance") ||
		strings.Contains(qLower, "holding") || strings.Contains(qLower, "kurti") ||
		strings.Contains(qLower, "lehenga") || strings.Contains(qLower, "suit") ||
		strings.Contains(qLower, "dupatta") || strings.Contains(qLower, "saree") ||
		strings.Contains(qLower, "qty") || strings.Contains(qLower, "unit") ||
		strings.Contains(qLower, "outstanding") || strings.Contains(qLower, "inventory")

	// 1. If voucher or error query
	if isVoucherQuery {
		stats, err := s.queryVoucherStats(ctx)
		if err == nil {
			toolLogs = append(toolLogs, ToolCallLog{
				ToolName:  "query_voucher_statistics",
				Arguments: map[string]string{"filter": "aggregate"},
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Result:    stats,
			})

			answer.WriteString(fmt.Sprintf(
				"📊 **Accounting Ledger Status**:\n• Total Vouchers: %d\n• Successfully Pushed: %d\n• Pending in Queue: %d\n• Failed (Exhausted): %d\n• Total Settled Value: ₹%.2f\n\n",
				stats.TotalVouchers, stats.PushedCount, stats.PendingCount, stats.FailedCount, float64(stats.TotalAmountPaise)/100.0,
			))
		}

		if stats.FailedCount > 0 || strings.Contains(qLower, "failed") || strings.Contains(qLower, "error") {
			failedVouchers, err := s.queryFailedVouchers(ctx)
			if err == nil && len(failedVouchers) > 0 {
				toolLogs = append(toolLogs, ToolCallLog{
					ToolName:  "query_failed_vouchers",
					Arguments: map[string]string{"status": "failed"},
					Timestamp: time.Now().UTC().Format(time.RFC3339),
					Result:    failedVouchers,
				})

				answer.WriteString("⚠️ **Failed Vouchers Requiring Action**:\n")
				for _, fv := range failedVouchers {
					answer.WriteString(fmt.Sprintf("• Ref `%s` (Attempts: %d): %s\n", fv.ClientRef, fv.Attempts, fv.LastError))
				}
				answer.WriteString("\n*Tip: You can re-arm any failed voucher using the 'Retry' button on the dashboard.*\n")
			} else if stats.FailedCount == 0 {
				answer.WriteString("✅ There are currently zero failed vouchers. All outbox entries have been successfully synchronized.\n")
			}
		}
	}

	// 2. If balance query or if neither (general question)
	if isBalanceQuery || !isVoucherQuery {
		balances, err := s.queryBalances(ctx, req.Question)
		toolLogs = append(toolLogs, ToolCallLog{
			ToolName:  "query_jobwork_balances",
			Arguments: map[string]string{"query": req.Question},
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Result:    balances,
		})

		if err != nil {
			answer.WriteString(fmt.Sprintf("Failed to query database: %v", err))
		} else if len(balances) == 0 {
			answer.WriteString("No jobwork balances found matching that artisan or SKU in the system.")
		} else {
			if answer.Len() > 0 {
				answer.WriteString("\n📦 **Artisan Batch Reconciliation**:\n")
			} else {
				answer.WriteString("📦 **Artisan Batch Reconciliation**:\n")
			}

			for _, b := range balances {
				statusStr := fmt.Sprintf("%d pcs remaining", b.OutstandingQty)
				if b.OutstandingQty == 0 {
					statusStr = "Fully fulfilled"
				}

				answer.WriteString(fmt.Sprintf(
					"• **%s** holds **%d units** of *%s* (`%s`)\n  Issued: %d | Received: %d | Status: %s\n",
					b.PartyName, b.OutstandingQty, b.SKUName, b.SKUCode, b.TotalIssued, b.TotalReceived, statusStr,
				))
			}
		}
	}

	log.Printf("[AskService] Processed query '%s' with %d tool calls", req.Question, len(toolLogs))

	resp := AskResponse{
		Question:    req.Question,
		Answer:      strings.TrimSpace(answer.String()),
		ToolCalls:   toolLogs,
		ModelStatus: "Audited Autonomous Ledger Agent (Direct read-only transactional tools)",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *AskService) queryVoucherStats(ctx context.Context) (VoucherStatsResult, error) {
	var res VoucherStatsResult
	row := s.pool.QueryRow(ctx, `
		SELECT 
			COUNT(*)::int AS total,
			COUNT(*) FILTER (WHERE status = 'pushed')::int AS pushed,
			COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
			COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
			COALESCE(SUM(amount_paise) FILTER (WHERE status = 'pushed'), 0)::bigint AS total_paise
		FROM vouchers;
	`)
	err := row.Scan(&res.TotalVouchers, &res.PushedCount, &res.PendingCount, &res.FailedCount, &res.TotalAmountPaise)
	return res, err
}

func (s *AskService) queryFailedVouchers(ctx context.Context) ([]FailedVoucherResult, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, client_ref, attempts, COALESCE(last_error, 'Unknown failure')
		FROM vouchers
		WHERE status = 'failed'
		ORDER BY updated_at DESC
		LIMIT 10;
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]FailedVoucherResult, 0)
	for rows.Next() {
		var f FailedVoucherResult
		if err := rows.Scan(&f.ID, &f.ClientRef, &f.Attempts, &f.LastError); err != nil {
			return nil, err
		}
		list = append(list, f)
	}
	return list, nil
}

func (s *AskService) queryBalances(ctx context.Context, question string) ([]BalanceResult, error) {
	query := `
		SELECT 
			p.name AS party_name,
			p.phone AS party_phone,
			s.code AS sku_code,
			s.name AS sku_name,
			SUM(i.qty)::int AS total_issued,
			COALESCE(SUM(r.qty), 0)::int AS total_received,
			(SUM(i.qty) - COALESCE(SUM(r.qty), 0))::int AS outstanding_qty
		FROM jobwork_issues i
		JOIN parties p ON p.id = i.party_id
		JOIN skus s ON s.id = i.sku_id
		LEFT JOIN jobwork_receipts r ON r.issue_id = i.id
		GROUP BY p.name, p.phone, s.code, s.name
		ORDER BY p.name, s.code;
	`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []BalanceResult
	qLower := strings.ToLower(question)
	words := strings.Fields(qLower)

	for rows.Next() {
		var b BalanceResult
		if err := rows.Scan(&b.PartyName, &b.PartyPhone, &b.SKUCode, &b.SKUName, &b.TotalIssued, &b.TotalReceived, &b.OutstandingQty); err != nil {
			return nil, err
		}
		all = append(all, b)
	}

	// Filter based on tokens
	var filtered []BalanceResult
	for _, b := range all {
		partyLower := strings.ToLower(b.PartyName)
		skuNameLower := strings.ToLower(b.SKUName)
		skuCodeLower := strings.ToLower(b.SKUCode)

		matched := false
		for _, w := range words {
			cleanWord := strings.Trim(w, ",.?!'\"")
			if len(cleanWord) < 3 {
				continue
			}
			if strings.Contains(partyLower, cleanWord) ||
				strings.Contains(skuNameLower, cleanWord) ||
				strings.Contains(skuCodeLower, cleanWord) {
				matched = true
				break
			}
		}

		if matched {
			filtered = append(filtered, b)
		}
	}

	// If no specific match, return top balances
	if len(filtered) == 0 {
		if len(all) > 5 {
			return all[:5], nil
		}
		return all, nil
	}

	return filtered, nil
}
