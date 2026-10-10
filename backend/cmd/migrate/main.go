package main

import (
	"context"
	"log"
	"os"

	"sutra-mini/internal/config"
	"sutra-mini/internal/db"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := db.InitPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	migrationsDir := "../migrations"
	if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
		migrationsDir = "migrations"
	}

	log.Printf("Applying migrations from: %s", migrationsDir)
	if err := db.RunMigrations(ctx, pool, migrationsDir); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	log.Println("All migrations applied successfully.")
}
