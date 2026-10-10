'use client';

import React from 'react';
import { 
  Plus, 
  RefreshCw, 
  Activity,
  Sun,
  Moon,
  Search,
  Bell,
  Sparkles
} from 'lucide-react';

interface NavbarProps {
  apiBase: string;
  isHealthy: boolean;
  autoRefresh: boolean;
  setAutoRefresh: (val: boolean) => void;
  loading: boolean;
  onRefresh: () => void;
  onOpenReceiptModal: () => void;
  onOpenAskTab: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  activeTabTitle: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  apiBase,
  isHealthy,
  autoRefresh,
  setAutoRefresh,
  loading,
  onRefresh,
  onOpenReceiptModal,
  onOpenAskTab,
  theme,
  onToggleTheme,
  activeTabTitle,
}) => {
  return (
    <header className="ent-header">
      <div className="ent-brand-group">
        <div className="ent-title-area">
          <div className="ent-breadcrumbs">
            <span>Shree Radha Studio</span>
            <span>/</span>
            <span>Gandhi Nagar Ops</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{activeTabTitle}</span>
          </div>
          <div className="ent-title">
            <span>{activeTabTitle}</span>
            <span className="ent-env-badge">
              <span 
                className="ent-status-dot" 
                style={{ background: isHealthy ? 'var(--status-success)' : 'var(--status-danger)' }} 
              />
              {isHealthy ? 'Backend :8082 Active' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      <div className="ent-actions">
        {/* Quick Action: Record Receipt */}
        <button
          type="button"
          className="btn-primary"
          onClick={onOpenReceiptModal}
          style={{ fontSize: '0.78rem' }}
        >
          <Plus size={13} />
          <span>New Receipt</span>
        </button>

        {/* Auto Refresh pill toggle */}
        <button 
          type="button" 
          className="btn-secondary"
          onClick={() => setAutoRefresh(!autoRefresh)}
          style={{ 
            color: autoRefresh ? 'var(--text-primary)' : 'var(--text-tertiary)',
            fontSize: '0.78rem' 
          }}
          title="Toggle 3-second background polling"
        >
          <Activity size={13} className={autoRefresh ? 'spin' : ''} />
          <span>Auto-sync: {autoRefresh ? '3s' : 'Off'}</span>
        </button>

        {/* Manual Refresh */}
        <button 
          type="button" 
          className="btn-secondary"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh ledger state"
          style={{ fontSize: '0.78rem' }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          <span>Sync Now</span>
        </button>

        {/* Theme Toggle Button */}
        <button
          type="button"
          className="btn-secondary"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{ fontSize: '0.78rem', padding: '0.45rem 0.65rem' }}
        >
          {theme === 'dark' ? (
            <Sun size={13} style={{ color: '#fbbf24' }} />
          ) : (
            <Moon size={13} style={{ color: '#6366f1' }} />
          )}
        </button>
      </div>
    </header>
  );
};
