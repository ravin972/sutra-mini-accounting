package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL        string
	APIPort            string
	MockAccountingPort string
	MockAccountingURL  string
	WorkerPollInterval time.Duration
	WorkerConcurrency  int
	WorkerLeaseSeconds int
	WorkerMaxAttempts  int
}

// Load loads configuration from environment variables, optionally reading a .env file.
func Load() *Config {
	loadDotEnv(".env")
	loadDotEnv("../.env")

	cfg := &Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://postgres@localhost:5432/sutra_mini?sslmode=disable"),
		APIPort:            getEnv("PORT", "8080"),
		MockAccountingPort: getEnv("MOCK_ACCOUNTING_PORT", "8081"),
		MockAccountingURL:  getEnv("MOCK_ACCOUNTING_URL", "http://localhost:8081"),
		WorkerPollInterval: getEnvDuration("WORKER_POLL_INTERVAL", 1*time.Second),
		WorkerConcurrency:  getEnvInt("WORKER_CONCURRENCY", 4),
		WorkerLeaseSeconds: getEnvInt("WORKER_LEASE_SECONDS", 30),
		WorkerMaxAttempts:  getEnvInt("WORKER_MAX_ATTEMPTS", 5),
	}

	return cfg
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}

func getEnvDuration(key string, defaultVal time.Duration) time.Duration {
	if val := os.Getenv(key); val != "" {
		if d, err := time.ParseDuration(val); err == nil {
			return d
		}
	}
	return defaultVal
}

func loadDotEnv(filepath string) {
	file, err := os.Open(filepath)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			k := strings.TrimSpace(parts[0])
			v := strings.Trim(strings.TrimSpace(parts[1]), `"'`)
			if os.Getenv(k) == "" {
				os.Setenv(k, v)
			}
		}
	}
}
