'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Scissors,
  Phone,
  Image as ImageIcon
} from 'lucide-react';
import { IssueSummary } from '../types';

interface IssuesViewProps {
  issues: IssueSummary[];
  onIssueReceipt: (issueId: string) => void;
}

export const IssuesView: React.FC<IssuesViewProps> = ({
  issues,
  onIssueReceipt,
}) => {
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(8);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return issues;
    return issues.filter(
      (i) =>
        i.party_name.toLowerCase().includes(q) ||
        i.sku_name.toLowerCase().includes(q) ||
        i.sku_code.toLowerCase().includes(q)
    );
  }, [issues, query]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, pageSize]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedIssues = useMemo(() => {
    return filtered.slice(startIndex, endIndex);
  }, [filtered, startIndex, endIndex]);

  return (
    <div>
      {/* Search Toolbar */}
      <div className="ent-toolbar">
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
            placeholder="Filter by artisan workshop, product name, or SKU code..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
          {totalItems} active artisan batches in production
        </div>
      </div>

      {/* Enterprise Batch Table */}
      <div className="ent-table-card">
        <table className="ent-table">
          <thead>
            <tr>
              <th>Garment Product</th>
              <th>Artisan Workshop</th>
              <th>Reconciliation Progress</th>
              <th>Balance Remaining</th>
              <th>Dispatched On</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                  No batches matching filter.
                </td>
              </tr>
            ) : (
              paginatedIssues.map((issue) => {
                const pct = Math.round(Math.min(100, (issue.total_received_qty / issue.issued_qty) * 100));
                const isCompleted = issue.outstanding_qty === 0;

                return (
                  <tr key={issue.id}>
                    {/* Product SKU with Photo */}
                    <td style={{ minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="table-sku-thumb">
                          {issue.sku_image_url ? (
                            <img 
                              src={issue.sku_image_url} 
                              alt={issue.sku_name} 
                              className="table-sku-img"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <ImageIcon size={18} style={{ color: 'var(--text-tertiary)' }} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                            {issue.sku_name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono', marginTop: '1px' }}>
                            {issue.sku_code}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Artisan Workshop */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Scissors size={12} style={{ color: 'var(--text-tertiary)' }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                          {issue.party_name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        <Phone size={10} />
                        <span>{issue.party_phone}</span>
                      </div>
                    </td>

                    {/* Reconciliation Progress */}
                    <td style={{ minWidth: '170px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>{issue.total_received_qty} / {issue.issued_qty} pcs</span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            height: '100%', 
                            width: `${pct}%`, 
                            background: isCompleted ? 'var(--status-success)' : 'var(--accent-primary)',
                            transition: 'width 0.3s ease' 
                          }} 
                        />
                      </div>
                    </td>

                    {/* Balance */}
                    <td>
                      <span 
                        className="badge-clean"
                        style={{
                          background: isCompleted ? 'var(--status-success-bg)' : 'var(--status-info-bg)',
                          color: isCompleted ? '#34d399' : '#38bdf8',
                          border: `1px solid ${isCompleted ? 'var(--status-success-border)' : 'var(--status-info-border)'}`
                        }}
                      >
                        <span className="badge-dot" style={{ background: isCompleted ? '#34d399' : '#38bdf8' }} />
                        {isCompleted ? 'Fulfilled' : `${issue.outstanding_qty} pcs remaining`}
                      </span>
                    </td>

                    {/* Date */}
                    <td>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                        {issue.issued_on}
                      </span>
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className={isCompleted ? 'btn-secondary' : 'btn-primary'}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => onIssueReceipt(issue.id)}
                        disabled={isCompleted}
                      >
                        <Plus size={12} />
                        <span>{isCompleted ? 'Fulfilled' : 'Record Receipt'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Enterprise Pagination Bar */}
        <div className="ent-pagination">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>
              Showing <strong>{totalItems > 0 ? startIndex + 1 : 0}–{endIndex}</strong> of <strong>{totalItems}</strong> batches
            </span>

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
                <option value={8}>8</option>
                <option value={16}>16</option>
                <option value={32}>32</option>
              </select>
            </div>
          </div>

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
    </div>
  );
};
