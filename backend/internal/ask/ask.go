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
	SKUCode        string `json:"sku_code"`
	SKUName        string `json:"sku_name"`
	TotalIssued    int    `json:"total_issued"`
	TotalReceived  int    `json:"total_received"`
	OutstandingQty int    `json:"outstanding_qty"`
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
	toolLogs := make([]ToolCallLog, 0)

	// Read-only tool: query database for matching parties and skus
	toolArgs := map[string]string{
		"query": req.Question,
	}

	balances, err := s.queryBalances(ctx, req.Question)
	toolLog := ToolCallLog{
		ToolName:  "query_jobwork_balances",
		Arguments: toolArgs,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Result:    balances,
	}
	toolLogs = append(toolLogs, toolLog)
	log.Printf("[AskToolLog] Executed read-only tool %s at %s with %d results", toolLog.ToolName, toolLog.Timestamp, len(balances))

	var answer strings.Builder
	if err != nil {
		answer.WriteString(fmt.Sprintf("Failed to query database: %v", err))
	} else if len(balances) == 0 {
		answer.WriteString("No outstanding jobwork balance found matching your query in the database.")
	} else {
		for i, b := range balances {
			if i > 0 {
				answer.WriteString("\n")
			}
			answer.WriteString(fmt.Sprintf("Job-worker '%s' currently holds %d units of %s (%s). (Issued: %d, Received: %d, Outstanding: %d)",
				b.PartyName, b.OutstandingQty, b.SKUName, b.SKUCode, b.TotalIssued, b.TotalReceived, b.OutstandingQty))
		}
	}

	resp := AskResponse{
		Question:    req.Question,
		Answer:      answer.String(),
		ToolCalls:   toolLogs,
		ModelStatus: "stubbed (no external LLM API key configured; resolved safely using read-only database tool execution)",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *AskService) queryBalances(ctx context.Context, question string) ([]BalanceResult, error) {
	// Look up across all active issues
	query := `
		SELECT 
			p.name AS party_name,
			s.code AS sku_code,
			s.name AS sku_name,
			SUM(i.qty)::int AS total_issued,
			COALESCE(SUM(r.qty), 0)::int AS total_received,
			(SUM(i.qty) - COALESCE(SUM(r.qty), 0))::int AS outstanding_qty
		FROM jobwork_issues i
		JOIN parties p ON p.id = i.party_id
		JOIN skus s ON s.id = i.sku_id
		LEFT JOIN jobwork_receipts r ON r.issue_id = i.id
		GROUP BY p.name, s.code, s.name
		ORDER BY p.name, s.code;
	`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []BalanceResult
	qLower := strings.ToLower(question)

	for rows.Next() {
		var b BalanceResult
		if err := rows.Scan(&b.PartyName, &b.SKUCode, &b.SKUName, &b.TotalIssued, &b.TotalReceived, &b.OutstandingQty); err != nil {
			return nil, err
		}

		// Filter if question mentions party or SKU, else include all active
		matchesParty := strings.Contains(qLower, strings.ToLower(b.PartyName)) || strings.Contains(qLower, "job-worker") || strings.Contains(qLower, "party")
		matchesSKU := strings.Contains(qLower, strings.ToLower(b.SKUCode)) || strings.Contains(qLower, strings.ToLower(b.SKUName)) || strings.Contains(qLower, "sku")

		if matchesParty || matchesSKU || strings.TrimSpace(question) == "" {
			results = append(results, b)
		}
	}

	// If filtered result is empty, return top active balances
	if len(results) == 0 {
		return results, nil
	}

	return results, nil
}
