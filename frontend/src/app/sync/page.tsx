'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ExternalLink,
  PlusCircle,
  Copy,
  Check,
  Send
} from 'lucide-react';

interface Voucher {
  id: string;
  type: string;
  source_id: string;
  amount_paise: number;
  status: 'pending' | 'pushed' | 'failed';
  attempts: number;
  last_error?: string | null;
  client_ref: string;
  external_ref?: string | null;
  locked_until?: string | null;
  locked_by?: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export default function SyncPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Quick receipt tester form state
  const [showTester, setShowTester] = useState(false);
  const [issueId, setIssueId] = useState('c0000000-0000-0000-0000-000000000001');
  const [qty, setQty] = useState(1);
  const [idempotencyKey, setIdempotencyKey] = useState(`key-${Date.now()}`);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  const fetchVouchers = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vouchers`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: Voucher[] = await res.json();
      setVouchers(data || []);
    } catch (err: any) {
      console.error('Fetch vouchers failed:', err);
      if (!isSilent) {
        setActionMessage({ type: 'error', text: `Failed to connect to backend (${API_BASE}): ${err.message}` });
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchVouchers(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchVouchers]);

  const handleRetry = async (voucherId: string) => {
    setRetryingId(voucherId);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_BASE}/vouchers/${voucherId}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Retry request failed');
      }
      setActionMessage({ type: 'success', text: `Voucher ${voucherId.slice(0, 8)}... re-armed for synchronization!` });
      await fetchVouchers(true);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Retry failed: ${err.message}` });
    } finally {
      setRetryingId(null);
    }
  };

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReceipt(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_BASE}/jobwork/receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          issue_id: issueId,
          qty: Number(qty),
          received_on: new Date().toISOString().split('T')[0],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const replayNote = data.is_replay ? ' [IDEMPOTENT REPLAY DETECTED]' : '';
      setActionMessage({ 
        type: 'success', 
        text: `Receipt created successfully! Voucher: ${data.voucher?.id?.slice(0, 8)}...${replayNote}` 
      });

      // Generate a new idempotency key if it was a new creation
      if (!data.is_replay) {
        setIdempotencyKey(`key-${Date.now()}`);
      }
      await fetchVouchers(true);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Receipt submission rejected: ${err.message}` });
    } finally {
      setSubmittingReceipt(false);
    }
  };

  const pendingVouchers = vouchers.filter((v) => v.status === 'pending');
  const pushedVouchers = vouchers.filter((v) => v.status === 'pushed');
  const failedVouchers = vouchers.filter((v) => v.status === 'failed');

  const formatINR = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="container">
      {/* Header bar */}
      <div className="header-bar">
        <div>
          <div className="brand-badge">Shree Radha Studio · Manufacturing Suite</div>
          <h1 className="page-title">Sutra Mini — Accounting Sync</h1>
          <p className="page-subtitle">
            Reliable transactional accounting push for job-worker receipts to slow & misbehaving remote accounting APIs.
          </p>
        </div>
        <div className="action-group">
          <button 
            className="btn-primary" 
            onClick={() => setShowTester(!showTester)}
          >
            <PlusCircle size={16} />
            {showTester ? 'Close Tester' : 'Test New Receipt'}
          </button>
          <button 
            className="btn-secondary" 
            onClick={() => fetchVouchers(false)} 
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Banner message */}
      {actionMessage && (
        <div 
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            backgroundColor: actionMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${actionMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: actionMessage.type === 'success' ? '#34d399' : '#f87171',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.9rem',
          }}
        >
          <span>{actionMessage.text}</span>
          <button 
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => setActionMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Quick Receipt Tester Drawer */}
      {showTester && (
        <div 
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Send size={18} style={{ color: 'var(--accent-gold)' }} />
            POST /jobwork/receipts Tester (Browser Client)
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Submit a jobwork receipt with an Idempotency-Key. Test standard submission, replay the same key, or test an overshoot!
          </p>
          <form onSubmit={handleCreateReceipt} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Jobwork Issue ID
              </label>
              <select 
                value={issueId} 
                onChange={(e) => setIssueId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'white', fontSize: '0.85rem' }}
              >
                <option value="c0000000-0000-0000-0000-000000000001">Issue #1: Rafiq (Kurti, 50 pcs)</option>
                <option value="c0000000-0000-0000-0000-000000000002">Issue #2: Rafiq (Lehenga, 20 pcs)</option>
                <option value="c0000000-0000-0000-0000-000000000003">Issue #3: Laxmi (Suit, 40 pcs)</option>
                <option value="c0000000-0000-0000-0000-000000000004">Issue #4: Laxmi (Dupatta, 100 pcs)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Quantity (pcs)
              </label>
              <input 
                type="number" 
                min="1" 
                value={qty} 
                onChange={(e) => setQty(Number(e.target.value))}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'white', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Idempotency-Key Header
              </label>
              <input 
                type="text" 
                value={idempotencyKey} 
                onChange={(e) => setIdempotencyKey(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'white', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <button 
                type="submit" 
                className="btn-primary" 
                disabled={submittingReceipt}
                style={{ width: '100%', height: '38px', justifyContent: 'center' }}
              >
                {submittingReceipt ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                Submit Receipt
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Total Vouchers</span>
          <span className="metric-value">{vouchers.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label" style={{ color: 'var(--status-pending-text)' }}>Pending in Queue</span>
          <span className="metric-value" style={{ color: 'var(--status-pending-text)' }}>{pendingVouchers.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label" style={{ color: 'var(--status-pushed-text)' }}>Successfully Pushed</span>
          <span className="metric-value" style={{ color: 'var(--status-pushed-text)' }}>{pushedVouchers.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label" style={{ color: 'var(--status-failed-text)' }}>Failed (Exhausted)</span>
          <span className="metric-value" style={{ color: 'var(--status-failed-text)' }}>{failedVouchers.length}</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="controls-bar">
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Backend API: <code style={{ color: '#60a5fa' }}>{API_BASE}</code>
        </div>
        <div className="auto-refresh-toggle">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)} 
              style={{ cursor: 'pointer' }}
            />
            Auto-refresh live (3s)
          </label>
        </div>
      </div>

      {/* Grouped Status Columns */}
      <div className="status-columns">
        {/* PENDING COLUMN */}
        <div className="column">
          <div className="column-header">
            <div className="column-title">
              <Clock size={18} style={{ color: 'var(--status-pending-text)' }} />
              Pending
            </div>
            <span className="column-count badge-pending">{pendingVouchers.length}</span>
          </div>
          <div className="voucher-list">
            {pendingVouchers.length === 0 ? (
              <div className="empty-state">No pending vouchers in queue.</div>
            ) : (
              pendingVouchers.map((v) => (
                <div key={v.id} className="voucher-card">
                  <div className="card-top">
                    <div>
                      <div className="client-ref">{v.client_ref}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        ID: {v.id.slice(0, 8)}...
                      </div>
                    </div>
                    <div className="amount">{formatINR(v.amount_paise)}</div>
                  </div>

                  <div className="detail-row">
                    <span>Attempts:</span>
                    <span className="detail-val">{v.attempts}</span>
                  </div>

                  {v.locked_by && (
                    <div className="detail-row">
                      <span>Leased by:</span>
                      <span className="detail-val" style={{ color: 'var(--accent-gold)' }}>{v.locked_by}</span>
                    </div>
                  )}

                  {v.last_error && (
                    <div className="error-box" style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fde68a' }}>
                      {v.last_error}
                    </div>
                  )}

                  <div className="card-footer">
                    <span className="timestamp">{formatDate(v.created_at)}</span>
                    <span className="badge-pending" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                      Queued
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PUSHED COLUMN */}
        <div className="column">
          <div className="column-header">
            <div className="column-title">
              <CheckCircle2 size={18} style={{ color: 'var(--status-pushed-text)' }} />
              Pushed
            </div>
            <span className="column-count badge-pushed">{pushedVouchers.length}</span>
          </div>
          <div className="voucher-list">
            {pushedVouchers.length === 0 ? (
              <div className="empty-state">No pushed vouchers yet.</div>
            ) : (
              pushedVouchers.map((v) => (
                <div key={v.id} className="voucher-card">
                  <div className="card-top">
                    <div>
                      <div className="client-ref">{v.client_ref}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        ID: {v.id.slice(0, 8)}...
                      </div>
                    </div>
                    <div className="amount">{formatINR(v.amount_paise)}</div>
                  </div>

                  <div className="detail-row">
                    <span>External Ref:</span>
                    <span className="detail-val" style={{ color: '#34d399', fontWeight: 600 }}>
                      {v.external_ref || 'N/A'}
                    </span>
                  </div>

                  <div className="detail-row">
                    <span>Total Attempts:</span>
                    <span className="detail-val">{v.attempts}</span>
                  </div>

                  <div className="card-footer">
                    <span className="timestamp">{formatDate(v.updated_at)}</span>
                    <span className="badge-pushed" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                      Synced
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* FAILED COLUMN */}
        <div className="column">
          <div className="column-header">
            <div className="column-title">
              <AlertTriangle size={18} style={{ color: 'var(--status-failed-text)' }} />
              Failed
            </div>
            <span className="column-count badge-failed">{failedVouchers.length}</span>
          </div>
          <div className="voucher-list">
            {failedVouchers.length === 0 ? (
              <div className="empty-state">No failed vouchers.</div>
            ) : (
              failedVouchers.map((v) => (
                <div key={v.id} className="voucher-card">
                  <div className="card-top">
                    <div>
                      <div className="client-ref">{v.client_ref}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        ID: {v.id.slice(0, 8)}...
                      </div>
                    </div>
                    <div className="amount">{formatINR(v.amount_paise)}</div>
                  </div>

                  <div className="detail-row">
                    <span>Exhausted Attempts:</span>
                    <span className="detail-val" style={{ color: '#f87171' }}>{v.attempts}</span>
                  </div>

                  {v.last_error && (
                    <div className="error-box">
                      <strong>Failure Reason:</strong> {v.last_error}
                    </div>
                  )}

                  <div className="card-footer">
                    <span className="timestamp">{formatDate(v.updated_at)}</span>
                    <button 
                      className="btn-retry" 
                      onClick={() => handleRetry(v.id)}
                      disabled={retryingId === v.id}
                    >
                      <RotateCcw size={14} className={retryingId === v.id ? 'spin' : ''} />
                      {retryingId === v.id ? 'Retrying...' : 'Retry'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
