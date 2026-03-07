import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  RefreshCw, Eye, X, Server, ChevronLeft, ChevronRight, ShieldAlert, Clock, Calendar, Zap,
  BrainCircuit, Shield, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, MessageSquare, CheckCircle,
  Download, FileText, Filter, Loader2, ExternalLink, Search
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  const ai = log.raw_log?.ai || {};
  const isFlaggedOrBlocked = ai.flagged || ai.classification_blocked || log.action_taken !== 'ALLOWED';

  const savedLabels = {
    correct: { text: 'Correct Detection', bg: 'bg-green-50/60 border-green-200', badge: 'bg-green-100 text-green-700' },
    false_positive: { text: 'False Positive', bg: 'bg-amber-50/60 border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    false_negative: { text: 'Missed Attack', bg: 'bg-red-50/60 border-red-200', badge: 'bg-red-100 text-red-700' },
  };

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
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100 space-y-3">
      <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2">
        <MessageSquare size={14} /> Analyst Feedback
      </h3>
      <div className="flex gap-2">
        {isFlaggedOrBlocked ? (
          <>
            <button onClick={() => submit('correct')} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50">
              <ThumbsUp size={16} /> Correct Detection
            </button>
            <button onClick={() => submit('false_positive')} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50">
              <ThumbsDown size={16} /> False Positive
            </button>
          </>
        ) : (
          <button onClick={() => submit('false_negative')} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50">
            <ShieldAlert size={16} /> Missed Attack
          </button>
        )}
      </div>
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
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-5 flex-1 overflow-y-auto">
          <div className="p-4 bg-gray-50 rounded-lg font-mono text-sm space-y-2 border">
            <p><span className="font-bold text-gray-400">Time:</span> {log.timestamp || log.raw_log?.timestamp || "—"}</p>
            <p className="flex items-center gap-1.5">
              <span className="font-bold text-gray-400">Source:</span> 
              {log.source_ip === '127.0.0.1' ? (
                <span>localhost</span>
              ) : (
                <a href={`https://www.virustotal.com/gui/search/${log.source_ip}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 transition-colors" title="Analyze IP on VirusTotal">
                  {log.source_ip} <ExternalLink size={12} className="opacity-70" />
                </a>
              )}
              <span className="text-gray-500">({log.geo_location})</span>
            </p>
            <p><span className="font-bold text-gray-400">Dest:</span> {log.destination_ip}</p>
            <p><span className="font-bold text-gray-400">Method:</span> {log.http_method}</p>
            <p><span className="font-bold text-gray-400">Path:</span><br/><span className="text-blue-600 truncate block">{log.request_path}</span></p>
          </div>

          <div className="p-4 bg-purple-50/50 rounded-lg border border-purple-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-purple-500 uppercase tracking-widest flex items-center gap-2">
                <BrainCircuit size={14} /> AI Analysis
              </h3>
              <span className={`px-3 py-1 text-[11px] font-bold rounded-full ${verdict.color}`}>{verdict.label}</span>
            </div>
            <ScoreGauge label="Combined Anomaly Score" score={ai.score} threshold={0.70} thresholdLabel="Block at 0.70" />
            {ai.classification_score != null && (
              <ScoreGauge label="Classification (Malicious Probability)" score={ai.classification_score} threshold={0.95} thresholdLabel="Block at 0.95" />
            )}
          </div>

          {(ai.flagged || ai.classification_blocked || ai.features) && (
            <FeedbackPanel log={log} onFeedbackSaved={onFeedbackSaved} />
          )}

          <div>
            <button onClick={() => setShowRawJson(!showRawJson)} className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-gray-600">
              {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Raw Payload
            </button>
            {showRawJson && (
              <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-[400px] mt-2 whitespace-pre-wrap break-all">
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
  const location = useLocation();
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

  const [feedbackMap, setFeedbackMap] = useState({});

  // --- NEW: DYNAMIC FILTER OPTIONS ---
  // --- DYNAMIC FILTER OPTIONS WITH SAFE FALLBACKS ---
  const [dynamicFilters, setDynamicFilters] = useState({
    attacks: ['sql_injection', 'xss', 'traversal', 'cmd_injection', 'generic_injection', 'geo_block', 'AI_ANOMALY', 'rate_limit'],
    actions: ['BLOCKED', 'ALLOWED', 'FLAGGED'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    countries: ['Local', 'United States', 'Russia', 'China', 'Iran']
  });

  // Load Dynamic DB Options on Mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/logs/filters`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data && data.attacks) {
            setDynamicFilters(data); // Overwrites fallbacks with real DB values
          }
        }
      } catch (err) {
        console.error("Failed to fetch dynamic DB filters", err);
      }
    };
    fetchOptions();
  }, []);

  // SEARCH & FILTER STATES
  const [searchQuery, setSearchQuery] = useState('');
  const [attackTypeFilter, setAttackTypeFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState(location.state?.actionFilter || 'all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [ipFilter, setIpFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // DEBOUNCE STATES
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedIp, setDebouncedIp] = useState('');

  // Export Modal States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportAttackFilter, setExportAttackFilter] = useState('ALL');
  const [isExporting, setIsExporting] = useState(false);

  const liveIntervalRef = useRef(null);

  // Load Dynamic DB Options on Mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/logs/filters`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setDynamicFilters(data);
        }
      } catch (err) {
        console.error("Failed to fetch dynamic DB filters", err);
      }
    };
    fetchOptions();
  }, []);

  // Debounce Text Input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setDebouncedIp(ipFilter);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, ipFilter]);

  const onTimePresetChange = (e) => {
    const v = e.target.value;
    setTimePreset(v);
    if (v === "live") {
      setLiveStartTime(new Date().toISOString());
      setLogs([]);
      setCurrentPage(1);
    } else {
      setLiveStartTime(null);
    }
  };

  // Trigger Backend Fetch
  useEffect(() => {
    fetchLogs();
  }, [debouncedSearch, debouncedIp, attackTypeFilter, actionFilter, countryFilter, methodFilter, currentPage, timeMode, timePreset, startDate, endDate]);

  const fetchLogs = async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);

    try {
      const isLive = (timeMode === "preset" && timePreset === "live");
      const queryParams = { limit: ITEMS_PER_PAGE, page: isLive ? 1 : currentPage, time_mode: timeMode };

      if (isLive) {
        if (!liveStartTime) return;
        queryParams.time_mode = "after";
        queryParams.start_date = liveStartTime;
      } else if (timeMode === "preset") {
        queryParams.time_preset = timePreset;
      }
      if (timeMode === 'after' || timeMode === 'between') queryParams.start_date = startDate;
      if (timeMode === 'before' || timeMode === 'between') queryParams.end_date = endDate;

      // Apply Filters directly to Backend
      if (debouncedSearch.trim()) queryParams.search = debouncedSearch;
      if (attackTypeFilter !== 'all') queryParams.attack_type_filter = attackTypeFilter;
      if (actionFilter !== 'all') queryParams.action_filter = actionFilter;
      if (countryFilter !== 'all') queryParams.country_filter = countryFilter;
      if (methodFilter !== 'all') queryParams.method_filter = methodFilter;
      if (debouncedIp.trim()) queryParams.ip_filter = debouncedIp;

      const query = new URLSearchParams(queryParams).toString();
      const res = await fetch(`${API_BASE_URL}/logs?${query}`, { credentials: "include" });

      if (!res.ok) throw new Error(`Server Error: ${res.status}`);
      const data = await res.json();

      const fetchedLogs = Array.isArray(data.logs) ? data.logs : [];
      setLogs(fetchedLogs);
      setTotalPages(data.pagination?.total_pages || 1);

      if (isLive) setCurrentPage(1);
    } catch (err) {
      console.error("Failed to load logs:", err);
      setLogs([]); setTotalPages(1);
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  };

  // --- REPORT EXPORT LOGIC WITH GRAPHS ---
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const queryParams = { limit: 10000, page: 1, time_mode: timeMode };
      if (timeMode === "preset" && timePreset !== "live") queryParams.time_preset = timePreset;
      if (timeMode === 'after' || timeMode === 'between') queryParams.start_date = startDate;
      if (timeMode === 'before' || timeMode === 'between') queryParams.end_date = endDate;

      if (debouncedSearch.trim()) queryParams.search = debouncedSearch;
      if (attackTypeFilter !== 'all') queryParams.attack_type_filter = attackTypeFilter;
      if (actionFilter !== 'all') queryParams.action_filter = actionFilter;
      if (countryFilter !== 'all') queryParams.country_filter = countryFilter;
      if (methodFilter !== 'all') queryParams.method_filter = methodFilter;
      if (debouncedIp.trim()) queryParams.ip_filter = debouncedIp;

      const res = await fetch(`${API_BASE_URL}/logs?${new URLSearchParams(queryParams).toString()}`, { credentials: "include" });
      const data = await res.json();
      let exportData = Array.isArray(data.logs) ? data.logs : [];

      if (exportAttackFilter !== 'ALL') {
        exportData = exportData.filter(log => {
          if (exportAttackFilter === 'baseline_allow') return log.attack_type === 'baseline_allow' || log.attack_type === 'None';
          return log.attack_type === exportAttackFilter;
        });
      }

      const totalEvents = exportData.length;
      const totalBlocked = exportData.filter(l => l.action_taken === 'BLOCKED').length;
      const totalAnomalies = exportData.filter(l => l.raw_log?.ai?.flagged).length;
      
      const attackCounts = {};
      const actionCounts = {};
      const geoCounts = {};
      const methodCounts = {};
      const pathCounts = {};

      const stripEmojis = (str) => str.replace(/[^\w\s\/-]/g, '').trim();

      exportData.forEach(log => {
        const attack = log.attack_type || 'Unknown';
        attackCounts[attack] = (attackCounts[attack] || 0) + 1;
        const action = log.action_taken || 'UNKNOWN';
        actionCounts[action] = (actionCounts[action] || 0) + 1;
        const geo = stripEmojis(log.geo_location || 'Unknown');
        geoCounts[geo] = (geoCounts[geo] || 0) + 1;
        const method = log.http_method || 'UNKNOWN';
        methodCounts[method] = (methodCounts[method] || 0) + 1;
        const path = log.request_path || '/';
        pathCounts[path] = (pathCounts[path] || 0) + 1;
      });

      const doc = new jsPDF('landscape');
      const timestamp = new Date().toLocaleString();

      doc.setFontSize(18); doc.setTextColor(30, 58, 138); doc.text("Neuro-WAF Security Report", 14, 22);
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`Generated: ${timestamp}`, 14, 30);
      doc.text(`Filter Applied: ${exportAttackFilter === 'ALL' ? 'All Traffic' : exportAttackFilter}`, 14, 35);

      doc.setFontSize(12); doc.setTextColor(0); doc.text("Executive Summary", 14, 45);
      doc.setFontSize(10);
      doc.text(`Total Events Analyzed: ${totalEvents}`, 14, 52);
      doc.text(`Attacks Blocked: ${totalBlocked}`, 14, 58);
      doc.text(`AI Anomalies Detected: ${totalAnomalies}`, 14, 64);

      const tableColumns = ["Time", "Source IP", "Path", "Attack Type", "AI Score", "Classification", "Action"];
      const tableRows = exportData.map(log => {
        const ai = log.raw_log?.ai || {};
        const eventTime = log.timestamp || log.raw_log?.timestamp;
        return [
          eventTime ? new Date(eventTime).toLocaleString() : "—",
          log.source_ip,
          log.request_path?.length > 40 ? log.request_path.substring(0, 37) + '...' : (log.request_path || "—"),
          log.attack_type === 'baseline_allow' || log.attack_type === 'None' ? 'Clean' : log.attack_type,
          ai.score ? ai.score.toFixed(3) : '-',
          ai.classification_score ? (ai.classification_blocked ? 'MALICIOUS' : 'BENIGN') : '-',
          log.action_taken
        ];
      });

      autoTable(doc, {
        startY: 75,
        head: [tableColumns],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138] },
        styles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
      });

      let currentY = doc.lastAutoTable.finalY + 15;
      if (currentY > 130) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(14); doc.setTextColor(30, 58, 138); doc.text("Comprehensive Threat Analysis (Visualized)", 14, currentY);
      currentY += 10;

      const drawHorizontalBarChart = (title, data, startX, startY, colorMap = null, defaultColor = [30, 58, 138]) => {
        doc.setFontSize(11); doc.setTextColor(0); doc.text(title, startX, startY);
        let y = startY + 8;
        const maxVal = Math.max(...Object.values(data), 1);
        const maxBarWidth = 40; 
        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if(entries.length === 0) { doc.setFontSize(9); doc.text("No data", startX, y); return y + 10; }
        entries.forEach(([label, val]) => {
          doc.setFontSize(9); doc.setTextColor(100);
          let displayLabel = label === 'baseline_allow' || label === 'None' ? 'Clean/Normal' : label;
          displayLabel = displayLabel.length > 18 ? displayLabel.substring(0, 16) + '..' : displayLabel;
          doc.text(displayLabel, startX, y);
          const barWidth = (val / maxVal) * maxBarWidth;
          if (colorMap && colorMap[label]) doc.setFillColor(...colorMap[label]);
          else if (displayLabel === 'Clean/Normal' || label === 'ALLOWED') doc.setFillColor(34, 197, 94);
          else if (label === 'BLOCKED') doc.setFillColor(239, 68, 68);
          else if (label === 'FLAGGED') doc.setFillColor(245, 158, 11);
          else doc.setFillColor(...defaultColor);
          doc.rect(startX + 35, y - 3, barWidth, 4, 'F');
          doc.setTextColor(0); doc.text(val.toString(), startX + 35 + barWidth + 2, y);
          y += 7;
        });
      };

      const drawStackedBarChart = (title, data, startX, startY) => {
        doc.setFontSize(11); doc.setTextColor(0); doc.text(title, startX, startY);
        const total = Object.values(data).reduce((a,b) => a+b, 0);
        if (total === 0) return;
        const barWidth = 70; const barHeight = 8; let currentX = startX; const y = startY + 8;
        Object.entries(data).forEach(([label, val]) => {
            const w = (val / total) * barWidth;
            if (label === 'BLOCKED') doc.setFillColor(239, 68, 68);
            else if (label === 'ALLOWED') doc.setFillColor(34, 197, 94);
            else doc.setFillColor(245, 158, 11);
            doc.rect(currentX, y, w, barHeight, 'F');
            const idx = Object.keys(data).indexOf(label);
            doc.setFontSize(8); doc.setTextColor(100);
            doc.rect(startX, y + 15 + (idx*6), 3, 3, 'F');
            doc.text(`${label} (${val})`, startX + 5, y + 17.5 + (idx*6));
            currentX += w;
        });
      };

      const drawVerticalBarChart = (title, data, startX, startY) => {
        doc.setFontSize(11); doc.setTextColor(0); doc.text(title, startX, startY);
        let x = startX + 5; const yBase = startY + 35;
        const maxVal = Math.max(...Object.values(data), 1);
        const maxHeight = 20; const barWidth = 12; const spacing = 6;
        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 4);
        if(entries.length === 0) return;
        entries.forEach(([label, val]) => {
            const h = (val / maxVal) * maxHeight;
            doc.setFillColor(139, 92, 246); 
            doc.rect(x, yBase - h, barWidth, h, 'F');
            doc.setFontSize(8); doc.setTextColor(0);
            doc.text(val.toString(), x + (barWidth/2), yBase - h - 2, { align: 'center' });
            doc.setFontSize(8); doc.setTextColor(100);
            doc.text(label.substring(0, 6), x + (barWidth/2), yBase + 4, { align: 'center' });
            x += barWidth + spacing;
        });
      };

      const drawLollipopChart = (title, data, startX, startY) => {
        doc.setFontSize(11); doc.setTextColor(0); doc.text(title, startX, startY);
        let y = startY + 8;
        const maxVal = Math.max(...Object.values(data), 1);
        const maxLineLen = 35;
        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if(entries.length === 0) return;
        entries.forEach(([label, val]) => {
            doc.setFontSize(9); doc.setTextColor(100);
            let displayLabel = label.length > 12 ? label.substring(0, 10) + '..' : label;
            doc.text(displayLabel, startX, y);
            const lineLen = (val / maxVal) * maxLineLen;
            doc.setDrawColor(220, 220, 220); doc.setLineWidth(1.5);
            doc.line(startX + 25, y - 1, startX + 25 + lineLen, y - 1);
            doc.setFillColor(245, 158, 11); 
            doc.circle(startX + 25 + lineLen, y - 1, 2, 'F');
            doc.setTextColor(0); doc.setFontSize(8);
            doc.text(val.toString(), startX + 25 + lineLen + 4, y);
            y += 7;
        });
      };

      const attackColorMap = { 'baseline_allow': [34, 197, 94], 'None': [34, 197, 94] }; 
      drawHorizontalBarChart("Top Attack Types", attackCounts, 14, currentY, attackColorMap, [239, 68, 68]);
      drawStackedBarChart("Actions Taken", actionCounts, 105, currentY);
      drawLollipopChart("Top Geographies", geoCounts, 196, currentY);
      drawVerticalBarChart("HTTP Methods", methodCounts, 14, currentY + 45);
      drawHorizontalBarChart("Most Targeted Paths", pathCounts, 105, currentY + 45, null, [59, 130, 246]);

      doc.save(`NeuroWAF_Report_${new Date().getTime()}.pdf`);
      setIsExportModalOpen(false);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to generate report.");
    } finally {
      setIsExporting(false);
    }
  };


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
  }, [liveStartTime]); 

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
              onChange={(e) => { setTimeMode(e.target.value); setCurrentPage(1); }}
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

          <div className="flex gap-2 border-l pl-3 ml-1">
            <button onClick={() => setShowFilters(!showFilters)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="Toggle Filters">
              <Filter size={18} className={showFilters ? 'text-blue-600' : ''} />
            </button>
            <button onClick={() => fetchLogs()} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="Refresh">
              <RefreshCw size={18} className={timePreset === 'live' ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm">
              <Download size={16} /> Export Report
            </button>
          </div>
        </div>
      </div>

      {/* --- DYNAMIC FILTERS PANEL --- */}
      {showFilters && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm space-y-4 mb-4 animate-fade-in">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Filter size={16} className="text-blue-600" /> Search & Advanced Filters
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center gap-1"><Search size={12} /> Global Search</label>
              <input type="text" placeholder="Search by IP, country, or path..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            
            {/* DYNAMIC DROPDOWNS FROM DATABASE */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Attack Type</label>
              <select value={attackTypeFilter} onChange={(e) => { setAttackTypeFilter(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="all">All Types</option>
                {dynamicFilters.attacks.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Action Taken</label>
              <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="all">All Actions</option>
                {dynamicFilters.actions.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">HTTP Method</label>
              <select value={methodFilter} onChange={(e) => { setMethodFilter(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="all">All Methods</option>
                {dynamicFilters.methods.map(method => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Country</label>
              <select value={countryFilter} onChange={(e) => { setCountryFilter(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="all">All Countries</option>
                {dynamicFilters.countries.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Source IP</label>
              <input
                type="text"
                placeholder="e.g., 192.168.1.1"
                value={ipFilter}
                onChange={(e) => { setIpFilter(e.target.value); setCurrentPage(1); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {(searchQuery || attackTypeFilter !== 'all' || actionFilter !== 'all' || countryFilter !== 'all' || methodFilter !== 'all' || ipFilter) && (
            <div className="flex justify-end pt-4 border-t border-blue-200 mt-4">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setAttackTypeFilter('all');
                  setActionFilter('all');
                  setCountryFilter('all');
                  setMethodFilter('all');
                  setIpFilter('');
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- UPGRADED: THREAT INTEL SIEM LAYOUT TABLE --- */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold tracking-wider border-b">
              <tr>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Threat Intel</th>
                <th className="px-6 py-4">Request Target</th>
                <th className="px-6 py-4">Attack Details</th>
                <th className="px-6 py-4">AI Anomaly</th>
                <th className="px-6 py-4">Classification</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading && logs.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-500">Loading events...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-500">No logs match your search.</td></tr>
              ) : logs.map((log, index) => {
                const eventTime = log.timestamp || log.raw_log?.timestamp;
                const isAnomalous = log.raw_log?.ai?.flagged;
                
                return (
                  <tr key={log.raw_log?.request_id || index} className="hover:bg-blue-50/50 transition-colors animate-fade-in group">
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600 font-mono text-xs align-top">
                      {eventTime ? new Date(eventTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
                    </td>

                    {/* --- VIRUSTOTAL LINK INTEGRATED HERE --- */}
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-1.5">
                        {log.source_ip === '127.0.0.1' ? (
                          <span className="font-mono font-bold text-blue-500">localhost</span>
                        ) : (
                          <a 
                            href={`https://www.virustotal.com/gui/search/${log.source_ip}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-bold text-gray-800 hover:text-blue-600 hover:underline transition-colors inline-flex items-center gap-1"
                            title="Analyze IP on VirusTotal"
                          >
                            {log.source_ip}
                            <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        )}
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="bg-gray-100 border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            {log.geo_location || 'UNK'}
                          </span>
                          {isAnomalous && (
                            <span className="text-red-500 font-bold uppercase tracking-wider flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> High Risk
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-gray-200 bg-gray-50 text-gray-600 uppercase">
                            {log.http_method}
                          </span>
                          <span className="font-mono text-[11px] text-gray-800 truncate max-w-[240px]" title={log.request_path}>
                            {log.request_path}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
                          <Server size={12} className="text-gray-300" /> 
                          {log.destination_ip || "Internal WAF"}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 align-top">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${log.attack_type === 'None' || log.attack_type === 'baseline_allow' ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                        {log.attack_type === 'None' || log.attack_type === 'baseline_allow' ? 'Clean Traffic' : log.attack_type}
                      </span>
                    </td>

                    <td className="px-6 py-4 align-top">
                      {isAnomalous ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-widest">ANOMALY</span>
                          <span className="text-xs font-mono font-bold bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded w-fit border border-purple-100">
                            {log.raw_log.ai.score?.toFixed(3)}
                          </span>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    <td className="px-6 py-4 align-top">
                      {typeof log.raw_log?.ai?.classification_score === "number" ? (
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${log.raw_log.ai.classification_blocked ? "text-red-700" : "text-green-700"}`}>
                            {log.raw_log.ai.classification_blocked ? "MALICIOUS" : "BENIGN"}
                          </span>
                          <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded w-fit border ${log.raw_log.ai.classification_blocked ? "bg-red-50 text-red-800 border-red-100" : "bg-green-50 text-green-800 border-green-100"}`}>
                            {log.raw_log.ai.classification_score.toFixed(3)}
                          </span>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    <td className="px-6 py-4 align-top">
                      <span className={`px-2 py-1 text-[10px] font-bold rounded border ${ACTION_CLASS[log.action_taken] || ACTION_CLASS.ALLOWED}`}>
                        {log.action_taken}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center align-top">
                      <div className="flex items-center justify-center gap-1.5 pt-1">
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
                        <button onClick={() => setSelectedLog(log)} className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors" title="Inspect Event">
                          <Eye size={18} />
                        </button>
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            Page <span className="font-bold">{currentPage}</span> of <span className="font-bold">{totalPages}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || (timeMode === "preset" && timePreset === "live")} className="p-2 rounded-lg border disabled:opacity-30">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || (timeMode === "preset" && timePreset === "live")} className="p-2 rounded-lg border disabled:opacity-30">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* --- EXPORT MODAL --- */}
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
                  <option value="baseline_allow">Clean / Normal Traffic Only</option>
                  <option disabled>──────────</option>
                  {dynamicFilters.attacks.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <button onClick={handleExport} disabled={isExporting} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                {isExporting ? <RefreshCw className="animate-spin" size={18} /> : <Download size={18} />}
                {isExporting ? 'Generating...' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLog && (
        <InspectorDrawer log={selectedLog} onClose={() => setSelectedLog(null)} onFeedbackSaved={(logId, label) => setFeedbackMap(prev => ({ ...prev, [logId]: label }))} />
      )}
    </div>
  );
};

export default EventsLog;