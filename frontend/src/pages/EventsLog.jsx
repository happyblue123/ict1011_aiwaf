import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw, Eye, X, Server, ChevronLeft, ChevronRight, ShieldAlert, Clock, Calendar, Zap,
  BrainCircuit, Shield, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, MessageSquare, CheckCircle,
  Download, FileText, Filter // <-- Added Export Icons
} from 'lucide-react';
import jsPDF from 'jspdf'; // <-- Added PDF library
import autoTable from 'jspdf-autotable'; // <-- Added Table library

const API_BASE_URL = "/api";

const ACTION_CLASS = {
  BLOCKED: 'bg-red-100 text-red-700 border-red-200',
  ALLOWED: 'bg-green-100 text-green-700 border-green-200',
  FLAGGED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

// --- Score Gauge Bar Component ---
const ScoreGauge = ({ label, score, threshold, thresholdLabel }) => {
  const pct = Math.min(Math.max((score || 0) * 100, 0), 100);
  const thresholdPct = (threshold || 0) * 100;
  const isAbove = pct >= thresholdPct;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-gray-600">{label}</span>
        <span className={`font-bold ${isAbove ? 'text-red-600' : 'text-green-600'}`}>
          {score != null ? score.toFixed(3) : 'N/A'}
        </span>
      </div>
      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: pct < 40 ? '#22c55e' : pct < 70 ? '#f59e0b' : '#ef4444',
          }}
        />
        {threshold != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-800"
            style={{ left: `${thresholdPct}%` }}
            title={thresholdLabel || `Threshold: ${threshold}`}
          />
        )}
      </div>
      {threshold != null && (
        <div className="text-[10px] text-gray-400" style={{ paddingLeft: `${Math.max(thresholdPct - 5, 0)}%` }}>
          {thresholdLabel || `Threshold ${threshold}`}
        </div>
      )}
    </div>
  );
};

// --- WAF Layer Parser ---
const parseWafLayer = (reasons) => {
  if (!reasons || !reasons.length) return 'Unknown';
  const first = reasons[0] || '';
  if (first.startsWith('ip_policy')) return 'IP Policy';
  if (first.startsWith('protocol')) return 'Protocol Check';
  if (first.startsWith('traversal')) return 'Path Traversal';
  if (first.startsWith('sqli')) return 'SQL Injection';
  if (first.startsWith('xss')) return 'XSS Detection';
  if (first.startsWith('cmd_injection')) return 'Command Injection';
  if (first.startsWith('generic_injection')) return 'Generic Injection';
  if (first.startsWith('bot')) return 'Bot Detection';
  if (first.startsWith('zombie')) return 'Zombie Filter';
  if (first.startsWith('rate_limit')) return 'Rate Limiter';
  if (first.startsWith('AI_ANOMALY')) return 'AI Anomaly Detection';
  if (first.startsWith('AI_CLASSIFICATION')) return 'AI Classification';
  if (first === 'baseline_allow') return 'Passed All Checks';
  return first.split(':')[0];
};

// --- Verdict Badge ---
const getVerdict = (ai) => {
  if (!ai) return { label: 'NO AI DATA', color: 'bg-gray-100 text-gray-600' };
  if (ai.classification_blocked) return { label: 'MALICIOUS', color: 'bg-red-100 text-red-700' };
  if (ai.flagged) return { label: 'SUSPICIOUS', color: 'bg-amber-100 text-amber-700' };
  if (ai.model_ready === false) return { label: 'MODEL NOT READY', color: 'bg-gray-100 text-gray-500' };
  return { label: 'BENIGN', color: 'bg-green-100 text-green-700' };
};

// --- Animated Checkmark SVG ---
const AnimatedCheckmark = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="inline-block">
    <path
      d="M5 13l4 4L19 7"
      stroke="#22c55e"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="24"
      className="animate-checkmark-draw"
    />
  </svg>
);

// --- Feedback Panel ---
const FeedbackPanel = ({ log, onFeedbackSaved }) => {
  const [label, setLabel] = useState(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [glowClass, setGlowClass] = useState('');

  // Check for existing feedback on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/feedback/${log.id}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.feedback) {
            setSaved(data.feedback.label);
          }
        }
      } catch {}
    })();
  }, [log.id]);

  const submit = async (chosenLabel) => {
    setLabel(chosenLabel);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: log.id, label: chosenLabel, notes: notes || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed');
      }
      const data = await res.json();
      setSaved(chosenLabel);
      setGlowClass('animate-pulse-glow');
      setTimeout(() => setGlowClass(''), 700);
      if (onFeedbackSaved) onFeedbackSaved(log.id, chosenLabel, data.injected_to_baseline);
    } catch (e) {
      setError(e.message);
      setLabel(null);
    } finally {
      setSaving(false);
    }
  };

  // Determine context: is this a flagged/blocked event or an allowed event?
  const ai = log.raw_log?.ai || {};
  const isFlaggedOrBlocked = ai.flagged || ai.classification_blocked || log.action_taken !== 'ALLOWED';

  // Saved label display config
  const savedLabels = {
    correct: { text: 'Correct Detection', bg: 'bg-green-50/60 border-green-200', badge: 'bg-green-100 text-green-700' },
    false_positive: { text: 'False Positive', bg: 'bg-amber-50/60 border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    false_negative: { text: 'Missed Attack', bg: 'bg-red-50/60 border-red-200', badge: 'bg-red-100 text-red-700' },
  };

  // Already reviewed
  if (saved) {
    const cfg = savedLabels[saved] || savedLabels.correct;
    return (
      <div className={`p-4 rounded-lg border space-y-2 ${cfg.bg} ${glowClass}`}>
        <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-gray-500">
          <MessageSquare size={14} /> Analyst Feedback
        </h3>
        <div className="flex items-center gap-2">
          <AnimatedCheckmark />
          <span className={`px-3 py-1 text-xs font-bold rounded-full ${cfg.badge}`}>
            {cfg.text}
          </span>
          {saved === 'false_positive' && (
            <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
              Features injected into baseline for retraining
            </span>
          )}
          {saved === 'false_negative' && (
            <span className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              Features marked as attack for retraining
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100 space-y-3">
      <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2">
        <MessageSquare size={14} /> Analyst Feedback
      </h3>
      <p className="text-xs text-gray-500">
        {isFlaggedOrBlocked
          ? 'Was this AI detection correct? Your feedback helps the AI learn.'
          : 'Did the AI miss an attack? Mark this request if it should have been blocked.'}
      </p>
      <div className="flex gap-2">
        {isFlaggedOrBlocked ? (
          <>
            <button
              onClick={() => submit('correct')}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50"
            >
              <ThumbsUp size={16} />
              Correct Detection
            </button>
            <button
              onClick={() => submit('false_positive')}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50"
            >
              <ThumbsDown size={16} />
              False Positive
            </button>
          </>
        ) : (
          <button
            onClick={() => submit('false_negative')}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50"
          >
            <ShieldAlert size={16} />
            Missed Attack
          </button>
        )}
      </div>

      {/* Optional notes */}
      <button
        onClick={() => setShowNotes(!showNotes)}
        className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        {showNotes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Add notes (optional)
      </button>
      {showNotes && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isFlaggedOrBlocked ? "Why do you think this is a false positive?" : "What attack type did the AI miss?"}
          className="w-full text-xs border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
          rows={2}
        />
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
};

// --- Enhanced Inspector Drawer ---
const InspectorDrawer = ({ log, onClose, onFeedbackSaved }) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const ai = log.raw_log?.ai || {};
  const decision = log.raw_log?.decision || {};
  const verdict = getVerdict(ai);
  const wafLayer = parseWafLayer(decision.reasons);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl p-6 flex flex-col animate-slide-in-right overflow-hidden">
        <div className="flex justify-between items-center mb-6 pb-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">Event Details #{log.id}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 flex-1 overflow-y-auto">
          {/* Request Summary */}
          <div className="p-4 bg-gray-50 rounded-lg font-mono text-sm space-y-2 border">
            <p><span className="font-bold text-gray-400">Time:</span> {log.timestamp}</p>
            <p><span className="font-bold text-gray-400">Source:</span> {log.source_ip} ({log.geo_location})</p>
            <p><span className="font-bold text-gray-400">Dest:</span> {log.destination_ip}</p>
            <p><span className="font-bold text-gray-400">Method:</span> {log.http_method}</p>
            <p><span className="font-bold text-gray-400">Path:</span><br/><span className="text-blue-600">{log.request_path}</span></p>
            <p><span className="font-bold text-gray-400">Params:</span> {log.request_params}</p>
          </div>

          {/* WAF Decision */}
          <div className="p-4 bg-gray-50 rounded-lg border space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Shield size={14} /> WAF Decision
            </h3>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 text-xs font-bold rounded-full border ${
                ACTION_CLASS[log.action_taken] || ACTION_CLASS.ALLOWED
              }`}>
                {log.action_taken}
              </span>
              <span className="text-xs text-gray-500">
                Triggered by: <span className="font-semibold text-gray-700">{wafLayer}</span>
              </span>
            </div>
            {decision.reasons && decision.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {decision.reasons.map((r, i) => (
                  <span key={i} className="px-2 py-0.5 text-[10px] font-mono bg-gray-200 text-gray-700 rounded">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* AI Analysis */}
          <div className="p-4 bg-purple-50/50 rounded-lg border border-purple-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-purple-500 uppercase tracking-widest flex items-center gap-2">
                <BrainCircuit size={14} /> AI Analysis
              </h3>
              <span className={`px-3 py-1 text-[11px] font-bold rounded-full ${verdict.color}`}>
                {verdict.label}
              </span>
            </div>

            {/* Combined Anomaly Score */}
            <ScoreGauge
              label="Combined Anomaly Score"
              score={ai.score}
              threshold={0.70}
              thresholdLabel="Block at 0.70"
            />

            {/* Ensemble Breakdown */}
            {(ai.if_score != null || ai.ae_score != null) && (
              <div className="pl-3 border-l-2 border-purple-200 space-y-3">
                <div className="text-[10px] font-bold text-purple-400 uppercase">Ensemble Breakdown</div>
                <ScoreGauge
                  label="Isolation Forest"
                  score={ai.if_score}
                  threshold={null}
                />
                <ScoreGauge
                  label="Autoencoder"
                  score={ai.ae_score}
                  threshold={null}
                />
                {ai.ae_mse != null && (
                  <div className="text-[10px] text-gray-400">
                    Autoencoder MSE: <span className="font-mono font-bold">{ai.ae_mse.toFixed(6)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Classification Score */}
            {ai.classification_score != null && (
              <ScoreGauge
                label="Classification (Malicious Probability)"
                score={ai.classification_score}
                threshold={0.95}
                thresholdLabel="Block at 0.95"
              />
            )}

            {ai.model_ready === false && (
              <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded border border-amber-200">
                AI model is not yet trained. Send more traffic to build a baseline.
              </div>
            )}
          </div>

          {/* Analyst Feedback (for AI-flagged events AND allowed events with AI features) */}
          {(ai.flagged || ai.classification_blocked || ai.features) && (
            <FeedbackPanel log={log} onFeedbackSaved={onFeedbackSaved} />
          )}

          {/* Raw JSON (Collapsible) */}
          <div>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600"
            >
              {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Raw Payload
            </button>
            {showRawJson && (
              <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-[400px] mt-2">
                {JSON.stringify(log.raw_log, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const EventsLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Time filters
  const [timeMode, setTimeMode] = useState("preset");
  const [timePreset, setTimePreset] = useState("24h");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [liveStartTime, setLiveStartTime] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Feedback status map: { log_id: 'correct' | 'false_positive' }
  const [feedbackMap, setFeedbackMap] = useState({});

  // --- NEW: Export Modal States ---
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportAttackFilter, setExportAttackFilter] = useState('ALL');
  const [isExporting, setIsExporting] = useState(false);

  const liveIntervalRef = useRef(null);

  const onTimePresetChange = (e) => {
    const v = e.target.value;
    setTimePreset(v);

    if (v === "live") {
      const nowIso = new Date().toISOString();
      setLiveStartTime(nowIso);
      setLogs([]);
      setCurrentPage(1);
    } else {
      setLiveStartTime(null);
    }
  };

  const fetchLogs = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);

    try {
      const isLive = (timeMode === "preset" && timePreset === "live");

      const queryParams = {
        limit: ITEMS_PER_PAGE,
        page: isLive ? 1 : currentPage,
        time_mode: timeMode,
      };

      if (isLive) {
        if (!liveStartTime) return;
        queryParams.time_mode = "after";
        queryParams.start_date = liveStartTime;
      } else if (timeMode === "preset") {
        queryParams.time_preset = timePreset;
      }

      if (timeMode === 'after' || timeMode === 'between') queryParams.start_date = startDate;
      if (timeMode === 'before' || timeMode === 'between') queryParams.end_date = endDate;

      const query = new URLSearchParams(queryParams).toString();
      const res = await fetch(`${API_BASE_URL}/logs?${query}`, { credentials: "include" });

      if (!res.ok) throw new Error(`Server Error: ${res.status}`);

      const data = await res.json();

      const fetchedLogs = Array.isArray(data.logs) ? data.logs : [];
      setLogs(fetchedLogs);
      setTotalPages(data.pagination?.total_pages || 1);

      // Batch-check feedback status for AI-evaluated logs (flagged, blocked, or has features)
      const flaggedIds = fetchedLogs
        .filter(l => l.raw_log?.ai?.flagged || l.raw_log?.ai?.classification_blocked || l.raw_log?.ai?.features)
        .map(l => l.id)
        .filter(Boolean);
      if (flaggedIds.length > 0) {
        try {
          const fbRes = await fetch(`${API_BASE_URL}/feedback/batch`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ log_ids: flaggedIds }),
          });
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            setFeedbackMap(prev => ({ ...prev, ...fbData }));
          }
        } catch {}
      }

      if (isLive) setCurrentPage(1);

    } catch (err) {
      console.error("Failed to load logs:", err);
      setLogs([]);
      setTotalPages(1);
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  };

  // --- NEW: REPORT EXPORT LOGIC (PDF ONLY) ---
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const queryParams = { limit: 10000, page: 1, time_mode: timeMode };
      if (timeMode === "preset" && timePreset !== "live") queryParams.time_preset = timePreset;
      if (timeMode === 'after' || timeMode === 'between') queryParams.start_date = startDate;
      if (timeMode === 'before' || timeMode === 'between') queryParams.end_date = endDate;

      const res = await fetch(`${API_BASE_URL}/logs?${new URLSearchParams(queryParams).toString()}`, { credentials: "include" });
      const data = await res.json();
      let exportData = Array.isArray(data.logs) ? data.logs : [];

      // Apply the Filter properly
      if (exportAttackFilter !== 'ALL') {
        exportData = exportData.filter(log => {
          if (exportAttackFilter === 'baseline_allow') {
             return log.attack_type === 'baseline_allow' || log.attack_type === 'None';
          }
          return log.attack_type === exportAttackFilter;
        });
      }

      const totalEvents = exportData.length;
      const totalBlocked = exportData.filter(l => l.action_taken === 'BLOCKED').length;
      const totalAnomalies = exportData.filter(l => l.raw_log?.ai?.flagged).length;
      const attackCounts = exportData.reduce((acc, log) => {
        const type = log.attack_type || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      // Generate PDF
      const doc = new jsPDF('landscape');
      const timestamp = new Date().toLocaleString();

      doc.setFontSize(18); doc.setTextColor(30, 58, 138); doc.text("Neuro-WAF Security Report", 14, 22);
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`Generated: ${timestamp}`, 14, 30);
      doc.text(`Filter Applied: ${exportAttackFilter === 'ALL' ? 'All Traffic' : exportAttackFilter}`, 14, 35);

      doc.setFontSize(12); doc.setTextColor(0); doc.text("Executive Summary", 14, 45);
      doc.setFontSize(10);
      doc.text(`Total Events: ${totalEvents}`, 14, 52);
      doc.text(`Blocked Threats: ${totalBlocked}`, 14, 58);
      doc.text(`AI Anomalies Detected: ${totalAnomalies}`, 14, 64);

      doc.text("Attack Breakdown:", 100, 45);
      let yOffset = 52;
      Object.entries(attackCounts).forEach(([type, count]) => {
        doc.text(`- ${type}: ${count}`, 100, yOffset);
        yOffset += 6;
      });

      const tableColumns = ["Time", "Source IP", "Path", "Attack Type", "AI Score", "Classification", "Action"];
      const tableRows = exportData.map(log => {
        const ai = log.raw_log?.ai || {};
        const eventTime = log.timestamp || log.raw_log?.timestamp;
        return [
          eventTime ? new Date(eventTime).toLocaleString() : "—",
          log.source_ip,
          log.request_path?.length > 40 ? log.request_path.substring(0, 37) + '...' : (log.request_path || "—"),
          log.attack_type,
          ai.score ? ai.score.toFixed(3) : '-',
          ai.classification_score ? (ai.classification_blocked ? 'MALICIOUS' : 'BENIGN') : '-',
          log.action_taken
        ];
      });

      autoTable(doc, {
        startY: Math.max(75, yOffset + 10),
        head: [tableColumns],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138] },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
      });

      doc.save(`NeuroWAF_Report_${new Date().getTime()}.pdf`);
      setIsExportModalOpen(false);
      
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to generate report. Check console for details.");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => { setCurrentPage(1); }, [timeMode, timePreset, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => fetchLogs(), 300);

    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);

    const isLive = (timeMode === 'preset' && timePreset === 'live');
    if (isLive && liveStartTime) {
      liveIntervalRef.current = setInterval(() => fetchLogs(true), 2000);
    }

    return () => {
      clearTimeout(timer);
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [timeMode, timePreset, startDate, endDate, currentPage, liveStartTime]);

  return (
    <div className="space-y-6 relative pb-10">

      {/* HEADER */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2 min-w-fit">
          <ShieldAlert className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">Security Event Stream</h1>

          {timePreset === 'live' && timeMode === 'preset' && (
            <span className="flex items-center gap-1.5 px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full animate-pulse ml-2">
              <span className="w-2 h-2 bg-red-600 rounded-full"></span>
              LIVE
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-3 w-full xl:justify-end items-center">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1">
            <select
              value={timeMode}
              onChange={(e) => setTimeMode(e.target.value)}
              className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none px-2 py-1 cursor-pointer"
            >
              <option value="preset">Quick Range</option>
              <option value="between">Between Dates</option>
              <option value="after">After Date</option>
              <option value="before">Before Date</option>
            </select>
          </div>

          {timeMode === 'preset' && (
            <div className="relative">
              {timePreset === 'live'
                ? <Zap className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 fill-red-500" size={16} />
                : <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              }
              <select
                value={timePreset}
                onChange={onTimePresetChange}
                className={`pl-9 pr-8 py-2 rounded-lg border text-sm focus:outline-none cursor-pointer font-bold ${
                  timePreset === 'live' ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}
              >
                <option value="live">⚡️ Live Real-Time</option>
                <option disabled>──────────</option>
                <option value="5m">Last 5 Minutes</option>
                <option value="1h">Last 1 Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>
          )}

          {/* --- NEW: Wrapped refresh and export inside a container --- */}
          <div className="flex gap-2 border-l pl-3 ml-1">
            <button onClick={() => fetchLogs()} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="Refresh">
              <RefreshCw size={18} className={timePreset === 'live' ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
              <Download size={16} /> Export Report
            </button>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4">Request URI</th>
                <th className="px-6 py-4">Attack Type</th>
                <th className="px-6 py-4">Anomaly</th>
                <th className="px-6 py-4">Classification</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading && logs.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-gray-500">Loading events...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="10" className="p-8 text-center text-gray-500">No logs found.</td></tr>
              ) : logs.map((log, index) => (
                <tr key={log.raw_log?.request_id || index} className="hover:bg-blue-50/50 transition-colors animate-fade-in">
                  <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-mono text-xs">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "—"}
                  </td>

                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold ${log.source_ip === '127.0.0.1' ? 'text-blue-500' : 'text-gray-700'}`}>
                        {log.source_ip === '127.0.0.1' ? 'localhost' : log.source_ip}
                      </span>
                      <span className="text-[10px] bg-gray-200 px-1.5 rounded text-gray-600">{log.geo_location}</span>
                    </div>
                  </td>

                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-gray-400" />
                      <span className="font-mono text-gray-600">{log.destination_ip || "waf"}</span>
                    </div>
                  </td>

                  <td className="px-6 py-3">
                    <span className="px-2 py-1 text-[10px] font-bold rounded border border-gray-200 bg-gray-50 text-gray-700">
                      {log.http_method}
                    </span>
                  </td>

                  <td className="px-6 py-3">
                    <div className="font-mono text-[11px] text-gray-700 truncate max-w-[260px]" title={log.request_path}>
                      {log.request_path}
                    </div>
                  </td>

                  <td className="px-6 py-3">
                    <span className={`text-xs font-bold ${log.attack_type === 'None' ? 'text-gray-400' : 'text-red-600'}`}>
                      {log.attack_type}
                    </span>
                  </td>

                  <td className="px-6 py-3">
                    {log.raw_log?.ai?.flagged ? (
                      <span className="px-2 py-1 text-[10px] font-bold rounded border bg-purple-100 text-purple-700 border-purple-200">
                        ANOMALY ({log.raw_log.ai.score?.toFixed(3)})
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  <td className="px-6 py-3">
                    {typeof log.raw_log?.ai?.classification_score === "number" ? (
                      <span className={`px-2 py-1 text-[10px] font-bold rounded border ${
                        log.raw_log.ai.classification_blocked ? "bg-red-100 text-red-700 border-red-200" : "bg-green-100 text-green-700 border-green-200"
                      }`}>
                        {log.raw_log.ai.classification_blocked ? "MALICIOUS" : "BENIGN"} ({log.raw_log.ai.classification_score.toFixed(3)})
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>

                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 text-[10px] font-bold rounded border ${ACTION_CLASS[log.action_taken] || ACTION_CLASS.ALLOWED}`}>
                      {log.action_taken}
                    </span>
                  </td>

                  <td className="px-6 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {feedbackMap[log.id] && (
                        <span title={
                          feedbackMap[log.id] === 'correct' ? 'Verified Correct'
                            : feedbackMap[log.id] === 'false_negative' ? 'Marked Missed Attack'
                            : 'Marked False Positive'
                        }>
                          <CheckCircle size={14} className={
                            feedbackMap[log.id] === 'correct' ? 'text-green-500'
                              : feedbackMap[log.id] === 'false_negative' ? 'text-red-500'
                              : 'text-amber-500'
                          } />
                        </span>
                      )}
                      <button onClick={() => setSelectedLog(log)} className="text-gray-400 hover:text-blue-600">
                        <Eye size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            Page <span className="font-bold">{currentPage}</span> of <span className="font-bold">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || (timeMode === "preset" && timePreset === "live")}
              className="p-2 rounded-lg border disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || (timeMode === "preset" && timePreset === "live")}
              className="p-2 rounded-lg border disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* --- NEW: EXPORT MODAL --- */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
            <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
              <h2 className="font-bold flex items-center gap-2"><FileText size={18}/> Generate Security Report</h2>
              <button onClick={() => setIsExportModalOpen(false)} className="text-gray-400 hover:text-white"><X size={18}/></button>
            </div>
            
            <div className="p-6 space-y-5">
              <p className="text-sm text-gray-600">
                This will generate a comprehensive PDF document based on your current active time filters.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Filter size={14}/> Filter by Attack Type</label>
                <select 
                  value={exportAttackFilter} 
                  onChange={(e) => setExportAttackFilter(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Traffic (Comprehensive)</option>
                  <option value="baseline_allow">Benign / Normal Traffic Only</option>
                  <option disabled>──────────</option>
                  <option value="sqli">SQL Injection</option>
                  <option value="xss">Cross-Site Scripting (XSS)</option>
                  <option value="traversal">Path Traversal</option>
                  <option value="AI_CLASSIFICATION">AI Classified Attacks</option>
                  <option value="rate_limit">DDoS / Rate Limit Spikes</option>
                </select>
              </div>

              <button 
                onClick={handleExport}
                disabled={isExporting}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isExporting ? <RefreshCw className="animate-spin" size={18} /> : <Download size={18} />}
                {isExporting ? 'Generating Report...' : 'Download PDF Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSPECTOR */}
      {selectedLog && (
        <InspectorDrawer
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onFeedbackSaved={(logId, label) => {
            setFeedbackMap(prev => ({ ...prev, [logId]: label }));
          }}
        />
      )}
    </div>
  );
};

export default EventsLog;