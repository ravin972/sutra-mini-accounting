package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sutra-mini/internal/ask"
	"sutra-mini/internal/config"
	"sutra-mini/internal/db"
	"sutra-mini/internal/models"
	"sutra-mini/internal/service"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Printf("Connecting to database: %s", maskDatabaseURL(cfg.DatabaseURL))
	pool, err := db.InitPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Database connection failed: %v", err)
	}
	defer pool.Close()

	// Automatically run migrations on startup
	migrationsDir := "../migrations"
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		migrationsDir = "migrations"
	}
	if err := db.RunMigrations(ctx, pool, migrationsDir); err != nil {
		log.Printf("Warning: running migrations: %v", err)
	}

	receiptSvc := service.NewReceiptService(pool)
	voucherSvc := service.NewVoucherService(pool)
	askSvc := ask.NewAskService(pool)

	mux := http.NewServeMux()

	// Healthcheck
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
	})

	// POST /jobwork/receipts
	mux.HandleFunc("POST /jobwork/receipts", func(w http.ResponseWriter, r *http.Request) {
		// Limit request body size to 1MB
		r.Body = http.MaxBytesReader(w, r.Body, 1048576)

		idempotencyKey := r.Header.Get("Idempotency-Key")
		if idempotencyKey == "" {
			writeError(w, http.StatusBadRequest, "Missing required 'Idempotency-Key' header")
			return
		}

		var req models.ReceiptCreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("Invalid JSON request body: %v", err))
			return
		}

		resp, err := receiptSvc.CreateReceipt(r.Context(), idempotencyKey, req)
		if err != nil {
			switch {
			case errors.Is(err, service.ErrMissingIdempotencyKey):
				writeError(w, http.StatusBadRequest, err.Error())
			case errors.Is(err, service.ErrInvalidRequest):
				writeError(w, http.StatusBadRequest, err.Error())
			case errors.Is(err, service.ErrIssueNotFound):
				writeError(w, http.StatusNotFound, err.Error())
			case errors.Is(err, service.ErrOvershoot):
				writeError(w, http.StatusUnprocessableEntity, err.Error())
			case errors.Is(err, service.ErrIdempotencyConflict):
				writeError(w, http.StatusConflict, err.Error())
			default:
				log.Printf("Internal error creating receipt: %v", err)
				writeError(w, http.StatusInternalServerError, "An internal database error occurred while creating receipt")
			}
			return
		}

		statusCode := http.StatusCreated
		if resp.IsReplay {
			statusCode = http.StatusOK
		}

		writeJSON(w, statusCode, resp)
	})

	// GET /issues
	mux.HandleFunc("GET /issues", func(w http.ResponseWriter, r *http.Request) {
		issues, err := receiptSvc.ListIssues(r.Context())
		if err != nil {
			log.Printf("Error querying issues: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to query issues")
			return
		}
		writeJSON(w, http.StatusOK, issues)
	})

	// GET /issues/{id}
	mux.HandleFunc("GET /issues/{id}", func(w http.ResponseWriter, r *http.Request) {
		issueID := r.PathValue("id")
		if issueID == "" {
			writeError(w, http.StatusBadRequest, "Issue id is required")
			return
		}

		summary, err := receiptSvc.GetIssueSummary(r.Context(), issueID)
		if err != nil {
			if errors.Is(err, service.ErrIssueNotFound) {
				writeError(w, http.StatusNotFound, "Issue not found")
				return
			}
			log.Printf("Error querying issue summary: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to query issue summary")
			return
		}

		writeJSON(w, http.StatusOK, summary)
	})

	// GET /vouchers
	mux.HandleFunc("GET /vouchers", func(w http.ResponseWriter, r *http.Request) {
		statusFilter := r.URL.Query().Get("status")
		vouchers, err := voucherSvc.ListVouchers(r.Context(), statusFilter)
		if err != nil {
			if errors.Is(err, service.ErrInvalidVoucherStatus) {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			log.Printf("Error querying vouchers: %v", err)
			writeError(w, http.StatusInternalServerError, "Failed to query vouchers")
			return
		}

		writeJSON(w, http.StatusOK, vouchers)
	})

	// POST /vouchers/{id}/retry
	mux.HandleFunc("POST /vouchers/{id}/retry", func(w http.ResponseWriter, r *http.Request) {
		voucherID := r.PathValue("id")
		if voucherID == "" {
			writeError(w, http.StatusBadRequest, "Voucher id is required")
			return
		}

		retried, err := voucherSvc.RetryVoucher(r.Context(), voucherID)
		if err != nil {
			switch {
			case errors.Is(err, service.ErrVoucherNotFound):
				writeError(w, http.StatusNotFound, err.Error())
			case errors.Is(err, service.ErrVoucherAlreadyPushed):
				writeError(w, http.StatusConflict, err.Error())
			default:
				log.Printf("Error retrying voucher: %v", err)
				writeError(w, http.StatusInternalServerError, "Failed to re-arm voucher for retry")
			}
			return
		}

		writeJSON(w, http.StatusOK, retried)
	})

	// POST /ask (Bonus stretch goal)
	mux.HandleFunc("POST /ask", askSvc.HandleAsk)

	handler := corsMiddleware(mux)

	server := &http.Server{
		Addr:         ":" + cfg.APIPort,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Sutra Mini Backend API listening on port %s...", cfg.APIPort)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server ListenAndServe failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Sutra Mini API server...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}

	log.Println("Sutra Mini API server cleanly stopped.")
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func maskDatabaseURL(rawURL string) string {
	if len(rawURL) > 30 {
		return rawURL[:15] + "..." + rawURL[len(rawURL)-10:]
	}
	return "***"
}
