import React from 'react';
import { ShieldCheck, Video, Database, BarChart3, Lock, Play, Square } from 'lucide-react';
import { RecordingSession } from '../types';

interface TopBarProps {
  activeTab: 'monitor' | 'ledger' | 'analytics' | 'audit';
  setActiveTab: (tab: 'monitor' | 'ledger' | 'analytics' | 'audit') => void;
  currentSession: RecordingSession | null;
  onToggleRecording: () => void;
  isRecording: boolean;
  totalRecordsCount: number;
  openSessionModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  currentSession,
  onToggleRecording,
  isRecording,
  totalRecordsCount,
  openSessionModal,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-900 border-b border-slate-800 text-slate-100 shrink-0">
      {/* Zone 1: Wordmark & System Identity */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap block">
            KINESIX
          </span>
          <span className="text-[11px] text-slate-400 font-mono tracking-wider block">
            BIOMETRIC MOTION LEDGER
          </span>
        </div>
      </div>

      {/* Zone 2: Primary Navigation Tabs (Single-line controls) */}
      <nav className="hidden md:flex items-center gap-1 p-1 bg-slate-950/60 rounded-lg border border-slate-800/80">
        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'monitor'
              ? 'bg-slate-800 text-cyan-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          Live Monitor
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'ledger'
              ? 'bg-slate-800 text-cyan-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Security Ledger
          <span className="text-[10px] text-slate-400 font-mono tabular-nums">
            ({totalRecordsCount})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'analytics'
              ? 'bg-slate-800 text-cyan-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Trends & Analytics
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'audit'
              ? 'bg-slate-800 text-cyan-300 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          Integrity Audit
        </button>
      </nav>

      {/* Zone 3: Operator Status & Primary Action Button */}
      <div className="flex items-center gap-4 shrink-0">
        <button
          onClick={openSessionModal}
          className="text-left hidden lg:block cursor-pointer hover:opacity-85 transition-opacity"
          title="Click to manage recording sessions"
        >
          <div className="text-xs font-medium text-slate-200 truncate max-w-[140px]">
            {currentSession ? currentSession.name : 'Default Session'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {isRecording ? 'STATUS: CAPTURING' : 'STATUS: STANDBY'}
          </div>
        </button>

        <div className="flex items-center gap-2.5">
          <img
            src="/src/assets/images/operator_avatar_1792666466540.jpg"
            alt="Lead Biometric Operator"
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full border border-slate-700 object-cover shadow-inner"
          />

          <button
            onClick={onToggleRecording}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              isRecording
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                Pause Ingestion
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Capture Actions
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
