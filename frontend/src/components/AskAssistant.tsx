'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal, 
  Send, 
  RefreshCw, 
  CheckCircle, 
  Bot, 
  User, 
  Code, 
  ChevronDown, 
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { AskResponse } from '../types';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  toolCalls?: AskResponse['tool_calls'];
  modelStatus?: string;
  timestamp: string;
}

interface AskAssistantProps {
  apiBase: string;
}

export const AskAssistant: React.FC<AskAssistantProps> = ({ apiBase }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hello! I am your **Sutra Mini Ledger Copilot**.\n\nYou can ask me anything about:\n• Artisan holding balances (e.g. *\"How much is with Rafiq?\"*)\n• Batch reconciliation progress (e.g. *\"Check Laxmi Stitching status\"*)\n• Accounting synchronization health (e.g. *\"What is the voucher status?\"*)\n• Dead letter diagnostics (e.g. *\"Are there any failed vouchers?\"*)",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const samplePrompts = [
    'How much is with Rafiq?',
    'What is the voucher status?',
    'Check Laxmi Stitching status',
    'Are there any failed vouchers?',
    'Show Kurti inventory balance',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const toggleTools = (msgId: string) => {
    setExpandedTools((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleSend = async (queryText?: string) => {
    const q = (queryText || input).trim();
    if (!q || loading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

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
      const assistantMsg: Message = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: data.answer || 'No records found matching your query.',
        toolCalls: data.tool_calls,
        modelStatus: data.model_status,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Error querying ledger**: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      style={{
        maxWidth: '920px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        height: '75vh',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Copilot Header */}
      <div 
        style={{
          padding: '0.85rem 1.25rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0c0f17',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div 
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'var(--bg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
            }}
          >
            <Sparkles size={15} />
          </div>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Ledger Copilot</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              Transactional Read-Only Assistant
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#34d399' }}>
          <span className="badge-dot" style={{ background: '#34d399' }} />
          <span>Active & Connected (:8082)</span>
        </div>
      </div>

      {/* Message Stream */}
      <div 
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {messages.map((m) => (
          <div 
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {/* Sender Tag */}
            <div 
              style={{
                fontSize: '0.7rem',
                color: 'var(--text-tertiary)',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {m.sender === 'user' ? (
                <><span>You</span> <User size={11} /></>
              ) : (
                <><Bot size={11} /> <span>Sutra Copilot</span></>
              )}
              <span>· {m.timestamp}</span>
            </div>

            {/* Bubble */}
            <div 
              style={{
                maxWidth: '85%',
                padding: '0.85rem 1.15rem',
                borderRadius: m.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: m.sender === 'user' ? '#1e293b' : 'var(--bg-surface)',
                border: m.sender === 'user' ? '1px solid #334155' : '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
            >
              {m.text}
            </div>

            {/* Collapsible Tool Audit Trace */}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div style={{ marginTop: '6px', maxWidth: '85%' }}>
                <button
                  type="button"
                  onClick={() => toggleTools(m.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 4px',
                  }}
                >
                  <Code size={11} />
                  <span>{m.toolCalls.length} database tool call(s) audited</span>
                  {expandedTools[m.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>

                {expandedTools[m.id] && (
                  <div 
                    style={{
                      marginTop: '4px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.72rem',
                      fontFamily: 'JetBrains Mono',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {m.toolCalls.map((tc, idx) => (
                      <div key={idx} style={{ color: '#38bdf8' }}>
                        <div><strong>{tc.tool_name}()</strong> <span style={{ color: 'var(--text-tertiary)' }}>({tc.timestamp})</span></div>
                        <div style={{ color: 'var(--text-secondary)' }}>Args: {JSON.stringify(tc.arguments)}</div>
                      </div>
                    ))}
                    {m.modelStatus && (
                      <div style={{ color: '#34d399', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4px', marginTop: '4px' }}>
                        ✓ {m.modelStatus}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <RefreshCw size={14} className="spin" />
            <span>Consulting transactional ledger database...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Chips */}
      <div 
        style={{
          padding: '0.5rem 1.25rem',
          borderTop: '1px solid var(--border-subtle)',
          background: '#0c0f17',
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {samplePrompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '4px' }}
            onClick={() => handleSend(p)}
            disabled={loading}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div 
        style={{
          padding: '0.75rem 1.25rem',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-subtle)',
          display: 'flex',
          gap: '0.5rem',
        }}
      >
        <input
          type="text"
          className="form-control"
          placeholder="Ask anything about Rafiq, Laxmi, vouchers, sync errors, or balances..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          disabled={loading}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
        >
          {loading ? <RefreshCw size={13} className="spin" /> : <Send size={13} />}
          <span>Send</span>
        </button>
      </div>
    </div>
  );
};
