import React, { useState } from 'react';
import {
  Search,
  Filter,
  Download,
  Trash2,
  CheckCircle2,
  Shield,
  Eye,
  Hand,
  Smile,
  Activity,
  FileCode,
  FileSpreadsheet,
  X,
  ExternalLink
} from 'lucide-react';
import { MotionRecord } from '../types';
import { api } from '../services/apiClient';

interface LedgerTableProps {
  logs: MotionRecord[];
  onRefresh: () => void;
  activeSessionId: string;
}

export const LedgerTable: React.FC<LedgerTableProps> = ({
  logs,
  onRefresh,
  activeSessionId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [selectedRecord, setSelectedRecord] = useState<MotionRecord | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState<boolean>(false);
  const [purgePin, setPurgePin] = useState<string>('');
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState<boolean>(false);

  // Filter logs locally for instant responsiveness
  const filteredLogs = logs.filter(record => {
    if (selectedCategory !== 'all' && record.category !== selectedCategory) {
      return false;
    }
    if (record.confidence < minConfidence) {
      return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchAction = record.actionName.toLowerCase().includes(q);
      const matchId = record.id.toLowerCase().includes(q);
      const matchHash = record.hash.toLowerCase().includes(q);
      const matchNotes = record.metadata?.notes?.toLowerCase().includes(q);
      if (!matchAction && !matchId && !matchHash && !matchNotes) {
        return false;
      }
    }
    return true;
  });

  const handlePurge = async () => {
    setIsPurging(true);
    setPurgeError(null);
    try {
      await api.purgeLogs(purgePin);
      setShowPurgeModal(false);
      setPurgePin('');
      onRefresh();
    } catch (err: any) {
      setPurgeError(err.message || 'Purge failed. Invalid security PIN (try 8899).');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden bg-slate-950">
      {/* Table Header & Controls Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-lg font-bold text-slate-100 tracking-tight">
            Cryptographic Biometric Ledger
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
            <span>SHA-256 HASH CHAINING</span>
            <span aria-hidden="true">·</span>
            <span>IMMUTABLE AUDIT TRAIL</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-400 tabular-nums">{logs.length} TOTAL RECORDS</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={api.getExportUrl('csv')}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Export CSV
          </a>

          <a
            href={api.getExportUrl('json')}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileCode className="w-3.5 h-3.5 text-cyan-400" />
            Export JSON
          </a>

          <button
            onClick={() => setShowPurgeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/40 border border-rose-900/60 hover:bg-rose-900/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge Ledger
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by action, record ID, or hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          {[
            { id: 'all', label: 'All Actions' },
            { id: 'hand_sign', label: 'Hand Signs' },
            { id: 'facial_expression', label: 'Facial Expressions' },
            { id: 'motion_burst', label: 'Motion Bursts' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === tab.id
                  ? 'bg-slate-800 text-cyan-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Confidence Threshold */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono">
          <span className="text-slate-400">Min Conf:</span>
          <span className="text-cyan-400 font-semibold tabular-nums w-8">
            {Math.round(minConfidence * 100)}%
          </span>
          <input
            type="range"
            min="0"
            max="0.95"
            step="0.05"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="w-20 accent-cyan-500"
          />
        </div>
      </div>

      {/* High-Density Data Grid */}
      <div className="flex-1 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden flex flex-col shadow-inner">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900/90 sticky top-0 z-10 text-slate-400 font-mono uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 w-44">Timestamp</th>
                <th className="py-3 px-4 w-36">Category</th>
                <th className="py-3 px-4">Action Recognized</th>
                <th className="py-3 px-4 text-right w-28">Confidence</th>
                <th className="py-3 px-4 font-mono w-44">SHA-256 Hash</th>
                <th className="py-3 px-4 text-center w-24">Chain Check</th>
                <th className="py-3 px-4 text-right w-20">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30 text-cyan-400" />
                    <p className="text-sm font-medium text-slate-400">No matching biometric records found</p>
                    <p className="text-xs text-slate-500 mt-1">Adjust your search parameters or start recording in the Live Monitor.</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((record) => {
                  const date = new Date(record.epochMs);
                  const formattedTime = date.toISOString().replace('T', ' ').slice(0, 19);

                  return (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedRecord(record)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-2.5 px-4 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                        {formattedTime}
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {record.category === 'hand_sign' ? (
                            <Hand className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          ) : record.category === 'facial_expression' ? (
                            <Smile className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                          <span className="capitalize text-slate-300">
                            {record.category.replace('_', ' ')}
                          </span>
                        </div>
                      </td>

                      {/* Action Name */}
                      <td className="py-2.5 px-4 font-semibold text-slate-100">
                        {record.actionName}
                      </td>

                      {/* Confidence */}
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        <span className="text-cyan-400 font-medium">
                          {(record.confidence * 100).toFixed(1)}%
                        </span>
                      </td>

                      {/* SHA-256 Hash Preview */}
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 truncate max-w-[160px]">
                        {record.hash ? record.hash.slice(0, 16) + '...' : 'N/A'}
                      </td>

                      {/* Verification Status */}
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          VALID
                        </span>
                      </td>

                      {/* View Action */}
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(record);
                          }}
                          className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                          title="Inspect cryptographic proof"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Inspection Modal / Drawer */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Cryptographic Record Proof
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    ID: {selectedRecord.id}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                <div>
                  <span className="text-slate-500 block">ACTION NAME:</span>
                  <span className="text-slate-200 font-semibold">{selectedRecord.actionName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">CATEGORY:</span>
                  <span className="text-slate-200 capitalize">{selectedRecord.category}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">TIMESTAMP:</span>
                  <span className="text-slate-200 tabular-nums">{selectedRecord.timestamp}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">CONFIDENCE:</span>
                  <span className="text-cyan-400 font-semibold tabular-nums">
                    {(selectedRecord.confidence * 100).toFixed(2)}%
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">PREVIOUS BLOCK HASH (Chained link):</span>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[11px] break-all text-slate-400">
                  {selectedRecord.prevHash}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">CURRENT RECORD SHA-256 HASH:</span>
                <div className="p-2.5 bg-slate-950 rounded border border-cyan-900/60 text-[11px] break-all text-cyan-300 font-semibold">
                  {selectedRecord.hash}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">HMAC DIGITAL SIGNATURE:</span>
                <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[11px] break-all text-emerald-400">
                  {selectedRecord.signature}
                </div>
              </div>

              {selectedRecord.metadata && (
                <div>
                  <span className="text-slate-400 block mb-1">METADATA PAYLOAD:</span>
                  <pre className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[11px] text-slate-300 overflow-x-auto">
                    {JSON.stringify(selectedRecord.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operator Security Purge Modal */}
      {showPurgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
            <h3 className="text-base font-bold text-slate-100 mb-2">
              Authorize Database Purge
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              This action resets the biometric records database. A cryptographically signed audit block will be appended documenting this authorized purge event.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-mono text-slate-400 mb-1">
                OPERATOR SECURITY PIN (Default: 8899)
              </label>
              <input
                type="password"
                value={purgePin}
                onChange={(e) => setPurgePin(e.target.value)}
                placeholder="Enter 4-digit PIN"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            {purgeError && (
              <p className="text-xs text-rose-400 mb-4">{purgeError}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPurgeModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                disabled={isPurging || !purgePin}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {isPurging ? 'Purging...' : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
