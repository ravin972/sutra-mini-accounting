'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  RefreshCw, 
  AlertCircle, 
  Copy, 
  Check, 
  Zap
} from 'lucide-react';
import { IssueSummary } from '../types';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  issues: IssueSummary[];
  preselectedIssueId?: string | null;
  onSubmit: (issueId: string, qty: number, idempotencyKey: string, simulateRace: boolean) => Promise<void>;
  submitting: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  issues,
  preselectedIssueId,
  onSubmit,
  submitting,
}) => {
  const [selectedIssueId, setSelectedIssueId] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [lastUsedKey, setLastUsedKey] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [simulateRace, setSimulateRace] = useState(false);

  useEffect(() => {
    if (preselectedIssueId) {
      setSelectedIssueId(preselectedIssueId);
    } else if (issues.length > 0 && !selectedIssueId) {
      setSelectedIssueId(issues[0].id);
    }
  }, [preselectedIssueId, issues, selectedIssueId]);

  useEffect(() => {
    if (isOpen) {
      const newKey = `idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setIdempotencyKey(newKey);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentIssue = issues.find((i) => i.id === selectedIssueId);
  const maxAvailable = currentIssue ? currentIssue.outstanding_qty : 0;
  const isOvershoot = qty > maxAvailable;
  const estimatedPaise = qty * 25000;

  const formatINR = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
    });
  };

  const handleGenerateKey = () => {
    const fresh = `idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setIdempotencyKey(fresh);
  };

  const handleReplayKey = () => {
    if (lastUsedKey) {
      setIdempotencyKey(lastUsedKey);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(idempotencyKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssueId || qty <= 0) return;
    setLastUsedKey(idempotencyKey);
    await onSubmit(selectedIssueId, qty, idempotencyKey, simulateRace);
  };

  return (
    <div className="ent-modal-overlay" onClick={onClose}>
      <div className="ent-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ent-modal-header">
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Record Jobwork Receipt
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
              Dispatches an outbox voucher atomically to the accounting ledger
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ent-modal-body">
            {/* Batch Selection */}
            <div className="form-group">
              <label className="form-label">
                Active Jobwork Batch
              </label>
              <select
                className="form-control"
                value={selectedIssueId}
                onChange={(e) => setSelectedIssueId(e.target.value)}
              >
                {issues.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.party_name} — {i.sku_name} ({i.outstanding_qty} pcs remaining)
                  </option>
                ))}
              </select>
            </div>

            {/* Batch Info Card */}
            {currentIssue && (
              <div 
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '0.85rem 1rem',
                  marginBottom: '1.15rem',
                  fontSize: '0.78rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Artisan: <strong style={{ color: 'var(--text-primary)' }}>{currentIssue.party_name}</strong></span>
                  <span>Issued: {currentIssue.issued_on}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Product: {currentIssue.sku_name} ({currentIssue.sku_code})</span>
                  <span>Available: <strong style={{ color: currentIssue.outstanding_qty > 0 ? '#34d399' : '#f87171' }}>{currentIssue.outstanding_qty} pcs</strong></span>
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Received Quantity (pcs)
                </label>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                    onClick={() => setQty(1)}
                  >
                    1 pc
                  </button>
                  {maxAvailable > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => setQty(maxAvailable)}
                    >
                      Max ({maxAvailable})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', color: '#f87171' }}
                    onClick={() => setQty(maxAvailable + 5)}
                    title="Test overshoot"
                  >
                    +5 (Overshoot)
                  </button>
                </div>
              </div>

              <input
                type="number"
                min="1"
                className="form-control"
                style={{ fontFamily: 'JetBrains Mono', borderColor: isOvershoot ? '#f87171' : undefined }}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />

              {isOvershoot && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171', fontSize: '0.75rem', marginTop: '4px' }}>
                  <AlertCircle size={13} />
                  <span>Exceeds remaining batch balance ({maxAvailable} pcs). Server will reject with HTTP 422.</span>
                </div>
              )}

              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                Credit Amount: <strong style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>{formatINR(estimatedPaise)}</strong> (@ ₹250/pc rate)
              </div>
            </div>

            {/* Idempotency Key */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Idempotency-Key Header
                </label>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                    onClick={handleGenerateKey}
                  >
                    Fresh Key
                  </button>
                  {lastUsedKey && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={handleReplayKey}
                      title="Test idempotent replay"
                    >
                      Replay Last Key
                    </button>
                  )}
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8rem', paddingRight: '2rem' }}
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleCopyKey}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: copiedKey ? '#34d399' : 'var(--text-tertiary)',
                    cursor: 'pointer',
                  }}
                  title="Copy Key"
                >
                  {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Race condition toggle */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
              onClick={() => setSimulateRace(!simulateRace)}
            >
              <input
                type="checkbox"
                id="race-toggle"
                checked={simulateRace}
                onChange={(e) => setSimulateRace(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="race-toggle" style={{ fontSize: '0.78rem', cursor: 'pointer', flex: 1 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Simulate Concurrent Double-Tap</strong>
                <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '0.72rem' }}>
                  Fires 2 parallel requests simultaneously with the same key to verify database locking.
                </span>
              </label>
            </div>
          </div>

          <div className="ent-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !selectedIssueId || qty <= 0}>
              {submitting ? (
                <>
                  <RefreshCw size={13} className="spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>{simulateRace ? 'Fire Concurrent Requests' : 'Confirm & Dispatch'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
