package mock

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"sutra-mini/internal/models"
)

type AccountingServer struct {
	mu      sync.RWMutex
	store   map[string]string // client_ref -> external_ref
	rng     *rand.Rand
	rngMu   sync.Mutex
	handler http.Handler
}

func NewAccountingServer(seed int64) *AccountingServer {
	var src rand.Source
	if seed != 0 {
		src = rand.NewSource(seed)
	} else {
		src = rand.NewSource(time.Now().UnixNano())
	}

	s := &AccountingServer{
		store: make(map[string]string),
		rng:   rand.New(src),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/vouchers", s.handlePostVoucher)
	mux.HandleFunc("GET /api/vouchers", s.handleGetVouchers)
	mux.HandleFunc("DELETE /api/vouchers", s.handleReset)
	mux.HandleFunc("GET /healthz", s.handleHealthz)

	s.handler = mux
	return s
}

func (s *AccountingServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.handler.ServeHTTP(w, r)
}

func (s *AccountingServer) handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (s *AccountingServer) handleGetVouchers(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(s.store)
}

func (s *AccountingServer) handleReset(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.store = make(map[string]string)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"reset"}`))
}

func (s *AccountingServer) handlePostVoucher(w http.ResponseWriter, r *http.Request) {
	var req models.MockAccountingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid json payload"})
		return
	}

	if req.ClientRef == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "client_ref is required"})
		return
	}

	// 1. Check for duplicate client_ref first
	s.mu.RLock()
	existingExternalRef, exists := s.store[req.ClientRef]
	s.mu.RUnlock()

	if exists {
		log.Printf("[MockAccounting] Duplicate client_ref: %s -> returning 409 with external_ref: %s", req.ClientRef, existingExternalRef)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":        "duplicate client_ref",
			"external_ref": existingExternalRef,
		})
		return
	}

	// 2. Check for deterministic test header overrides
	testMode := r.Header.Get("X-Mock-Mode")

	// 3. Roll for simulated behavior
	s.rngMu.Lock()
	roll := s.rng.Float64()
	s.rngMu.Unlock()

	is500 := (testMode == "force-500") || (testMode == "" && roll < 0.20)
	isHang := (testMode == "force-hang") || (testMode == "" && !is500 && roll < 0.30)

	if is500 {
		log.Printf("[MockAccounting] Simulating 500 error for client_ref: %s (roll=%.2f)", req.ClientRef, roll)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "simulated internal server error (20% failure injection)",
		})
		return
	}

	externalRef := fmt.Sprintf("ACC-EXT-%s", uuid.New().String()[:8])

	if isHang {
		log.Printf("[MockAccounting] Simulating 5-second hang for client_ref: %s...", req.ClientRef)
		// Register in store even if client disconnects during delay (simulating remote acceptance)
		s.mu.Lock()
		s.store[req.ClientRef] = externalRef
		s.mu.Unlock()

		time.Sleep(5 * time.Second)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(models.MockAccountingResponse{
			Status:      "success",
			ExternalRef: externalRef,
		})
		return
	}

	// Standard successful push (70% or force-success)
	s.mu.Lock()
	s.store[req.ClientRef] = externalRef
	s.mu.Unlock()

	log.Printf("[MockAccounting] Successfully accepted voucher: client_ref=%s -> external_ref=%s", req.ClientRef, externalRef)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(models.MockAccountingResponse{
		Status:      "success",
		ExternalRef: externalRef,
	})
}
