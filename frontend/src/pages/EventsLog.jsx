import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw, Eye, X, Server, ChevronLeft, ChevronRight, ShieldAlert, Clock, Calendar, Zap
} from 'lucide-react';

const API_BASE_URL = "/api";

const ACTION_CLASS = {
  BLOCKED: 'bg-red-100 text-red-700 border-red-200',
  ALLOWED: 'bg-green-100 text-green-700 border-green-200',
  FLAGGED: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

const EventsLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Time filters
  const [timeMode, setTimeMode] = useState("preset");
  const [timePreset, setTimePreset] = useState("24h");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // ✅ Live anchor time (so polling returns logs AFTER you enter live mode)
  const [liveStartTime, setLiveStartTime] = useState(null);

  const [selectedLog, setSelectedLog] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Live polling
  const liveIntervalRef = useRef(null);

  // ✅ When user selects live preset, capture a stable anchor timestamp
  const onTimePresetChange = (e) => {
    const v = e.target.value;
    setTimePreset(v);

    if (v === "live") {
      const nowIso = new Date().toISOString(); // backend should parse ISO
      setLiveStartTime(nowIso);
      setLogs([]);            // visual “fresh stream”
      setCurrentPage(1);      // live mode should stay on page 1
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
        page: isLive ? 1 : currentPage,   // ✅ force page 1 for live
        time_mode: timeMode,
      };

      // ✅ Live mode: use AFTER with the captured anchor
      if (isLive) {
        if (!liveStartTime) return; // not ready
        queryParams.time_mode = "after";
        queryParams.start_date = liveStartTime;
      }
      // Normal preset ranges
      else if (timeMode === "preset") {
        queryParams.time_preset = timePreset;
      }

      // Custom ranges
      if (timeMode === 'after' || timeMode === 'between') queryParams.start_date = startDate;
      if (timeMode === 'before' || timeMode === 'between') queryParams.end_date = endDate;

      const query = new URLSearchParams(queryParams).toString();
      const res = await fetch(`${API_BASE_URL}/logs?${query}`, { credentials: "include" });

      if (!res.ok) throw new Error(`Server Error: ${res.status}`);

      const data = await res.json();

      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotalPages(data.pagination?.total_pages || 1);

      // keep UI page consistent in live mode
      if (isLive) setCurrentPage(1);

    } catch (err) {
      console.error("Failed to load logs:", err);
      setLogs([]);
      setTotalPages(1);
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  };

  // reset page when filters change (but live forces page 1 anyway)
  useEffect(() => { setCurrentPage(1); }, [timeMode, timePreset, startDate, endDate]);

  // fetch + live polling
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
                  timePreset === 'live'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-gray-200 bg-gray-50 text-gray-700'
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

          {(timeMode === 'after' || timeMode === 'between') && (
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm w-48" step="1"
              />
            </div>
          )}

          {timeMode === 'between' && <span className="text-gray-400 text-xs font-bold uppercase">TO</span>}

          {(timeMode === 'before' || timeMode === 'between') && (
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm w-48" step="1"
              />
            </div>
          )}

          <button onClick={() => fetchLogs()} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600">
            <RefreshCw size={18} className={timePreset === 'live' ? "animate-spin" : ""} />
          </button>
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
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-500">Loading events...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="8" className="p-8 text-center text-gray-500">
                  {timePreset === 'live' ? "Waiting for new real-time events..." : "No logs found."}
                </td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="hover:bg-blue-50/50 transition-colors animate-fade-in">
                  <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-mono text-xs">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                  </td>

                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gray-700">{log.source_ip}</span>
                      <span className="text-[10px] bg-gray-200 px-1.5 rounded text-gray-600">{log.geo_location}</span>
                    </div>
                  </td>

                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <Server size={14} className="text-gray-400" />
                      <span className="font-mono text-gray-600">
                        {log.destination_ip || "—"}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-3">
                    <span className="px-2 py-1 text-[10px] font-bold rounded border border-gray-200 bg-gray-50 text-gray-700">
                      {log.http_method || "—"}
                    </span>
                  </td>

                  <td className="px-6 py-3">
                    <div
                      className="font-mono text-[11px] text-gray-700 truncate max-w-[260px]"
                      title={log.request_path || ""}
                    >
                      {log.request_path || "—"}
                    </div>
                  </td>

                  <td className="px-6 py-3">
                    <span
                      className={`text-xs font-bold ${
                        log.attack_type === 'None'
                          ? 'text-gray-400'
                          : log.attack_type === 'baseline_allow'
                            ? 'text-gray-300'
                            : 'text-red-600'
                      }`}
                    >
                      {log.attack_type === 'baseline_allow'
                        ? '—'
                        : log.attack_type === 'None'
                          ? 'Clean'
                          : log.attack_type}
                    </span>
                  </td>

                  <td className="px-6 py-3">
                    <span className={`px-2 py-1 text-[10px] font-bold rounded border ${
                      ACTION_CLASS[log.action_taken] || ACTION_CLASS.ALLOWED
                    }`}>
                      {log.action_taken}
                    </span>
                  </td>

                  <td className="px-6 py-3 text-center">
                    <button onClick={() => setSelectedLog(log)} className="text-gray-400 hover:text-blue-600">
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="text-xs text-gray-500">
            Page <span className="font-bold">{currentPage}</span> of <span className="font-bold">{totalPages || 1}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || (timeMode === "preset" && timePreset === "live")}
              className={`p-2 rounded-lg border ${
                (currentPage === 1 || (timeMode === "preset" && timePreset === "live"))
                  ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'text-gray-600 border-gray-300 hover:bg-white'
              }`}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0 || (timeMode === "preset" && timePreset === "live")}
              className={`p-2 rounded-lg border ${
                (currentPage === totalPages || totalPages === 0 || (timeMode === "preset" && timePreset === "live"))
                  ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                  : 'text-gray-600 border-gray-300 hover:bg-white'
              }`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* INSPECTOR */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col animate-slide-in-right">
            <div className="flex justify-between items-center mb-6 pb-4 border-b">
              <h2 className="text-xl font-bold text-gray-800">Event Details #{selectedLog.id}</h2>
              <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto">
              <div className="p-4 bg-gray-50 rounded font-mono text-sm space-y-2">
                <p><span className="font-bold text-gray-500">Time:</span> {selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : "—"}</p>
                <p><span className="font-bold text-gray-500">Source:</span> {selectedLog.source_ip} ({selectedLog.geo_location})</p>
                <p><span className="font-bold text-gray-500">Dest:</span> {selectedLog.destination_ip}</p>
                <p><span className="font-bold text-gray-500">Method:</span> {selectedLog.http_method || "—"}</p>
                <p><span className="font-bold text-gray-500">Params:</span> {selectedLog.request_params || "—"}</p>
                <p><span className="font-bold text-gray-500">Path:</span><br />{selectedLog.request_path}</p>

                <pre className="text-xs bg-gray-900 text-green-200 p-3 rounded overflow-auto">
{JSON.stringify(selectedLog.raw_log, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default EventsLog;
