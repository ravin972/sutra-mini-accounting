'use client';

import React from 'react';
import { 
  Table as TableIcon, 
  Package, 
  Terminal, 
  ShieldCheck, 
  Shirt, 
  Plus, 
  Database, 
  Cpu, 
  Sun, 
  Moon, 
  CheckCircle2, 
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface SidebarProps {
  activeTab: 'vouchers' | 'issues' | 'catalog' | 'ask' | 'resilience';
  setActiveTab: (tab: 'vouchers' | 'issues' | 'catalog' | 'ask' | 'resilience') => void;
  vouchersCount: number;
  issuesCount: number;
  failedCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  isHealthy: boolean;
  onOpenReceiptModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  vouchersCount,
  issuesCount,
  failedCount,
  theme,
  onToggleTheme,
  isHealthy,
  onOpenReceiptModal,
}) => {
  return (
    <aside className="ent-sidebar">
      {/* Brand Header */}
      <div className="ent-sidebar-brand">
        <div className="ent-sidebar-logo">
          <span>SRS</span>
        </div>
        <div className="ent-sidebar-brand-text">
          <div className="ent-sidebar-brand-title">
            Shree Radha Studio
          </div>
          <div className="ent-sidebar-brand-sub">
            Gandhi Nagar, Delhi · ERP v2.4
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="ent-sidebar-action">
        <button
          type="button"
          className="btn-primary ent-sidebar-cta"
          onClick={onOpenReceiptModal}
        >
          <Plus size={15} />
          <span>Record Receipt</span>
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="ent-sidebar-nav">
        <div className="ent-sidebar-group-label">OPERATIONS</div>

        <button
          type="button"
          className={`ent-sidebar-link ${activeTab === 'vouchers' ? 'active' : ''}`}
          onClick={() => setActiveTab('vouchers')}
        >
          <div className="ent-sidebar-link-left">
            <TableIcon size={16} />
            <span>Outbox Stream</span>
          </div>
          <div className="ent-sidebar-badges">
            {failedCount > 0 && (
              <span className="ent-badge-alert" title={`${failedCount} failed vouchers need retry`}>
                {failedCount}
              </span>
            )}
            <span className="ent-sidebar-count">{vouchersCount}</span>
          </div>
        </button>

        <button
          type="button"
          className={`ent-sidebar-link ${activeTab === 'issues' ? 'active' : ''}`}
          onClick={() => setActiveTab('issues')}
        >
          <div className="ent-sidebar-link-left">
            <Package size={16} />
            <span>Jobwork Batches</span>
          </div>
          <span className="ent-sidebar-count">{issuesCount}</span>
        </button>

        <button
          type="button"
          className={`ent-sidebar-link ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalog')}
        >
          <div className="ent-sidebar-link-left">
            <Shirt size={16} />
            <span>Garment Catalog</span>
          </div>
          <span className="ent-sidebar-pill">5 SKUs</span>
        </button>

        <div className="ent-sidebar-group-label" style={{ marginTop: '1.25rem' }}>
          INTELLIGENCE & CHAOS
        </div>

        <button
          type="button"
          className={`ent-sidebar-link ${activeTab === 'ask' ? 'active' : ''}`}
          onClick={() => setActiveTab('ask')}
        >
          <div className="ent-sidebar-link-left">
            <Terminal size={16} />
            <span>Ledger Copilot</span>
          </div>
          <span className="ent-sidebar-pill-ai">
            <Sparkles size={11} />
            <span>AI</span>
          </span>
        </button>

        <button
          type="button"
          className={`ent-sidebar-link ${activeTab === 'resilience' ? 'active' : ''}`}
          onClick={() => setActiveTab('resilience')}
        >
          <div className="ent-sidebar-link-left">
            <ShieldCheck size={16} />
            <span>Resilience Suite</span>
          </div>
          <span className="ent-sidebar-pill">Chaos</span>
        </button>
      </nav>

      {/* System Telemetry Box */}
      <div className="ent-sidebar-telemetry">
        <div className="ent-sidebar-telemetry-header">
          <span>SYSTEM TELEMETRY</span>
          <span className="ent-telemetry-status">
            <span 
              className="ent-status-dot" 
              style={{ background: isHealthy ? 'var(--status-success)' : 'var(--status-danger)' }} 
            />
            {isHealthy ? 'Online' : 'Degraded'}
          </span>
        </div>
        <div className="ent-telemetry-item">
          <Database size={13} style={{ color: 'var(--text-tertiary)' }} />
          <span>Neon PostgreSQL:</span>
          <strong style={{ color: '#34d399', marginLeft: 'auto' }}>Connected</strong>
        </div>
        <div className="ent-telemetry-item">
          <Cpu size={13} style={{ color: 'var(--text-tertiary)' }} />
          <span>Outbox Daemon:</span>
          <strong style={{ color: '#38bdf8', marginLeft: 'auto' }}>4 Workers</strong>
        </div>
        <div className="ent-telemetry-item">
          <Layers size={13} style={{ color: 'var(--text-tertiary)' }} />
          <span>Mock Accounting:</span>
          <strong style={{ color: '#fbbf24', marginLeft: 'auto' }}>:8081 Active</strong>
        </div>
      </div>

      {/* Sidebar Footer with Profile & Theme */}
      <div className="ent-sidebar-footer">
        <div className="ent-sidebar-user">
          <div className="ent-user-avatar">RP</div>
          <div className="ent-user-info">
            <div className="ent-user-name">Ravinder Pandey</div>
            <div className="ent-user-role">Lead Operations</div>
          </div>
        </div>

        <button
          type="button"
          className="ent-theme-toggle"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun size={15} style={{ color: '#fbbf24' }} />
          ) : (
            <Moon size={15} style={{ color: '#6366f1' }} />
          )}
        </button>
      </div>
    </aside>
  );
};
