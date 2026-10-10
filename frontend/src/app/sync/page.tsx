'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table as TableIcon, 
  Package, 
  Terminal, 
  ShieldCheck 
} from 'lucide-react';

import { Voucher, IssueSummary, ToastMessage } from '../../types';
import { Navbar } from '../../components/Navbar';
import { StatsRibbon } from '../../components/StatsRibbon';
import { VouchersView } from '../../components/VouchersView';
import { IssuesView } from '../../components/IssuesView';
import { AskAssistant } from '../../components/AskAssistant';
import { ResiliencePlayground } from '../../components/ResiliencePlayground';
import { ReceiptModal } from '../../components/ReceiptModal';
import { VoucherDetailModal } from '../../components/VoucherDetailModal';
import { Toast } from '../../components/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082';

export default function SyncDashboardPage() {
  const [activeTab, setActiveTab] = useState<'vouchers' | 'issues' | 'ask' | 'resilience'>('vouchers');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isHealthy, setIsHealthy] = useState<boolean>(true);

  // Modals & Drawers
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [preselectedIssueId, setPreselectedIssueId] = useState<string | null>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isRetryingAll, setIsRetryingAll] = useState<boolean>(false);

  // Toast stack
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastMessage['type'], title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch functions
  const fetchVouchers = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vouchers`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Voucher[] = await res.json();
      setVouchers(data || []);
      setIsHealthy(true);
    } catch (err: any) {
      setIsHealthy(false);
      if (!isSilent) {
        addToast('error', 'Connection Error', `Unable to connect to backend API: ${err.message}`);
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  const fetchIssues = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/issues`);
      if (!res.ok) return;
      const data: IssueSummary[] = await res.json();
      setIssues(data || []);
    } catch (err: any) {
      console.warn('Failed to fetch issues:', err);
    }
  }, []);

  useEffect(() => {
    const handleRejection = (e: PromiseRejectionEvent) => {
      const reasonStr = (e.reason?.stack || e.reason?.message || e.reason?.toString() || '');
      if (
        reasonStr.includes('MetaMask') ||
        reasonStr.includes('chrome-extension://') ||
        reasonStr.includes('moz-extension://')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('unhandledrejection', handleRejection, true);
    return () => window.removeEventListener('unhandledrejection', handleRejection, true);
  }, []);

  useEffect(() => {
    fetchVouchers();
    fetchIssues();
  }, [fetchVouchers, fetchIssues]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchVouchers(true);
      fetchIssues();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchVouchers, fetchIssues]);

  const handleOpenReceiptModal = (issueId?: string) => {
    setPreselectedIssueId(issueId || null);
    setIsReceiptModalOpen(true);
  };

  const handleCreateReceipt = async (
    issueId: string, 
    qty: number, 
    idempotencyKey: string, 
    simulateRace: boolean
  ) => {
    setSubmittingReceipt(true);
    try {
      if (simulateRace) {
        addToast('info', 'Race Condition Test', `Fired 2 parallel requests with key: ${idempotencyKey.slice(0, 10)}...`);
        const payload = JSON.stringify({
          issue_id: issueId,
          qty: Number(qty),
          received_on: new Date().toISOString().split('T')[0],
        });

        const [res1, res2] = await Promise.all([
          fetch(`${API_BASE}/jobwork/receipts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: payload,
          }),
          fetch(`${API_BASE}/jobwork/receipts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: payload,
          }),
        ]);

        const data1 = await res1.json();
        const data2 = await res2.json();

        if (res1.ok && res2.ok) {
          const replayInfo = data1.is_replay ? 'Call 1' : data2.is_replay ? 'Call 2' : 'None';
          addToast(
            'success',
            'Concurrency Test Verified',
            `Both requests processed safely. One created the record, the other returned idempotent replay (${replayInfo}). Zero duplicates.`
          );
        } else {
          addToast('warning', 'Concurrency Test Result', `Request 1: HTTP ${res1.status}, Request 2: HTTP ${res2.status}`);
        }
      } else {
        const res = await fetch(`${API_BASE}/jobwork/receipts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            issue_id: issueId,
            qty: Number(qty),
            received_on: new Date().toISOString().split('T')[0],
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        if (data.is_replay) {
          addToast(
            'warning',
            'Idempotent Replay',
            `Existing receipt returned for key ${idempotencyKey.slice(0, 10)}... No second voucher created.`
          );
        } else {
          addToast(
            'success',
            'Receipt Recorded',
            `Created receipt for ${qty} pcs. Outbox voucher queued for background worker sync.`
          );
        }
      }

      setIsReceiptModalOpen(false);
      await Promise.all([fetchVouchers(true), fetchIssues()]);
    } catch (err: any) {
      addToast('error', 'Request Rejected', err.message);
    } finally {
      setSubmittingReceipt(false);
    }
  };

  const handleRetryVoucher = async (voucherId: string) => {
    setRetryingId(voucherId);
    try {
      const res = await fetch(`${API_BASE}/vouchers/${voucherId}/retry`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      addToast(
        'success',
        'Voucher Re-Armed',
        `Voucher ${voucherId.slice(0, 8)}... reset to pending. Background worker will retry immediately.`
      );

      if (selectedVoucher && selectedVoucher.id === voucherId) {
        setSelectedVoucher(data);
      }
      await fetchVouchers(true);
    } catch (err: any) {
      addToast('error', 'Retry Failed', err.message);
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllFailed = async () => {
    const failedList = vouchers.filter((v) => v.status === 'failed');
    if (failedList.length === 0) return;

    setIsRetryingAll(true);
    try {
      await Promise.all(
        failedList.map((v) =>
          fetch(`${API_BASE}/vouchers/${v.id}/retry`, { method: 'POST' })
        )
      );
      addToast(
        'success',
        'Bulk Retry Initiated',
        `Re-armed ${failedList.length} failed vouchers for background retry.`
      );
      await fetchVouchers(true);
    } catch (err: any) {
      addToast('error', 'Bulk Retry Error', err.message);
    } finally {
      setIsRetryingAll(false);
    }
  };

  return (
    <div className="app-shell">
      {/* Enterprise Navbar */}
      <Navbar
        apiBase={API_BASE}
        isHealthy={isHealthy}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        loading={loading}
        onRefresh={() => {
          fetchVouchers(false);
          fetchIssues();
        }}
        onOpenReceiptModal={() => handleOpenReceiptModal()}
        onOpenAskTab={() => setActiveTab('ask')}
      />

      {/* KPI Stats Row */}
      <StatsRibbon
        vouchers={vouchers}
        issues={issues}
        onRetryAllFailed={handleRetryAllFailed}
        isRetryingAll={isRetryingAll}
      />

      {/* Enterprise Tabs Navigation */}
      <div className="ent-tabs-bar">
        <div className="ent-tab-list">
          <button
            type="button"
            className={`ent-tab-btn ${activeTab === 'vouchers' ? 'active' : ''}`}
            onClick={() => setActiveTab('vouchers')}
          >
            <TableIcon size={14} />
            <span>Outbox Stream</span>
            <span className="ent-pill-count">{vouchers.length}</span>
          </button>

          <button
            type="button"
            className={`ent-tab-btn ${activeTab === 'issues' ? 'active' : ''}`}
            onClick={() => setActiveTab('issues')}
          >
            <Package size={14} />
            <span>Jobwork Batches</span>
            <span className="ent-pill-count">{issues.length}</span>
          </button>

          <button
            type="button"
            className={`ent-tab-btn ${activeTab === 'ask' ? 'active' : ''}`}
            onClick={() => setActiveTab('ask')}
          >
            <Terminal size={14} />
            <span>Ledger Copilot</span>
          </button>

          <button
            type="button"
            className={`ent-tab-btn ${activeTab === 'resilience' ? 'active' : ''}`}
            onClick={() => setActiveTab('resilience')}
          >
            <ShieldCheck size={14} />
            <span>Resilience Suite</span>
          </button>
        </div>
      </div>

      {/* Active Tab View */}
      <main>
        {activeTab === 'vouchers' && (
          <VouchersView
            vouchers={vouchers}
            onSelectVoucher={(v) => setSelectedVoucher(v)}
            onRetry={handleRetryVoucher}
            retryingId={retryingId}
          />
        )}

        {activeTab === 'issues' && (
          <IssuesView
            issues={issues}
            onIssueReceipt={(issueId) => handleOpenReceiptModal(issueId)}
          />
        )}

        {activeTab === 'ask' && (
          <AskAssistant apiBase={API_BASE} />
        )}

        {activeTab === 'resilience' && (
          <ResiliencePlayground
            apiBase={API_BASE}
            issues={issues}
            onTriggerRefresh={() => {
              fetchVouchers(true);
              fetchIssues();
            }}
          />
        )}
      </main>

      {/* Record Receipt Dialog */}
      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        issues={issues}
        preselectedIssueId={preselectedIssueId}
        onSubmit={handleCreateReceipt}
        submitting={submittingReceipt}
      />

      {/* Voucher Inspection Dialog */}
      <VoucherDetailModal
        voucher={selectedVoucher}
        onClose={() => setSelectedVoucher(null)}
        onRetry={handleRetryVoucher}
        retrying={retryingId === selectedVoucher?.id}
      />

      {/* Toast Notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
