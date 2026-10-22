import React, { useState } from 'react';
import { X, Play, CheckCircle2, Clock, Plus, FolderKanban } from 'lucide-react';
import { RecordingSession } from '../types';
import { api } from '../services/apiClient';

interface SessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: RecordingSession[];
  currentSession: RecordingSession | null;
  onSelectSession: (session: RecordingSession) => void;
  onRefreshSessions: () => void;
}

export const SessionManagerModal: React.FC<SessionManagerModalProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSession,
  onSelectSession,
  onRefreshSessions,
}) => {
  const [newSessionName, setNewSessionName] = useState('');
  const [operatorName, setOperatorName] = useState('Dr. Sarah Lin (Lead Biometrics)');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;

    setIsCreating(true);
    try {
      const created = await api.createSession(newSessionName.trim(), operatorName.trim());
      onRefreshSessions();
      onSelectSession(created);
      setNewSessionName('');
      onClose();
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleStopSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.stopSession(id);
      onRefreshSessions();
    } catch (err) {
      console.error('Failed to stop session:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-slate-100">
              Biometric Recording Sessions
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Create New Session Form */}
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-slate-950 rounded-xl border border-slate-800/80">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-3 font-mono">
            Start New Monitoring Session
          </span>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-400 font-mono mb-1">
                SESSION TITLE
              </label>
              <input
                type="text"
                placeholder="e.g. Ergonomics Observation Unit 4"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 font-mono mb-1">
                SUPERVISING OPERATOR
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={isCreating || !newSessionName.trim()}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {isCreating ? 'Creating Session...' : 'Create & Switch to Session'}
            </button>
          </div>
        </form>

        {/* Existing Sessions List */}
        <div>
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2 font-mono">
            Session History
          </span>

          <div className="max-h-60 overflow-y-auto space-y-2">
            {sessions.map((ses) => {
              const isSelected = currentSession?.id === ses.id;

              return (
                <div
                  key={ses.id}
                  onClick={() => {
                    onSelectSession(ses);
                    onClose();
                  }}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-cyan-950/30 border-cyan-700/80'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">
                        {ses.name}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-mono text-cyan-400">
                          (ACTIVE TARGET)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      <span>{ses.operator}</span>
                      <span className="mx-1">·</span>
                      <span className="tabular-nums">{ses.recordCount || 0} records</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {ses.status === 'active' ? (
                      <button
                        onClick={(e) => handleStopSession(ses.id, e)}
                        className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-300"
                        title="Mark session as completed"
                      >
                        Conclude
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500">
                        Completed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
