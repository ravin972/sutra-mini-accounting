package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"sutra-mini/internal/config"
	"sutra-mini/internal/db"
	"sutra-mini/internal/worker"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.InitPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Worker failed to connect to database: %v", err)
	}
	defer pool.Close()

	w := worker.NewSyncWorker(pool, cfg)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		log.Printf("Received signal %s, initiating graceful shutdown of worker...", sig)
		w.Stop()
		cancel()
	}()

	if err := w.Start(ctx); err != nil {
		log.Printf("Worker ended with error: %v", err)
	}

	log.Println("Worker process terminated cleanly.")
}
