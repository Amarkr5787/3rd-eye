import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  FlipHorizontal,
  Sliders,
  Sparkles,
  Layers,
  Activity,
  Smile,
  Hand,
  Volume2,
  VolumeX,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { VisionDetector } from '../services/visionDetector';
import { MotionRecord, GeminiAnalysisResult } from '../types';
import { api } from '../services/apiClient';

interface LiveMonitorProps {
  isRecording: boolean;
  activeSessionId: string;
  onNewRecord: (record: MotionRecord) => void;
  recentLogs: MotionRecord[];
}

export const LiveMonitor: React.FC<LiveMonitorProps> = ({
  isRecording,
  activeSessionId,
  onNewRecord,
  recentLogs
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const detectorRef = useRef<VisionDetector | null>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [audioFeedback, setAudioFeedback] = useState<boolean>(false);
  const [motionSensitivity, setMotionSensitivity] = useState<number>(20);

  // HUD and Overlay settings
  const [showHUD, setShowHUD] = useState<boolean>(true);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [showFaceMesh, setShowFaceMesh] = useState<boolean>(true);

  // Live telemetry state for UI indicators
  const [liveMetrics, setLiveMetrics] = useState({
    fps: 0,
    motionIntensity: 0,
    lastAction: 'Observing...',
    lastConfidence: 0.9,
    category: 'system' as string,
    valence: 'neutral' as 'positive' | 'neutral' | 'negative' | 'alert',
    engineMode: 'Initializing...',
  });

  // Gemini deep snapshot analysis state
  const [isAnalyzingGemini, setIsAnalyzingGemini] = useState<boolean>(false);
  const [geminiResult, setGeminiResult] = useState<GeminiAnalysisResult | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  // Audio beep generator for action feedback
  const playBeep = useCallback((freq = 880, duration = 0.08) => {
    if (!audioFeedback || typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {
      // Audio context might be restricted before user gesture
    }
  }, [audioFeedback]);

  // Start webcam
  const startCamera = async () => {
    try {
      setStreamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasCameraPermission(true);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setStreamError(err.message || 'Camera permission denied or camera device in use');
      setHasCameraPermission(false);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Initialize detector loop
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const handleActionDetected = async (action: {
      category: any;
      actionName: string;
      confidence: number;
      metadata?: any;
    }) => {
      setLiveMetrics(prev => ({
        ...prev,
        lastAction: action.actionName,
        lastConfidence: action.confidence,
        category: action.category,
        valence: action.metadata?.valence || 'neutral'
      }));

      playBeep(action.category === 'hand_sign' ? 1046 : action.category === 'facial_expression' ? 784 : 523);

      // Only push to persistent secure database if recording is active
      if (isRecording) {
        try {
          const logged = await api.logAction({
            sessionId: activeSessionId,
            category: action.category,
            actionName: action.actionName,
            confidence: action.confidence,
            metadata: action.metadata,
          });
          onNewRecord(logged);
        } catch (err) {
          console.error('Failed to log action to database:', err);
        }
      }
    };

    const detector = new VisionDetector(handleActionDetected);
    detectorRef.current = detector;
    detector.motionThreshold = motionSensitivity;

    const onPlay = () => {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      detector.start(video, canvas);
    };

    video.addEventListener('loadedmetadata', onPlay);
    if (video.readyState >= 2) {
      onPlay();
    }

    // Interval to poll FPS and engine status
    const interval = setInterval(() => {
      if (detectorRef.current) {
        const tel = detectorRef.current.getTelemetry();
        setLiveMetrics(prev => ({
          ...prev,
          fps: tel.fps,
          engineMode: tel.isEngineReady ? 'MediaPipe Tasks (GPU)' : 'Adaptive Heuristic CV'
        }));
      }
    }, 500);

    return () => {
      clearInterval(interval);
      video.removeEventListener('loadedmetadata', onPlay);
      detector.stop();
    };
  }, [isRecording, activeSessionId, onNewRecord, playBeep, motionSensitivity]);

  // Trigger Gemini AI snapshot analysis
  const handleSnapshotAnalysis = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsAnalyzingGemini(true);
    setGeminiError(null);

    try {
      // Capture current video frame to base64
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = videoRef.current.videoWidth || 640;
      snapCanvas.height = videoRef.current.videoHeight || 480;
      const snapCtx = snapCanvas.getContext('2d');
      if (snapCtx) {
        snapCtx.drawImage(videoRef.current, 0, 0, snapCanvas.width, snapCanvas.height);
      }
      const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.85);

      const result = await api.requestGeminiAnalysis({
        currentSnapshot: dataUrl,
        query: 'Analyze this camera frame for hand gestures, facial expressions, micro-signals, posture stability, and overall behavioral valence.'
      });

      setGeminiResult(result.analysis);
    } catch (err: any) {
      console.error('Gemini snapshot analysis error:', err);
      setGeminiError(err.message || 'Failed to analyze snapshot with Gemini AI');
    } finally {
      setIsAnalyzingGemini(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-slate-950">
      {/* Primary Video & HUD Stage */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">
        {/* Workspace Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-slate-100">
              Live Biometric Feed
            </h1>
            <span className="text-xs text-slate-400 font-mono">
              ENGINE: {liveMetrics.engineMode}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsMirrored(!isMirrored)}
              className={`p-1.5 rounded-md text-xs border transition-colors ${
                isMirrored
                  ? 'bg-slate-800 text-cyan-300 border-slate-700'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Mirror video"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            <button
              onClick={() => setAudioFeedback(!audioFeedback)}
              className={`p-1.5 rounded-md text-xs border transition-colors ${
                audioFeedback
                  ? 'bg-slate-800 text-cyan-300 border-slate-700'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Audio feedback on event log"
            >
              {audioFeedback ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowHUD(!showHUD)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                showHUD
                  ? 'bg-slate-800 text-cyan-300 border-slate-700'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              HUD Overlay
            </button>

            <button
              onClick={handleSnapshotAnalysis}
              disabled={isAnalyzingGemini}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-md shadow-sm transition-all disabled:opacity-50"
            >
              {isAnalyzingGemini ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Analyze Frame with AI
            </button>
          </div>
        </div>

        {/* Video Viewport Container */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[380px] lg:min-h-[480px] bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center shadow-xl"
        >
          {hasCameraPermission === false && (
            <div className="text-center p-8 max-w-md">
              <CameraOff className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-base font-semibold text-slate-200 mb-2">
                Camera Access Required
              </h3>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                {streamError || 'Please allow camera access in your browser to enable live hand sign and facial expression detection.'}
              </p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-md transition-colors"
              >
                Retry Camera Connection
              </button>
            </div>
          )}

          {hasCameraPermission === null && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <span className="text-xs font-mono">Initializing camera sensor...</span>
            </div>
          )}

          {/* Hidden or active Video Stream */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${
              isMirrored ? '-scale-x-100' : ''
            } ${hasCameraPermission ? 'block' : 'hidden'}`}
          />

          {/* HUD Overlay Canvas */}
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${
              isMirrored ? '-scale-x-100' : ''
            } ${showHUD && hasCameraPermission ? 'block' : 'hidden'}`}
          />

          {/* Floating On-Screen Telemetry Strip */}
          {hasCameraPermission && (
            <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
              <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
                <span className="text-slate-400">FPS:</span>
                <span className="text-cyan-400 font-semibold tabular-nums">
                  {liveMetrics.fps}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">DB STATUS:</span>
                <span className={isRecording ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                  {isRecording ? 'LOGGING ACTIVE' : 'STANDBY'}
                </span>
              </div>

              {/* Dynamic Target Recognition Badge */}
              <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
                {liveMetrics.category === 'hand_sign' ? (
                  <Hand className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                ) : liveMetrics.category === 'facial_expression' ? (
                  <Smile className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="text-slate-100 font-medium">
                  {liveMetrics.lastAction}
                </span>
                <span className="text-slate-400 text-[11px] tabular-nums">
                  ({Math.round(liveMetrics.lastConfidence * 100)}%)
                </span>
              </div>
            </div>
          )}

          {/* Motion Burst Bar on bottom edge */}
          {hasCameraPermission && (
            <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
              <div className="bg-slate-950/80 backdrop-blur-md p-3 rounded-lg border border-slate-800/80 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-slate-300">ACTIVE MOTION TRACKER</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-slate-400">SENSITIVITY: {motionSensitivity}%</span>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    value={motionSensitivity}
                    onChange={(e) => setMotionSensitivity(Number(e.target.value))}
                    className="w-24 accent-cyan-500 pointer-events-auto"
                    title="Adjust motion trigger threshold"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Gemini AI Snapshot Deep Analysis Modal / Result Drawer */}
        {geminiResult && (
          <div className="mt-4 p-4 bg-slate-900 rounded-xl border border-cyan-800/60 shadow-lg">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h4 className="text-sm font-semibold text-slate-100">
                  Gemini 3.8 Flash Biometric Analysis
                </h4>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-mono">
                  FOCUS INDEX: <span className="text-cyan-300 font-bold tabular-nums">{geminiResult.focusIndex}/100</span>
                </span>
                <button
                  onClick={() => setGeminiResult(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded bg-slate-800"
                >
                  Dismiss
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              {geminiResult.executiveSummary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-[11px] font-mono text-slate-400 block mb-1.5 uppercase">
                  Dominant Expressions
                </span>
                <div className="space-y-1">
                  {geminiResult.dominantEmotions?.map((e, idx) => (
                    <div key={idx} className="flex justify-between text-slate-300">
                      <span>{e.emotion}</span>
                      <span className="text-slate-400 font-mono">{e.frequency}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-[11px] font-mono text-slate-400 block mb-1.5 uppercase">
                  Posture & Ergonomic Insights
                </span>
                <ul className="list-disc list-inside text-slate-300 space-y-1">
                  {geminiResult.recommendations?.slice(0, 2).map((rec, idx) => (
                    <li key={idx} className="text-slate-300">{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {geminiError && (
          <div className="mt-3 p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{geminiError}</span>
          </div>
        )}
      </div>

      {/* Lateral Live Action Stream & Event Feed */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900/40 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Live Action Stream
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            {recentLogs.length} logged
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {recentLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No actions logged in this session yet.</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Make hand signs or facial expressions in front of the camera.
              </p>
            </div>
          ) : (
            recentLogs.slice(0, 30).map((log) => {
              const date = new Date(log.epochMs);
              const timeStr = date.toTimeString().split(' ')[0] + '.' + String(date.getMilliseconds()).padStart(3, '0');

              return (
                <div
                  key={log.id}
                  className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {timeStr}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400 tabular-nums">
                      {(log.confidence * 100).toFixed(0)}% conf
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-1">
                    {log.category === 'hand_sign' ? (
                      <Hand className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    ) : log.category === 'facial_expression' ? (
                      <Smile className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-100">
                      {log.actionName}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
                    <span className="truncate max-w-[140px]">
                      hash:{log.hash.slice(0, 10)}...
                    </span>
                    <span className="text-emerald-500/80 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Chained
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
