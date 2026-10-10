'use client';

import React from 'react';
import { 
  Plus, 
  RefreshCw, 
  Terminal, 
  Activity,
  CheckCircle,
  AlertCircle
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
}) => {
  return (
    <header className="ent-header">
      <div className="ent-brand-group">
        <div className="ent-logo-badge" title="Shree Radha Studio">
          SRS
        </div>
        <div className="ent-title-area">
          <div className="ent-breadcrumbs">
            <span>Manufacturing</span>
            <span>/</span>
            <span>Jobwork Ledger</span>
          </div>
          <div className="ent-title">
            Sutra Mini
            <span className="ent-env-badge">
              <span 
                className="ent-status-dot" 
                style={{ background: isHealthy ? 'var(--status-success)' : 'var(--status-danger)' }} 
              />
              {isHealthy ? 'Live (:8082)' : 'Connecting'}
            </span>
          </div>
        </div>
      </div>

      <div className="ent-actions">
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
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          <span>Sync Now</span>
        </button>

        {/* Ask AI Assistant */}
        <button 
          type="button" 
          className="btn-secondary"
          onClick={onOpenAskTab}
          title="Query ledger with natural language"
        >
          <Terminal size={13} />
          <span>Ask Assistant</span>
        </button>

        {/* Primary Action: Record Receipt */}
        <button 
          type="button" 
          className="btn-primary"
          onClick={onOpenReceiptModal}
        >
          <Plus size={15} />
          <span>Record Receipt</span>
        </button>
      </div>
    </header>
  );
};
