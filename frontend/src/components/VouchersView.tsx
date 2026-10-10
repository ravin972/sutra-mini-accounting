'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  RotateCcw, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Table as TableIcon,
  Kanban,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { Voucher } from '../types';

interface VouchersViewProps {
  vouchers: Voucher[];
  onSelectVoucher: (v: Voucher) => void;
  onRetry: (id: string) => Promise<void>;
  retryingId: string | null;
}

export const VouchersView: React.FC<VouchersViewProps> = ({
  vouchers,
  onSelectVoucher,
  onRetry,
  retryingId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'pushed' | 'failed'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Filter vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers.filter((v) => {
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesStatus;

      return (
        matchesStatus &&
        (v.client_ref.toLowerCase().includes(query) ||
          (v.external_ref && v.external_ref.toLowerCase().includes(query)) ||
          v.id.toLowerCase().includes(query) ||
          (v.last_error && v.last_error.toLowerCase().includes(query)))
      );
    });
  }, [vouchers, statusFilter, searchQuery]);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  // Pagination math
  const totalItems = filteredVouchers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedVouchers = useMemo(() => {
    return filteredVouchers.slice(startIndex, endIndex);
  }, [filteredVouchers, startIndex, endIndex]);

  const copyText = (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div>
      {/* Enterprise Filter Toolbar */}
      <div className="ent-toolbar">
        {/* Search Input */}
        <div className="ent-search-wrapper">
          <Search 
            size={14} 
            style={{ 
              position: 'absolute', 
              left: '10px', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              color: 'var(--text-tertiary)' 
            }} 
          />
          <input
            type="text"
            className="ent-search-input"
            placeholder="Search by ref, external ID, error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Status Filters & View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div className="ent-filter-pills">
            <button
              type="button"
              className={`ent-pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All ({vouchers.length})
            </button>
            <button
              type="button"
              className={`ent-pill-btn ${statusFilter === 'pushed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pushed')}
            >
              Pushed ({vouchers.filter(v => v.status === 'pushed').length})
            </button>
            <button
              type="button"
              className={`ent-pill-btn ${statusFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({vouchers.filter(v => v.status === 'pending').length})
            </button>
            <button
              type="button"
              className={`ent-pill-btn ${statusFilter === 'failed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('failed')}
            >
              Failed ({vouchers.filter(v => v.status === 'failed').length})
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="ent-filter-pills">
            <button
              type="button"
              className={`ent-pill-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <TableIcon size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Table
            </button>
            <button
              type="button"
              className={`ent-pill-btn ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => setViewMode('board')}
              title="Board View"
            >
              <Kanban size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Board
            </button>
          </div>
        </div>
      </div>

      {/* VIEW: ENTERPRISE DATA TABLE */}
      {viewMode === 'table' ? (
        <div className="ent-table-card">
          <table className="ent-table">
            <thead>
              <tr>
                <th>Client Reference</th>
                <th>Status</th>
                <th>Settlement Amount</th>
                <th>Attempts</th>
                <th>External Ledger Ref</th>
                <th>Worker Lease</th>
                <th>Created At</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                    No vouchers matching active search query.
                  </td>
                </tr>
              ) : (
                paginatedVouchers.map((v) => (
                  <tr 
                    key={v.id}
                    onClick={() => onSelectVoucher(v)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {v.client_ref}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono' }}>
                        {v.id.slice(0, 18)}...
                      </div>
                    </td>

                    <td>
                      <span className={`badge-clean badge-clean-${v.status}`}>
                        <span className="badge-dot" />
                        {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                      </span>
                    </td>

                    <td>
                      <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>
                        {formatINR(v.amount_paise)}
                      </span>
                    </td>

                    <td>
                      <span style={{ fontFamily: 'JetBrains Mono', color: v.attempts >= 5 ? '#f87171' : 'var(--text-secondary)' }}>
                        {v.attempts} / 5
                      </span>
                    </td>

                    <td>
                      {v.external_ref ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#34d399', fontSize: '0.78rem' }}>
                            {v.external_ref}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => copyText(e, v.external_ref!, v.id)}
                            style={{ background: 'transparent', border: 'none', color: copiedId === v.id ? '#34d399' : 'var(--text-tertiary)', cursor: 'pointer' }}
                            title="Copy Ref"
                          >
                            {copiedId === v.id ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>
                      )}
                    </td>

                    <td>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono', color: v.locked_by ? '#fbbf24' : 'var(--text-tertiary)' }}>
                        {v.locked_by ? v.locked_by.slice(0, 16) : 'None'}
                      </span>
                    </td>

                    <td>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {formatDate(v.created_at)}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                        {v.status === 'failed' && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: '#f87171' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRetry(v.id);
                            }}
                            disabled={retryingId === v.id}
                            title="Re-arm for retry"
                          >
                            <RotateCcw size={11} className={retryingId === v.id ? 'spin' : ''} />
                            <span>Retry</span>
                          </button>
                        )}
                        <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Clean Enterprise Pagination Bar */}
          <div className="ent-pagination">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span>
                Showing <strong>{totalItems > 0 ? startIndex + 1 : 0}–{endIndex}</strong> of <strong>{totalItems}</strong> vouchers
              </span>

              {/* Rows per page selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '0.75rem',
                    outline: 'none',
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="ent-pagination-group">
              <button
                type="button"
                className="ent-page-btn"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                title="First Page"
              >
                <ChevronsLeft size={13} />
              </button>
              <button
                type="button"
                className="ent-page-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                title="Previous Page"
              >
                <ChevronLeft size={13} />
              </button>

              <span style={{ padding: '0 0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                className="ent-page-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                title="Next Page"
              >
                <ChevronRight size={13} />
              </button>
              <button
                type="button"
                className="ent-page-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                title="Last Page"
              >
                <ChevronsRight size={13} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW: CLEAN BOARD */
        <div className="ent-kanban-grid">
          {/* Pushed Column */}
          <div className="ent-kanban-column">
            <div className="ent-col-header">
              <span className="ent-col-title" style={{ color: '#34d399' }}>
                <span className="badge-dot" style={{ background: '#34d399' }} />
                Pushed ({vouchers.filter(v => v.status === 'pushed').length})
              </span>
            </div>
            <div className="ent-col-content">
              {vouchers.filter(v => v.status === 'pushed').map((v) => (
                <div key={v.id} className="ent-card" onClick={() => onSelectVoucher(v)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{v.client_ref}</div>
                    <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600, fontSize: '0.85rem' }}>
                      {formatINR(v.amount_paise)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    <span>Ref: <strong style={{ color: '#34d399', fontFamily: 'JetBrains Mono' }}>{v.external_ref}</strong></span>
                    <span>Attempts: {v.attempts}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Column */}
          <div className="ent-kanban-column">
            <div className="ent-col-header">
              <span className="ent-col-title" style={{ color: '#fbbf24' }}>
                <span className="badge-dot" style={{ background: '#fbbf24' }} />
                Pending Queue ({vouchers.filter(v => v.status === 'pending').length})
              </span>
            </div>
            <div className="ent-col-content">
              {vouchers.filter(v => v.status === 'pending').length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                  Queue clear. All vouchers processed.
                </div>
              ) : (
                vouchers.filter(v => v.status === 'pending').map((v) => (
                  <div key={v.id} className="ent-card" onClick={() => onSelectVoucher(v)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{v.client_ref}</div>
                      <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600, fontSize: '0.85rem' }}>
                        {formatINR(v.amount_paise)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Attempt {v.attempts} of 5 · {v.locked_by ? 'Leased' : 'Waiting'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Failed Column */}
          <div className="ent-kanban-column">
            <div className="ent-col-header">
              <span className="ent-col-title" style={{ color: '#f87171' }}>
                <span className="badge-dot" style={{ background: '#f87171' }} />
                Failed ({vouchers.filter(v => v.status === 'failed').length})
              </span>
            </div>
            <div className="ent-col-content">
              {vouchers.filter(v => v.status === 'failed').length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                  No failed vouchers.
                </div>
              ) : (
                vouchers.filter(v => v.status === 'failed').map((v) => (
                  <div key={v.id} className="ent-card" onClick={() => onSelectVoucher(v)} style={{ borderColor: 'var(--status-danger-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{v.client_ref}</div>
                      <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600, fontSize: '0.85rem' }}>
                        {formatINR(v.amount_paise)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#f87171', background: 'var(--status-danger-bg)', padding: '0.35rem 0.5rem', borderRadius: '4px' }}>
                      {v.last_error}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', color: '#f87171' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetry(v.id);
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
