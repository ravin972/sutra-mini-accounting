package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sutra-mini/internal/config"
	"sutra-mini/internal/mock"
)

func main() {
	cfg := config.Load()

	serverMock := mock.NewAccountingServer(0)

	httpServer := &http.Server{
		Addr:         ":" + cfg.MockAccountingPort,
		Handler:      serverMock,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("Mock Accounting Server listening on port %s...", cfg.MockAccountingPort)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Mock server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Mock Accounting Server...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Mock server shutdown error: %v", err)
	}

	log.Println("Mock Accounting Server cleanly stopped.")
}
