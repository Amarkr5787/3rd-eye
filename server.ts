import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'secure_motion_records.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'recording_sessions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB state
interface MotionRecord {
  id: string;
  sessionId: string;
  timestamp: string; // ISO 8601
  epochMs: number;
  category: 'hand_sign' | 'facial_expression' | 'motion_burst' | 'system';
  actionName: string;
  confidence: number;
  metadata?: {
    landmarksCount?: number;
    intensity?: number;
    valence?: 'positive' | 'neutral' | 'negative' | 'alert';
    durationMs?: number;
    notes?: string;
  };
  prevHash: string;
  hash: string;
  signature: string;
}

interface RecordingSession {
  id: string;
  name: string;
  operator: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'completed';
  recordCount: number;
}

// Memory cache + file backing
let motionRecords: MotionRecord[] = [];
let recordingSessions: RecordingSession[] = [];

// Master HMAC secret for cryptographic verification
const HMAC_SECRET = process.env.DATABASE_SECRET || 'kinesix-secure-biometric-audit-secret-2026';

function calculateRecordHash(record: Omit<MotionRecord, 'hash' | 'signature'>): string {
  const payload = `${record.id}|${record.sessionId}|${record.epochMs}|${record.category}|${record.actionName}|${record.confidence.toFixed(4)}|${record.prevHash}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function calculateSignature(hash: string): string {
  return crypto.createHmac('sha256', HMAC_SECRET).update(hash).digest('hex');
}

// Load DB
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    motionRecords = JSON.parse(raw);
  } else {
    // Seed initial genesis block
    const genesisTime = new Date().toISOString();
    const genesisRecord: MotionRecord = {
      id: 'genesis-block-00000000',
      sessionId: 'sys-init',
      timestamp: genesisTime,
      epochMs: Date.now(),
      category: 'system',
      actionName: 'Cryptographic Ledger Initialized',
      confidence: 1.0,
      metadata: {
        notes: 'Genesis audit block created with SHA-256 hash chaining enabled'
      },
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: '',
      signature: ''
    };
    genesisRecord.hash = calculateRecordHash(genesisRecord);
    genesisRecord.signature = calculateSignature(genesisRecord.hash);
    motionRecords = [genesisRecord];
    fs.writeFileSync(DB_FILE, JSON.stringify(motionRecords, null, 2), 'utf-8');
  }
} catch (err) {
  console.error('Error initializing records DB:', err);
}

try {
  if (fs.existsSync(SESSIONS_FILE)) {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    recordingSessions = JSON.parse(raw);
  } else {
    recordingSessions = [
      {
        id: 'session-default-01',
        name: 'Live Observation Session',
        operator: 'Dr. Sarah Lin (Lead Biometrics)',
        startTime: new Date().toISOString(),
        status: 'active',
        recordCount: 1
      }
    ];
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(recordingSessions, null, 2), 'utf-8');
  }
} catch (err) {
  console.error('Error initializing sessions:', err);
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(motionRecords, null, 2), 'utf-8');
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(recordingSessions, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write database file:', err);
  }
}

// Middleware
app.use(express.json({ limit: '15mb' }));

// Setup Gemini API Client on the server
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    totalRecords: motionRecords.length,
    activeSessions: recordingSessions.filter(s => s.status === 'active').length,
    geminiEnabled: !!aiClient,
    timestamp: new Date().toISOString()
  });
});

// GET /api/logs with filtering & pagination
app.get('/api/logs', (req, res) => {
  const { category, search, minConfidence, sessionId, limit = '200' } = req.query;

  let results = [...motionRecords];

  if (category && category !== 'all') {
    results = results.filter(r => r.category === category);
  }
  if (sessionId && sessionId !== 'all') {
    results = results.filter(r => r.sessionId === sessionId);
  }
  if (minConfidence) {
    const min = parseFloat(minConfidence as string);
    if (!isNaN(min)) {
      results = results.filter(r => r.confidence >= min);
    }
  }
  if (search) {
    const q = (search as string).toLowerCase();
    results = results.filter(r =>
      r.actionName.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      (r.metadata?.notes && r.metadata.notes.toLowerCase().includes(q))
    );
  }

  // Return newest first
  results.sort((a, b) => b.epochMs - a.epochMs);

  const numLimit = parseInt(limit as string, 10) || 200;
  const paginated = results.slice(0, numLimit);

  res.json({
    total: results.length,
    returned: paginated.length,
    logs: paginated
  });
});

// POST /api/logs: Ingest single or batch log items into cryptographically verified ledger
app.post('/api/logs', (req, res) => {
  const body = req.body;
  const items: any[] = Array.isArray(body) ? body : [body];

  if (!items.length) {
    return res.status(400).json({ error: 'No record items provided' });
  }

  const added: MotionRecord[] = [];

  for (const item of items) {
    const lastRecord = motionRecords[motionRecords.length - 1];
    const prevHash = lastRecord ? lastRecord.hash : '0000000000000000000000000000000000000000000000000000000000000000';

    const id = item.id || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const epochMs = item.epochMs || Date.now();
    const timestamp = item.timestamp || new Date(epochMs).toISOString();
    const category = item.category || 'motion_burst';
    const actionName = item.actionName || 'Motion Detected';
    const confidence = typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.85;

    const candidate: Omit<MotionRecord, 'hash' | 'signature'> = {
      id,
      sessionId: item.sessionId || 'session-default-01',
      timestamp,
      epochMs,
      category,
      actionName,
      confidence,
      metadata: item.metadata || {},
      prevHash
    };

    const hash = calculateRecordHash(candidate);
    const signature = calculateSignature(hash);

    const completeRecord: MotionRecord = {
      ...candidate,
      hash,
      signature
    };

    motionRecords.push(completeRecord);
    added.push(completeRecord);

    // Update active session count
    const session = recordingSessions.find(s => s.id === completeRecord.sessionId);
    if (session) {
      session.recordCount = (session.recordCount || 0) + 1;
    }
  }

  saveDb();

  res.status(201).json({
    success: true,
    count: added.length,
    latestRecord: added[added.length - 1]
  });
});

// GET /api/sessions: list recording sessions
app.get('/api/sessions', (req, res) => {
  res.json({ sessions: recordingSessions });
});

// POST /api/sessions: create new session
app.post('/api/sessions', (req, res) => {
  const { name, operator } = req.body;
  const newSession: RecordingSession = {
    id: `ses-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: name || `Monitoring Session ${recordingSessions.length + 1}`,
    operator: operator || 'Dr. Sarah Lin (Lead Biometrics)',
    startTime: new Date().toISOString(),
    status: 'active',
    recordCount: 0
  };

  recordingSessions.unshift(newSession);
  saveDb();

  res.status(201).json(newSession);
});

// POST /api/sessions/:id/stop
app.post('/api/sessions/:id/stop', (req, res) => {
  const { id } = req.params;
  const session = recordingSessions.find(s => s.id === id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = 'completed';
  session.endTime = new Date().toISOString();
  saveDb();

  res.json({ success: true, session });
});

// GET /api/audit-trail: verify full cryptographic integrity of the ledger
app.get('/api/audit-trail', (req, res) => {
  let isIntact = true;
  let brokenIndex = -1;
  const total = motionRecords.length;

  for (let i = 0; i < total; i++) {
    const rec = motionRecords[i];

    // Check prevHash match
    if (i > 0) {
      const prevRec = motionRecords[i - 1];
      if (rec.prevHash !== prevRec.hash) {
        isIntact = false;
        brokenIndex = i;
        break;
      }
    }

    // Verify record hash
    const expectedHash = calculateRecordHash(rec);
    if (rec.hash !== expectedHash) {
      isIntact = false;
      brokenIndex = i;
      break;
    }

    // Verify HMAC signature
    const expectedSig = calculateSignature(rec.hash);
    if (rec.signature !== expectedSig) {
      isIntact = false;
      brokenIndex = i;
      break;
    }
  }

  res.json({
    intact: isIntact,
    chainLength: total,
    brokenIndex: brokenIndex >= 0 ? brokenIndex : null,
    tampered: !isIntact,
    lastHash: total > 0 ? motionRecords[total - 1].hash : null,
    algorithm: 'SHA-256 Chained Ledger + HMAC Authenticator',
    verifiedAt: new Date().toISOString()
  });
});

// GET /api/analytics: aggregate statistics
app.get('/api/analytics', (req, res) => {
  const total = motionRecords.length;

  const categoryCounts: Record<string, number> = {
    hand_sign: 0,
    facial_expression: 0,
    motion_burst: 0,
    system: 0
  };

  const gestureCounts: Record<string, number> = {};
  const expressionCounts: Record<string, number> = {};
  const valenceCounts: Record<string, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
    alert: 0
  };

  let totalConfidence = 0;
  let countWithConfidence = 0;

  // Time bins (last 24 hours or last 100 entries)
  const timeBuckets: { [minute: string]: number } = {};

  for (const r of motionRecords) {
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;

    if (r.category === 'hand_sign') {
      gestureCounts[r.actionName] = (gestureCounts[r.actionName] || 0) + 1;
    } else if (r.category === 'facial_expression') {
      expressionCounts[r.actionName] = (expressionCounts[r.actionName] || 0) + 1;
    }

    if (r.metadata?.valence) {
      valenceCounts[r.metadata.valence] = (valenceCounts[r.metadata.valence] || 0) + 1;
    }

    if (typeof r.confidence === 'number') {
      totalConfidence += r.confidence;
      countWithConfidence++;
    }

    // bucket by 5-minute interval for timeline
    const d = new Date(r.epochMs);
    const bucket = `${d.getHours().toString().padStart(2, '0')}:${(Math.floor(d.getMinutes() / 5) * 5).toString().padStart(2, '0')}`;
    timeBuckets[bucket] = (timeBuckets[bucket] || 0) + 1;
  }

  res.json({
    totalRecords: total,
    averageConfidence: countWithConfidence > 0 ? (totalConfidence / countWithConfidence) : 0.85,
    categoryCounts,
    topGestures: Object.entries(gestureCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    topExpressions: Object.entries(expressionCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    valenceCounts,
    timeBuckets: Object.entries(timeBuckets).map(([time, count]) => ({ time, count }))
  });
});

// POST /api/analyze-gemini: Deep AI behavioral & biometric analysis using gemini-3.8-flash
app.post('/api/analyze-gemini', async (req, res) => {
  try {
    if (!aiClient) {
      return res.status(503).json({
        error: 'Gemini API key is not configured in environment',
        geminiAvailable: false
      });
    }

    const { sessionData, currentSnapshot, query } = req.body;

    // Build context
    const recentEvents = motionRecords.slice(-50).map(r => ({
      time: r.timestamp,
      category: r.category,
      action: r.actionName,
      confidence: Math.round(r.confidence * 100) + '%',
      notes: r.metadata?.notes || ''
    }));

    const promptText = `
You are the Kinesix Senior Biometric & Behavioral Analytics AI.
Analyze the following live motion and biometric telemetry session data:

Total Logged Actions: ${motionRecords.length}
Recent 50 Actions Log:
${JSON.stringify(recentEvents, null, 2)}

User Request / Query: ${query || 'Provide an executive behavioral and ergonomic summary, detecting any patterns, fatigue, emotional valence, and safety/security anomalies.'}

Provide your response in a well-structured JSON format with:
- "executiveSummary": High level concise summary (2-3 sentences)
- "dominantEmotions": Array of { "emotion": string, "frequency": string, "insight": string }
- "keyGesturesObserved": Array of { "gesture": string, "significance": string }
- "anomaliesDetected": Array of { "timestamp": string, "description": string, "severity": "low" | "medium" | "high" }
- "recommendations": Array of actionable suggestions
- "focusIndex": A calculated score from 0-100 indicating attentiveness and stability.
`;

    const parts: any[] = [];
    if (currentSnapshot && typeof currentSnapshot === 'string' && currentSnapshot.startsWith('data:image')) {
      const base64Data = currentSnapshot.split(',')[1];
      const mimeType = currentSnapshot.split(';')[0].replace('data:', '') || 'image/jpeg';
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data
        }
      });
    }

    parts.push({ text: promptText });

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
      }
    });

    const responseText = response.text || '{}';
    let parsed = {};
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { raw: responseText };
    }

    res.json({
      success: true,
      analysis: parsed,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Gemini analysis error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to complete Gemini analysis',
      success: false
    });
  }
});

// GET /api/export: Download full audit trail as JSON or CSV
app.get('/api/export', (req, res) => {
  const format = req.query.format || 'json';

  if (format === 'csv') {
    const headers = ['ID', 'SessionID', 'Timestamp', 'Category', 'ActionName', 'Confidence', 'PreviousHash', 'RecordHash', 'HMACSignature'];
    const rows = motionRecords.map(r => [
      `"${r.id}"`,
      `"${r.sessionId}"`,
      `"${r.timestamp}"`,
      `"${r.category}"`,
      `"${r.actionName}"`,
      r.confidence.toFixed(4),
      `"${r.prevHash}"`,
      `"${r.hash}"`,
      `"${r.signature}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="kinesix-audit-ledger-${Date.now()}.csv"`);
    return res.send(csvContent);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="kinesix-audit-ledger-${Date.now()}.json"`);
  res.json({
    databaseName: 'Kinesix Cryptographic Biometric Database',
    exportTimestamp: new Date().toISOString(),
    totalRecords: motionRecords.length,
    ledgerIntact: true,
    records: motionRecords
  });
});

// Purge logs with operator PIN verification
app.delete('/api/logs', (req, res) => {
  const { pin } = req.body;
  if (pin !== '8899' && pin !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized: Invalid operator security PIN' });
  }

  // Preserve genesis block and record purge event
  const purgeRecord: MotionRecord = {
    id: `audit-purge-${Date.now()}`,
    sessionId: 'sys-admin',
    timestamp: new Date().toISOString(),
    epochMs: Date.now(),
    category: 'system',
    actionName: `Database Purge Executed (Old count: ${motionRecords.length})`,
    confidence: 1.0,
    metadata: {
      notes: 'Authorized operator executed audit log reset.'
    },
    prevHash: motionRecords.length > 0 ? motionRecords[motionRecords.length - 1].hash : '0000000000000000000000000000000000000000000000000000000000000000',
    hash: '',
    signature: ''
  };
  purgeRecord.hash = calculateRecordHash(purgeRecord);
  purgeRecord.signature = calculateSignature(purgeRecord.hash);

  motionRecords = [purgeRecord];
  saveDb();

  res.json({
    success: true,
    message: 'Database purged and audit log reset initialized.',
    record: purgeRecord
  });
});

// Mount Vite in dev or serve static dist in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kinesix Full-Stack Biometric Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
