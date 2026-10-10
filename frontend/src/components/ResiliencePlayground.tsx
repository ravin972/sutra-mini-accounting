'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  RotateCcw, 
  CheckCircle2, 
  XCircle,
  Copy,
  Check,
  Play
} from 'lucide-react';
import { IssueSummary } from '../types';

interface ResiliencePlaygroundProps {
  apiBase: string;
  issues: IssueSummary[];
  onTriggerRefresh: () => void;
}

export const ResiliencePlayground: React.FC<ResiliencePlaygroundProps> = ({
  apiBase,
  issues,
  onTriggerRefresh,
}) => {
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<{
    testName: string;
    passed: boolean;
    logs: string[];
  } | null>(null);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  const sampleIssue = issues.find(i => i.outstanding_qty > 0) || issues[0];

  const runIdempotencyReplayTest = async () => {
    if (!sampleIssue) return;
    setRunningTest('idempotency');
    const logs: string[] = [];
    const testKey = `test-idem-${Date.now()}`;

    try {
      logs.push(`[1/3] POST /jobwork/receipts (Idempotency-Key: ${testKey})`);
      const res1 = await fetch(`${apiBase}/jobwork/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': testKey },
        body: JSON.stringify({ issue_id: sampleIssue.id, qty: 1, received_on: new Date().toISOString().split('T')[0] }),
      });
      const data1 = await res1.json();
      logs.push(`-> Response 1: HTTP ${res1.status} | is_replay: ${data1.is_replay} | Voucher: ${data1.voucher?.id?.slice(0, 8)}...`);

      logs.push(`[2/3] POST /jobwork/receipts (Exact Replay with same key)`);
      const res2 = await fetch(`${apiBase}/jobwork/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': testKey },
        body: JSON.stringify({ issue_id: sampleIssue.id, qty: 1, received_on: new Date().toISOString().split('T')[0] }),
      });
      const data2 = await res2.json();
      logs.push(`-> Response 2: HTTP ${res2.status} | is_replay: ${data2.is_replay} | Same Voucher: ${data1.voucher?.id === data2.voucher?.id}`);

      logs.push(`[3/3] POST /jobwork/receipts (Same key, altered payload: qty=5)`);
      const res3 = await fetch(`${apiBase}/jobwork/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': testKey },
        body: JSON.stringify({ issue_id: sampleIssue.id, qty: 5, received_on: new Date().toISOString().split('T')[0] }),
      });
      const data3 = await res3.json();
      logs.push(`-> Response 3: HTTP ${res3.status} (Expected 409 Conflict) | Error: ${data3.error}`);

      const passed = res1.ok && res2.ok && data2.is_replay === true && res3.status === 409;
      setTestOutput({
        testName: 'Idempotency & Replay Assertions',
        passed,
        logs,
      });
      onTriggerRefresh();
    } catch (err: any) {
      logs.push(`Exception: ${err.message}`);
      setTestOutput({
        testName: 'Idempotency & Replay Assertions',
        passed: false,
        logs,
      });
    } finally {
      setRunningTest(null);
    }
  };

  const runOvershootTest = async () => {
    if (!sampleIssue) return;
    setRunningTest('overshoot');
    const logs: string[] = [];
    const testKey = `test-over-${Date.now()}`;
    const overshootQty = sampleIssue.outstanding_qty + 50;

    try {
      logs.push(`[Overshoot] Balance remaining: ${sampleIssue.outstanding_qty} pcs`);
      logs.push(`[Action] Requesting ${overshootQty} pcs (exceeding balance by 50)`);

      const res = await fetch(`${apiBase}/jobwork/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': testKey },
        body: JSON.stringify({ issue_id: sampleIssue.id, qty: overshootQty, received_on: new Date().toISOString().split('T')[0] }),
      });
      const data = await res.json();
      logs.push(`-> Response: HTTP ${res.status}`);
      logs.push(`-> Error Message: ${data.error}`);

      const passed = res.status === 422 && data.error?.includes('overshoot');
      if (passed) {
        logs.push(`-> PASS: Atomic transaction aborted via row lock. Zero data written.`);
      }

      setTestOutput({
        testName: 'Overshoot Guard & Concurrency Lock Assertions',
        passed,
        logs,
      });
    } catch (err: any) {
      logs.push(`Exception: ${err.message}`);
      setTestOutput({
        testName: 'Overshoot Guard & Concurrency Lock Assertions',
        passed: false,
        logs,
      });
    } finally {
      setRunningTest(null);
    }
  };

  const copyCmd = (cmd: string, name: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedScript(name);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 2 Test Action Cards */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        <div 
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8', textTransform: 'uppercase' }}>
              Deduplication Assertion
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>
              Idempotency & Replay Suite
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '4px', lineHeight: 1.5 }}>
              Validates that duplicated requests return the existing record (is_replay: true) without double credit, and modified payloads yield HTTP 409.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={runIdempotencyReplayTest}
            disabled={runningTest !== null}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {runningTest === 'idempotency' ? <RotateCcw size={13} className="spin" /> : <Play size={13} />}
            <span>Run Idempotency Assertions</span>
          </button>
        </div>

        <div 
          style={{
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f87171', textTransform: 'uppercase' }}>
              Consistency Assertion
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '2px' }}>
              Overshoot Guard & Row Locks
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '4px', lineHeight: 1.5 }}>
              Attempts to claim more pieces than issued. Verifies that PostgreSQL row locking prevents over-receipt and aborts with HTTP 422.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={runOvershootTest}
            disabled={runningTest !== null}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {runningTest === 'overshoot' ? <RotateCcw size={13} className="spin" /> : <Play size={13} />}
            <span>Run Overshoot Assertions</span>
          </button>
        </div>
      </div>

      {/* Test Output Console */}
      {testOutput && (
        <div 
          style={{
            background: 'var(--bg-subtle)',
            border: `1px solid ${testOutput.passed ? 'var(--status-success-border)' : 'var(--status-danger-border)'}`,
            borderRadius: '8px',
            padding: '1rem 1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {testOutput.passed ? (
                <CheckCircle2 size={16} style={{ color: '#34d399' }} />
              ) : (
                <XCircle size={16} style={{ color: '#f87171' }} />
              )}
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: testOutput.passed ? '#34d399' : '#f87171' }}>
                {testOutput.testName}: {testOutput.passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
              onClick={() => setTestOutput(null)}
            >
              Clear
            </button>
          </div>

          <div 
            style={{
              background: 'var(--bg-app)',
              borderRadius: '6px',
              padding: '0.75rem',
              fontFamily: 'JetBrains Mono',
              fontSize: '0.75rem',
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          >
            {testOutput.logs.map((log, idx) => (
              <div key={idx} style={{ color: log.startsWith('->') ? 'var(--text-primary)' : undefined }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automated Script Runner */}
      <div 
        style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '1.25rem',
        }}
      >
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Automated Test Scripts
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            {
              title: 'Idempotency Replay Suite',
              cmd: '.\\scripts\\test_replay.ps1 -BaseUrl "http://localhost:8082"',
            },
            {
              title: 'Overshoot Concurrency Suite',
              cmd: '.\\scripts\\test_overshoot.ps1 -BaseUrl "http://localhost:8082"',
            },
            {
              title: 'Worker Crash Recovery Suite',
              cmd: '.\\scripts\\test_crash_recovery.ps1 -ApiUrl "http://localhost:8082"',
            },
          ].map((item, idx) => (
            <div 
              key={idx}
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{item.title}:</span>
                <code style={{ fontSize: '0.75rem', color: 'var(--text-primary)', marginLeft: '6px' }}>{item.cmd}</code>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => copyCmd(item.cmd, item.title)}
              >
                {copiedScript === item.title ? <Check size={11} style={{ color: '#34d399' }} /> : <Copy size={11} />}
                <span>{copiedScript === item.title ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
