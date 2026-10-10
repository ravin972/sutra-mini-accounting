'use client';

import React, { useState } from 'react';
import { 
  Terminal, 
  Send, 
  RefreshCw, 
  CheckCircle, 
  CornerDownLeft
} from 'lucide-react';
import { AskResponse } from '../types';

interface AskAssistantProps {
  apiBase: string;
}

export const AskAssistant: React.FC<AskAssistantProps> = ({ apiBase }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleQuestions = [
    'What is Rafiq remaining balance?',
    'Check Laxmi Stitching status',
    'Test Artisan summary',
    'Kurti jobwork balance',
  ];

  const handleAsk = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) {
        throw new Error(`API returned HTTP ${res.status}`);
      }

      const data: AskResponse = await res.json();
      setResponse(data);
    } catch (err: any) {
      setError(err.message || 'Failed to query assistant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Search Input Box */}
      <div 
        style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
          <Terminal size={16} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Ledger Intelligence Copilot</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>· Read-only database tool execution</span>
        </div>

        {/* Input bar */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Ask about artisan balances, pending units, or batch reconciliation..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAsk();
            }}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleAsk()}
            disabled={loading || !question.trim()}
          >
            {loading ? <RefreshCw size={14} className="spin" /> : <CornerDownLeft size={14} />}
            <span>Query</span>
          </button>
        </div>

        {/* Preset prompts */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.85rem' }}>
          {sampleQuestions.map((sq, idx) => (
            <button
              key={idx}
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
              onClick={() => {
                setQuestion(sq);
                handleAsk(sq);
              }}
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div 
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            background: 'var(--status-danger-bg)',
            border: '1px solid var(--status-danger-border)',
            color: '#f87171',
            fontSize: '0.82rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Query Result Card */}
      {response && (
        <div 
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '2px' }}>
              Query Prompt
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
              &ldquo;{response.question}&rdquo;
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Ledger State Answer
            </div>
            <div 
              style={{
                fontSize: '0.85rem',
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                background: 'var(--bg-app)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.85rem 1rem',
                whiteSpace: 'pre-line',
              }}
            >
              {response.answer}
            </div>
          </div>

          {/* Tool Calls Logs */}
          {response.tool_calls && response.tool_calls.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Tool Execution Audit
              </div>
              {response.tool_calls.map((tc, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '0.65rem 0.85rem',
                    fontFamily: 'JetBrains Mono',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', marginBottom: '2px' }}>
                    <span>{tc.tool_name}()</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{tc.timestamp}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Args: {JSON.stringify(tc.arguments)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={12} style={{ color: '#34d399' }} />
            <span>Resolution Mode: {response.model_status}</span>
          </div>
        </div>
      )}
    </div>
  );
};
