'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  RefreshCw, 
  AlertCircle, 
  Copy, 
  Check, 
  Zap,
  Image as ImageIcon,
  Scissors
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
      // Pick first non-completed issue if available
      const openIssue = issues.find((i) => i.outstanding_qty > 0) || issues[0];
      setSelectedIssueId(openIssue.id);
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
  const estimatedPaise = qty * 65000; // ~₹650 standard piece rate in paise

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
              Creates transactional receipt & outbox accounting voucher atomically
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
                    {i.party_name} — {i.sku_name} ({i.outstanding_qty} pcs left)
                  </option>
                ))}
              </select>
            </div>

            {/* Rich Batch Info Card with Garment Photo */}
            {currentIssue && (
              <div className="modal-batch-preview-card">
                <div className="modal-sku-thumb">
                  {currentIssue.sku_image_url ? (
                    <img 
                      src={currentIssue.sku_image_url} 
                      alt={currentIssue.sku_name} 
                      className="modal-sku-img"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <ImageIcon size={20} style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {currentIssue.sku_name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono' }}>
                        {currentIssue.sku_code} · Dispatched: {currentIssue.issued_on}
                      </div>
                    </div>
                    <span 
                      className="badge-clean"
                      style={{
                        background: currentIssue.outstanding_qty > 0 ? 'var(--status-info-bg)' : 'var(--status-success-bg)',
                        color: currentIssue.outstanding_qty > 0 ? '#38bdf8' : '#34d399',
                        border: `1px solid ${currentIssue.outstanding_qty > 0 ? 'var(--status-info-border)' : 'var(--status-success-border)'}`,
                        fontSize: '0.72rem'
                      }}
                    >
                      {currentIssue.outstanding_qty} pcs remaining
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <Scissors size={11} />
                    <span>Workshop: <strong>{currentIssue.party_name}</strong> ({currentIssue.party_phone})</span>
                  </div>
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
                  {maxAvailable > 5 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => setQty(5)}
                    >
                      5 pcs
                    </button>
                  )}
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
                </div>
              </div>

              <input
                type="number"
                min="1"
                className={`form-control ${isOvershoot ? 'is-invalid' : ''}`}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />

              {isOvershoot && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '0.75rem', marginTop: '5px' }}>
                  <AlertCircle size={13} />
                  <span>
                    Overshoot risk: Requested {qty} pcs exceeds remaining balance of {maxAvailable} pcs. (Database lock will reject this with HTTP 422).
                  </span>
                </div>
              )}
            </div>

            {/* Calculated Amount */}
            <div 
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.65rem 0.85rem',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ color: 'var(--text-tertiary)' }}>Accounting Voucher Value:</span>
              <strong style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>
                {formatINR(estimatedPaise)}
              </strong>
            </div>

            {/* Idempotency Key */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Idempotency-Key (Header)
                </label>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {lastUsedKey && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                      onClick={handleReplayKey}
                      title="Replay last key to test deduplication"
                    >
                      Replay Previous Key
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                    onClick={handleGenerateKey}
                    title="Generate new UUID key"
                  >
                    <RefreshCw size={10} />
                    <span>New Key</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.45rem' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: '0.78rem' }}
                  value={idempotencyKey}
                  onChange={(e) => setIdempotencyKey(e.target.value)}
                  placeholder="idem-..."
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCopyKey}
                  title="Copy to clipboard"
                  style={{ padding: '0 0.65rem' }}
                >
                  {copiedKey ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            {/* Concurrency Stress Switch */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                background: simulateRace ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-subtle)',
                border: `1px solid ${simulateRace ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-subtle)'}`,
                cursor: 'pointer',
              }}
              onClick={() => setSimulateRace(!simulateRace)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={14} style={{ color: simulateRace ? '#38bdf8' : 'var(--text-tertiary)' }} />
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Simulate Race Condition
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                    Fires 2 parallel requests simultaneously with identical key to verify DB deduplication
                  </div>
                </div>
              </div>
              <input 
                type="checkbox" 
                checked={simulateRace} 
                onChange={(e) => setSimulateRace(e.target.checked)} 
                style={{ cursor: 'pointer' }}
              />
            </div>
          </div>

          <div className="ent-modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !selectedIssueId || qty <= 0}
            >
              {submitting ? (
                <>
                  <RefreshCw size={13} className="spin" />
                  <span>Processing Transaction...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>Record Receipt ({qty} pcs)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
