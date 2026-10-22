export type ActionCategory = 'hand_sign' | 'facial_expression' | 'motion_burst' | 'system';

export interface MotionRecord {
  id: string;
  sessionId: string;
  timestamp: string; // ISO 8601
  epochMs: number;
  category: ActionCategory;
  actionName: string;
  confidence: number;
  metadata?: {
    landmarksCount?: number;
    intensity?: number;
    valence?: 'positive' | 'neutral' | 'negative' | 'alert';
    durationMs?: number;
    notes?: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    rawValues?: Record<string, number>;
  };
  prevHash: string;
  hash: string;
  signature: string;
}

export interface RecordingSession {
  id: string;
  name: string;
  operator: string;
  startTime: string;
  endTime?: string;
  status: 'active' | 'completed';
  recordCount: number;
}

export interface LiveTelemetry {
  fps: number;
  motionIntensity: number; // 0 to 100
  activeBoundingBox: { x: number; y: number; width: number; height: number } | null;
  currentGesture: {
    name: string;
    confidence: number;
    handedness?: 'Left' | 'Right';
  } | null;
  currentExpression: {
    name: string;
    confidence: number;
    valence: 'positive' | 'neutral' | 'negative' | 'alert';
  } | null;
  faceDetected: boolean;
  handsDetectedCount: number;
  isEngineReady: boolean;
  engineMode: 'mediapipe' | 'heuristic_cv';
}

export interface AuditReport {
  intact: boolean;
  chainLength: number;
  brokenIndex: number | null;
  tampered: boolean;
  lastHash: string | null;
  algorithm: string;
  verifiedAt: string;
}

export interface AnalyticsSummary {
  totalRecords: number;
  averageConfidence: number;
  categoryCounts: Record<string, number>;
  topGestures: Array<{ name: string; count: number }>;
  topExpressions: Array<{ name: string; count: number }>;
  valenceCounts: {
    positive: number;
    neutral: number;
    negative: number;
    alert: number;
  };
  timeBuckets: Array<{ time: string; count: number }>;
}

export interface GeminiAnalysisResult {
  executiveSummary: string;
  dominantEmotions: Array<{ emotion: string; frequency: string; insight: string }>;
  keyGesturesObserved: Array<{ gesture: string; significance: string }>;
  anomaliesDetected: Array<{ timestamp: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  recommendations: string[];
  focusIndex: number;
}
