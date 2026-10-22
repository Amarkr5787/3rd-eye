import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Smile,
  Hand,
  Activity,
  Sparkles,
  ShieldAlert,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { AnalyticsSummary, GeminiAnalysisResult } from '../types';
import { api } from '../services/apiClient';

export const AnalyticsView: React.FC = () => {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [geminiAnalysis, setGeminiAnalysis] = useState<GeminiAnalysisResult | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const data = await api.getAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleRunAiAudit = async () => {
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const res = await api.requestGeminiAnalysis({
        query: 'Conduct an in-depth behavioral biometric analysis across all recorded sessions. Provide executive summary, fatigue metrics, emotional valence distribution, and ergonomic recommendations.'
      });
      setGeminiAnalysis(res.analysis);
    } catch (err: any) {
      setAiError(err.message || 'Gemini analysis failed');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  if (loading && !analytics) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mb-2" />
      </div>
    );
  }

  const total = analytics?.totalRecords || 0;
  const topGesture = analytics?.topGestures?.[0]?.name || 'None Recorded';
  const topExpression = analytics?.topExpressions?.[0]?.name || 'Neutral / Focused';
  const avgConf = analytics?.averageConfidence ? Math.round(analytics.averageConfidence * 100) : 88;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-950 text-slate-100">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-lg font-bold text-slate-100 tracking-tight">
            Behavioral Biometrics & Trends
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
            <span>TIME-SERIES AGGREGATIONS</span>
            <span aria-hidden="true">·</span>
            <span>GESTURE & EMOTION FREQUENCY</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Data
          </button>

          <button
            onClick={handleRunAiAudit}
            disabled={isGeneratingAi}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg shadow-sm transition-all disabled:opacity-50"
          >
            {isGeneratingAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate AI Executive Audit
          </button>
        </div>
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">TOTAL ACTIONS</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {total}
          </div>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">
            Chained in secure ledger
          </span>
        </div>

        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">MEAN CONFIDENCE</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
            {avgConf}%
          </div>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">
            Across vision models
          </span>
        </div>

        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">TOP GESTURE</span>
            <Hand className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-base font-bold text-slate-200 truncate">
            {topGesture}
          </div>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">
            {analytics?.topGestures?.[0]?.count || 0} occurrences
          </span>
        </div>

        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">TOP EXPRESSION</span>
            <Smile className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-base font-bold text-slate-200 truncate">
            {topExpression}
          </div>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">
            {analytics?.topExpressions?.[0]?.count || 0} occurrences
          </span>
        </div>
      </div>

      {/* Gemini AI Executive Audit Section */}
      {geminiAnalysis && (
        <div className="mb-6 p-5 bg-slate-900 rounded-xl border border-cyan-800/80 shadow-lg">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100">
                Gemini 3.8 Flash Executive Biometric Audit
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-cyan-300">
                STABILITY SCORE: <span className="font-bold tabular-nums">{geminiAnalysis.focusIndex}/100</span>
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            {geminiAnalysis.executiveSummary}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            {/* Dominant Emotions */}
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px] uppercase block mb-2">
                Emotion & Valence States
              </span>
              <div className="space-y-1.5 font-sans">
                {geminiAnalysis.dominantEmotions?.map((e, idx) => (
                  <div key={idx} className="flex justify-between text-slate-300 text-xs">
                    <span>{e.emotion}</span>
                    <span className="text-cyan-400 font-mono">{e.frequency}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Anomalies Detected */}
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px] uppercase block mb-2">
                Kinetic Anomalies
              </span>
              <div className="space-y-1.5 font-sans">
                {geminiAnalysis.anomaliesDetected?.length ? (
                  geminiAnalysis.anomaliesDetected.map((anom, idx) => (
                    <div key={idx} className="text-slate-300 text-xs">
                      <span className="text-amber-400 font-mono uppercase text-[10px]">
                        [{anom.severity}]
                      </span>{' '}
                      {anom.description}
                    </div>
                  ))
                ) : (
                  <span className="text-slate-500">No anomalies detected.</span>
                )}
              </div>
            </div>

            {/* Recommendations */}
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px] uppercase block mb-2">
                Ergonomic & Posture Action Items
              </span>
              <ul className="list-disc list-inside space-y-1 font-sans text-slate-300 text-xs">
                {geminiAnalysis.recommendations?.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {aiError && (
        <div className="mb-6 p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{aiError}</span>
        </div>
      )}

      {/* Visual Analytics Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gestures Breakdown */}
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-4 font-mono">
            Hand Gesture Frequency Breakdown
          </h3>

          {analytics?.topGestures && analytics.topGestures.length > 0 ? (
            <div className="space-y-3">
              {analytics.topGestures.slice(0, 6).map((g) => {
                const max = analytics.topGestures[0]?.count || 1;
                const pct = Math.round((g.count / max) * 100);

                return (
                  <div key={g.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-200 font-medium">{g.name}</span>
                      <span className="text-slate-400 font-mono tabular-nums">
                        {g.count} logs ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              No gesture actions captured yet.
            </div>
          )}
        </div>

        {/* Facial Expression Breakdown */}
        <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-4 font-mono">
            Facial Expressions & Valence
          </h3>

          {analytics?.topExpressions && analytics.topExpressions.length > 0 ? (
            <div className="space-y-3">
              {analytics.topExpressions.slice(0, 6).map((e) => {
                const max = analytics.topExpressions[0]?.count || 1;
                const pct = Math.round((e.count / max) * 100);

                return (
                  <div key={e.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-200 font-medium">{e.name}</span>
                      <span className="text-slate-400 font-mono tabular-nums">
                        {e.count} logs ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              No facial expressions captured yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
