/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { LiveMonitor } from './components/LiveMonitor';
import { LedgerTable } from './components/LedgerTable';
import { AnalyticsView } from './components/AnalyticsView';
import { IntegrityAuditView } from './components/IntegrityAuditView';
import { SessionManagerModal } from './components/SessionManagerModal';
import { MotionRecord, RecordingSession } from './types';
import { api } from './services/apiClient';

export default function App() {
  const [activeTab, setActiveTab] = useState<'monitor' | 'ledger' | 'analytics' | 'audit'>('monitor');
  const [logs, setLogs] = useState<MotionRecord[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [currentSession, setCurrentSession] = useState<RecordingSession | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(true);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState<boolean>(false);

  // Load initial logs and sessions
  const loadData = useCallback(async () => {
    try {
      const [logsRes, sessionsRes] = await Promise.all([
        api.getLogs({ limit: 300 }),
        api.getSessions()
      ]);
      setLogs(logsRes.logs);
      setSessions(sessionsRes.sessions);
      if (sessionsRes.sessions.length > 0 && !currentSession) {
        const activeOne = sessionsRes.sessions.find(s => s.status === 'active') || sessionsRes.sessions[0];
        setCurrentSession(activeOne);
      }
    } catch (err) {
      console.warn('Initial data load warning:', err);
    }
  }, [currentSession]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle incoming action log from live detector
  const handleNewRecord = useCallback((newRecord: MotionRecord) => {
    setLogs(prev => {
      // Check for duplicate ID
      if (prev.some(r => r.id === newRecord.id)) return prev;
      return [newRecord, ...prev];
    });

    if (currentSession) {
      setCurrentSession(prev => prev ? { ...prev, recordCount: (prev.recordCount || 0) + 1 } : null);
    }
  }, [currentSession]);

  // Keyboard shortcuts for operator ergonomics
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsRecording(prev => !prev);
      } else if (e.key === '1') {
        setActiveTab('monitor');
      } else if (e.key === '2') {
        setActiveTab('ledger');
      } else if (e.key === '3') {
        setActiveTab('analytics');
      } else if (e.key === '4') {
        setActiveTab('audit');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Universal Top Bar */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentSession={currentSession}
        onToggleRecording={() => setIsRecording(prev => !prev)}
        isRecording={isRecording}
        totalRecordsCount={logs.length}
        openSessionModal={() => setIsSessionModalOpen(true)}
      />

      {/* Main View Router */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'monitor' && (
          <LiveMonitor
            isRecording={isRecording}
            activeSessionId={currentSession?.id || 'session-default-01'}
            onNewRecord={handleNewRecord}
            recentLogs={logs}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerTable
            logs={logs}
            onRefresh={loadData}
            activeSessionId={currentSession?.id || 'session-default-01'}
          />
        )}

        {activeTab === 'analytics' && <AnalyticsView />}

        {activeTab === 'audit' && <IntegrityAuditView logs={logs} />}
      </main>

      {/* Session Manager Modal */}
      <SessionManagerModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        sessions={sessions}
        currentSession={currentSession}
        onSelectSession={setCurrentSession}
        onRefreshSessions={loadData}
      />
    </div>
  );
}
