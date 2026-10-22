import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  RefreshCw,
  Hash,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Layers
} from 'lucide-react';
import { AuditReport, MotionRecord } from '../types';
import { api } from '../services/apiClient';

interface IntegrityAuditViewProps {
  logs: MotionRecord[];
}

export const IntegrityAuditView: React.FC<IntegrityAuditViewProps> = ({ logs }) => {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [simulatedTamperIndex, setSimulatedTamperIndex] = useState<number | null>(null);

  const fetchAudit = async () => {
    try {
      setLoading(true);
      const res = await api.getAuditReport();
      setReport(res);
      setSimulatedTamperIndex(null);
    } catch (err) {
      console.error('Audit report failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  // Simulate local client-side tamper test
  const handleSimulateTamper = (idx: number) => {
    if (simulatedTamperIndex === idx) {
      setSimulatedTamperIndex(null);
    } else {
      setSimulatedTamperIndex(idx);
    }
  };

  const isIntact = report?.intact && simulatedTamperIndex === null;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-lg font-bold text-slate-100 tracking-tight">
            Database Cryptographic Integrity Audit
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
            <span>MERKLE HASH-CHAIN PROOF</span>
            <span aria-hidden="true">·</span>
            <span>ZERO-TRUST AUDIT TRAIL</span>
          </div>
        </div>

        <button
          onClick={fetchAudit}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Re-verify Audit Chain
        </button>
      </div>

      {/* Main Status Banner */}
      <div
        className={`p-5 rounded-xl border mb-6 flex items-start gap-4 ${
          isIntact
            ? 'bg-emerald-950/20 border-emerald-800/60'
            : 'bg-rose-950/20 border-rose-800/60'
        }`}
      >
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            isIntact
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/20 text-rose-400'
          }`}
        >
          {isIntact ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-slate-100">
              {isIntact
                ? 'Cryptographic Hash Chain: VERIFIED & INTACT'
                : 'INTEGRITY BREACH DETECTED'}
            </h3>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                isIntact
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-900/60 text-rose-300 border border-rose-800'
              }`}
            >
              {isIntact ? '100% UNTAMPERED' : 'INVALID MERKLE LINK'}
            </span>
          </div>

          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {isIntact
              ? `All ${report?.chainLength || logs.length} consecutive records strictly satisfy the SHA-256 hash invariant: Hash(N) = SHA256(Payload(N) || Hash(N-1)) with valid HMAC authenticator.`
              : `Tamper alert! Record at index #${simulatedTamperIndex} does not match its predecessor hash. Hash collision and state alteration detected.`}
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs font-mono text-slate-400">
            <span>ALGORITHM: SHA-256 + HMAC-SHA256</span>
            <span aria-hidden="true">·</span>
            <span>CHAIN LENGTH: <strong className="text-slate-200 tabular-nums">{report?.chainLength || logs.length} BLOCKS</strong></span>
            <span aria-hidden="true">·</span>
            <span>VERIFIED: {report ? new Date(report.verifiedAt).toLocaleTimeString() : 'Recent'}</span>
          </div>
        </div>
      </div>

      {/* Block Hash Sequence Visualizer */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
              Cryptographic Block Sequence (Recent 6 Blocks)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Click &apos;Simulate Tamper&apos; to test detection
          </span>
        </div>

        <div className="space-y-3">
          {logs.slice(0, 6).map((record, idx) => {
            const isTampered = simulatedTamperIndex === idx;

            return (
              <div
                key={record.id}
                className={`p-4 rounded-lg border transition-all ${
                  isTampered
                    ? 'bg-rose-950/30 border-rose-800'
                    : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-900">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-cyan-400 font-bold">BLOCK #{logs.length - idx}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-300 font-semibold">{record.actionName}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400 tabular-nums">{record.timestamp.slice(11, 23)}</span>
                  </div>

                  <button
                    onClick={() => handleSimulateTamper(idx)}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                      isTampered
                        ? 'bg-rose-900/60 text-rose-200 border-rose-700'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {isTampered ? 'Revert Tamper' : 'Simulate Tamper Test'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block mb-0.5">PREVIOUS HASH:</span>
                    <div className="text-[11px] text-slate-400 truncate bg-slate-900 p-1.5 rounded border border-slate-800">
                      {record.prevHash}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 text-[10px] block mb-0.5">BLOCK SHA-256 HASH:</span>
                    <div
                      className={`text-[11px] truncate p-1.5 rounded border ${
                        isTampered
                          ? 'text-rose-400 bg-rose-950/40 border-rose-800 line-through'
                          : 'text-cyan-300 bg-slate-900 border-cyan-900/60 font-semibold'
                      }`}
                    >
                      {isTampered ? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' : record.hash}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
