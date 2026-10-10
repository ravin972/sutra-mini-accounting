-- 001_initial_schema.sql
-- Schema for Sutra Mini: Reliable Jobwork Accounting Push

CREATE TABLE IF NOT EXISTS skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobwork_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL CHECK (qty > 0),
    issued_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobwork_issues_party ON jobwork_issues (party_id);
CREATE INDEX IF NOT EXISTS idx_jobwork_issues_sku ON jobwork_issues (sku_id);

CREATE TABLE IF NOT EXISTS jobwork_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES jobwork_issues(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL CHECK (qty > 0),
    received_on DATE NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    request_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobwork_receipts_issue ON jobwork_receipts (issue_id);

CREATE TABLE IF NOT EXISTS vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL REFERENCES jobwork_receipts(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'pushed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    client_ref VARCHAR(255) NOT NULL UNIQUE,
    external_ref VARCHAR(255),
    locked_until TIMESTAMPTZ,
    locked_by VARCHAR(100),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vouchers_worker_queue 
    ON vouchers (status, next_attempt_at, locked_until) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_source_id ON vouchers (source_id);
