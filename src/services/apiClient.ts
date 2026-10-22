import { MotionRecord, RecordingSession, AuditReport, AnalyticsSummary, GeminiAnalysisResult } from '../types';

const DB_NAME = 'kinesix_biometrics_idb';
const DB_VERSION = 1;
const STORE_NAME = 'offline_logs';

// IndexedDB Helper
function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalRecord(record: MotionRecord): Promise<void> {
  try {
    const db = await openIndexedDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
  } catch (err) {
    console.warn('IDB write failed:', err);
  }
}

export const api = {
  async getHealth() {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('Failed to fetch health');
    return res.json();
  },

  async getLogs(params?: {
    category?: string;
    search?: string;
    minConfidence?: number;
    sessionId?: string;
    limit?: number;
  }): Promise<{ total: number; returned: number; logs: MotionRecord[] }> {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    if (params?.minConfidence) query.set('minConfidence', params.minConfidence.toString());
    if (params?.sessionId) query.set('sessionId', params.sessionId);
    if (params?.limit) query.set('limit', params.limit.toString());

    const res = await fetch(`/api/logs?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch logs');
    return res.json();
  },

  async logAction(item: Partial<MotionRecord>): Promise<MotionRecord> {
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Failed to log action to secure database');
    const data = await res.json();
    if (data.latestRecord) {
      saveLocalRecord(data.latestRecord);
    }
    return data.latestRecord;
  },

  async logBatchActions(items: Partial<MotionRecord>[]): Promise<MotionRecord[]> {
    if (!items.length) return [];
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error('Failed to log batch actions');
    const data = await res.json();
    return data;
  },

  async getSessions(): Promise<{ sessions: RecordingSession[] }> {
    const res = await fetch('/api/sessions');
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  },

  async createSession(name: string, operator: string): Promise<RecordingSession> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, operator }),
    });
    if (!res.ok) throw new Error('Failed to create session');
    return res.json();
  },

  async stopSession(id: string): Promise<{ success: boolean; session: RecordingSession }> {
    const res = await fetch(`/api/sessions/${id}/stop`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to stop session');
    return res.json();
  },

  async getAuditReport(): Promise<AuditReport> {
    const res = await fetch('/api/audit-trail');
    if (!res.ok) throw new Error('Failed to verify audit trail');
    return res.json();
  },

  async getAnalytics(): Promise<AnalyticsSummary> {
    const res = await fetch('/api/analytics');
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  },

  async requestGeminiAnalysis(payload: {
    currentSnapshot?: string;
    query?: string;
  }): Promise<{ success: boolean; analysis: GeminiAnalysisResult; generatedAt: string }> {
    const res = await fetch('/api/analyze-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to analyze with Gemini AI');
    }
    return res.json();
  },

  async purgeLogs(pin: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/logs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Purge unauthorized');
    }
    return res.json();
  },

  getExportUrl(format: 'json' | 'csv'): string {
    return `/api/export?format=${format}`;
  }
};
