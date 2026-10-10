'use client';

import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  XCircle, 
  X 
} from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="ent-toast-container">
      {toasts.map((t) => {
        const Icon = 
          t.type === 'success' 
            ? CheckCircle2 
            : t.type === 'error' 
              ? XCircle 
              : t.type === 'warning' 
                ? AlertTriangle 
                : Info;

        const iconColor = 
          t.type === 'success' 
            ? '#34d399' 
            : t.type === 'error' 
              ? '#f87171' 
              : t.type === 'warning' 
                ? '#fbbf24' 
                : '#38bdf8';

        return (
          <div key={t.id} className="ent-toast">
            <Icon size={16} style={{ color: iconColor, flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                {t.title}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>
                {t.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: '2px',
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
