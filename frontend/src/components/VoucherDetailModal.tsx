'use client';

import React, { useState } from 'react';
import { 
  X, 
  RotateCcw, 
  Copy, 
  Check, 
  Code
} from 'lucide-react';
import { Voucher } from '../types';

interface VoucherDetailModalProps {
  voucher: Voucher | null;
  onClose: () => void;
  onRetry: (id: string) => Promise<void>;
  retrying: boolean;
}

export const VoucherDetailModal: React.FC<VoucherDetailModalProps> = ({
  voucher,
  onClose,
  onRetry,
  retrying,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  if (!voucher) return null;

  const copyField = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatINR = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="ent-modal-overlay" onClick={onClose}>
      <div className="ent-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ent-modal-header">
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Voucher Audit Trail
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono', marginTop: '2px' }}>
              {voucher.id}
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

        <div className="ent-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Top Status & Amount Row */}
          <div 
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.85rem 1rem',
              borderRadius: '6px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Status
              </div>
              <span className={`badge-clean badge-clean-${voucher.status}`}>
                <span className="badge-dot" />
                {voucher.status.toUpperCase()}
              </span>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Amount
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>
                {formatINR(voucher.amount_paise)}
              </div>
            </div>
          </div>

          {/* Audit Metadata Table */}
          <div 
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              overflow: 'hidden',
              fontSize: '0.78rem',
            }}
          >
            {[
              {
                label: 'Client Reference',
                val: voucher.client_ref,
                field: 'client_ref',
                mono: true,
              },
              {
                label: 'External Ledger Reference',
                val: voucher.external_ref || 'None (pending remote ACK)',
                field: 'external_ref',
                mono: true,
                color: voucher.external_ref ? '#34d399' : undefined,
              },
              {
                label: 'Sync Attempts',
                val: `${voucher.attempts} of 5 max`,
                mono: true,
              },
              {
                label: 'Active Worker Lease',
                val: voucher.locked_by || 'Unlocked (idle)',
                mono: true,
              },
              {
                label: 'Created Timestamp',
                val: formatDate(voucher.created_at),
              },
              {
                label: 'Last Updated',
                val: formatDate(voucher.updated_at),
              },
              {
                label: 'Next Retry Attempt',
                val: formatDate(voucher.next_attempt_at),
              },
            ].map((row, idx) => (
              <div 
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.65rem 0.85rem',
                  borderBottom: idx < 6 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span 
                    style={{ 
                      fontFamily: row.mono ? 'JetBrains Mono' : 'inherit',
                      color: row.color || 'var(--text-primary)',
                      fontWeight: row.mono ? 500 : 400,
                    }}
                  >
                    {row.val}
                  </span>
                  {row.field && row.val && (
                    <button
                      type="button"
                      onClick={() => copyField(row.val, row.field!)}
                      style={{ background: 'transparent', border: 'none', color: copiedField === row.field ? '#34d399' : 'var(--text-tertiary)', cursor: 'pointer' }}
                      title="Copy"
                    >
                      {copiedField === row.field ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Error Details */}
          {voucher.last_error && (
            <div 
              style={{
                background: 'var(--status-danger-bg)',
                border: '1px solid var(--status-danger-border)',
                borderRadius: '6px',
                padding: '0.75rem',
                fontSize: '0.75rem',
                color: '#f87171',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>Last Remote Failure Message:</div>
              <div style={{ fontFamily: 'JetBrains Mono', wordBreak: 'break-all' }}>{voucher.last_error}</div>
            </div>
          )}

          {/* Raw JSON toggle */}
          <div>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem', padding: '0.4rem' }}
              onClick={() => setShowRawJson(!showRawJson)}
            >
              <Code size={13} />
              <span>{showRawJson ? 'Hide Raw JSON' : 'Inspect Raw JSON'}</span>
            </button>
            {showRawJson && (
              <pre 
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  maxHeight: '180px',
                  overflowY: 'auto',
                }}
              >
                {JSON.stringify(voucher, null, 2)}
              </pre>
            )}
          </div>
        </div>

        <div className="ent-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {voucher.status === 'failed' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onRetry(voucher.id)}
              disabled={retrying}
            >
              <RotateCcw size={13} className={retrying ? 'spin' : ''} />
              <span>{retrying ? 'Re-arming...' : 'Re-arm for Retry'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
