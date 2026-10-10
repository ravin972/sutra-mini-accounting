'use client';

import React from 'react';
import { 
  RotateCcw
} from 'lucide-react';
import { Voucher, IssueSummary } from '../types';

interface StatsRibbonProps {
  vouchers: Voucher[];
  issues: IssueSummary[];
  onRetryAllFailed?: () => void;
  isRetryingAll?: boolean;
}

export const StatsRibbon: React.FC<StatsRibbonProps> = ({
  vouchers,
  issues,
  onRetryAllFailed,
  isRetryingAll,
}) => {
  const pending = vouchers.filter((v) => v.status === 'pending');
  const pushed = vouchers.filter((v) => v.status === 'pushed');
  const failed = vouchers.filter((v) => v.status === 'failed');

  const totalPaisePushed = pushed.reduce((acc, v) => acc + (v.amount_paise || 0), 0);
  const totalOutstandingUnits = issues.reduce((acc, i) => acc + (i.outstanding_qty || 0), 0);

  const formatINR = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
  };

  const syncRate = vouchers.length > 0 
    ? ((pushed.length / vouchers.length) * 100).toFixed(1) 
    : '100.0';

  return (
    <div className="ent-kpi-row">
      {/* Total Vouchers */}
      <div className="ent-kpi-card">
        <div className="ent-kpi-header">
          <span className="ent-kpi-label">Total Outbox</span>
        </div>
        <div className="ent-kpi-value">
          {vouchers.length}
        </div>
        <div className="ent-kpi-subtext">
          {syncRate}% sync completion
        </div>
      </div>

      {/* Pushed to Accounting */}
      <div className="ent-kpi-card">
        <div className="ent-kpi-header">
          <span className="ent-kpi-label">Pushed to Ledger</span>
        </div>
        <div className="ent-kpi-value" style={{ color: '#34d399' }}>
          {pushed.length}
        </div>
        <div className="ent-kpi-subtext">
          {formatINR(totalPaisePushed)} confirmed
        </div>
      </div>

      {/* Pending Queue */}
      <div className="ent-kpi-card">
        <div className="ent-kpi-header">
          <span className="ent-kpi-label">Pending / Leased</span>
        </div>
        <div className="ent-kpi-value" style={{ color: pending.length > 0 ? '#fbbf24' : 'var(--text-primary)' }}>
          {pending.length}
        </div>
        <div className="ent-kpi-subtext">
          {pending.length > 0 ? 'Worker dispatching' : 'Queue clear'}
        </div>
      </div>

      {/* Failed / Exhausted */}
      <div className="ent-kpi-card">
        <div className="ent-kpi-header">
          <span className="ent-kpi-label">Failed (Dead Letter)</span>
        </div>
        <div className="ent-kpi-value" style={{ color: failed.length > 0 ? '#f87171' : 'var(--text-primary)' }}>
          {failed.length}
        </div>
        <div className="ent-kpi-subtext">
          {failed.length > 0 && onRetryAllFailed ? (
            <button
              type="button"
              onClick={onRetryAllFailed}
              disabled={isRetryingAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f87171',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                textDecoration: 'underline',
              }}
            >
              <RotateCcw size={11} className={isRetryingAll ? 'spin' : ''} />
              {isRetryingAll ? 'Retrying...' : 'Re-arm all failed'}
            </button>
          ) : (
            'Zero errors'
          )}
        </div>
      </div>

      {/* Outstanding Jobwork Units */}
      <div className="ent-kpi-card">
        <div className="ent-kpi-header">
          <span className="ent-kpi-label">Outstanding Units</span>
        </div>
        <div className="ent-kpi-value">
          {totalOutstandingUnits} <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>pcs</span>
        </div>
        <div className="ent-kpi-subtext">
          Across {issues.length} artisan batches
        </div>
      </div>
    </div>
  );
};
