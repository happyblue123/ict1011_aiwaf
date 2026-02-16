// src/pages/TrafficAnalysis.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Legend
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Globe, Zap, Activity } from 'lucide-react';

const API_BASE_URL = "/api";

const MetricCard = ({ label, value, trend, isPositive }) => (
  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
    <div>
      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">{label}</p>
      <h3 className="text-2xl font-bold text-gray-800 mt-1">{value}</h3>
    </div>
    {trend ? (
      <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'} bg-gray-50 px-2 py-1 rounded-md`}>
        {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
        {trend}
      </div>
    ) : null}
  </div>
);

function fmtInt(n) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat().format(n);
}

function fmtMs(n) {
  if (n === null || n === undefined) return "-";
  return `${Math.round(n)} ms`;
}

export default function TrafficAnalysis() {
  const [range, setRange] = useState("24h"); // "24h" | "7d"
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");

      try {
        const r = await fetch(`${API_BASE_URL}/traffic/analysis?range=${encodeURIComponent(range)}`, {
          headers: { "Accept": "application/json" },
          credentials: "include",
        });

        if (!r.ok) {
          const txt = await r.text();
          throw new Error(txt || `HTTP ${r.status}`);
        }

        const json = await r.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load traffic analysis");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [range]);

  const timeseries = data?.timeseries ?? [];
  const threatRadar = data?.threat_radar ?? [];
  const geo = data?.geo ?? [];

  const topCountries = useMemo(() => geo.slice(0, 8), [geo]);

  const summary = data?.summary ?? {
    total_requests: null,
    avg_latency_ms: null,
    enforcement_actions: null,
    rate_limited: null,
    ai_flagged: null,
  };

  // If you want to show "trend", you need previous period comparison.
  // For now we keep it clean: no fake trends.
  const showTrend = false;

  return (
    <div className="space-y-6">

      {/* Header row: range selector + status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Traffic Analysis</h2>
          <p className="text-xs text-gray-500 mt-1">
            Aggregated from event_logs.raw_log (mode/protect, decision.action, latency_ms, attack_type, client_ip).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="text-sm border-gray-200 border rounded-md px-3 py-2 text-gray-700 outline-none bg-white"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>
      </div>

      {/* Error / Loading */}
      {err ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {err}
        </div>
      ) : null}

      {/* 1. Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          label="Total Requests"
          value={loading ? "…" : fmtInt(summary.total_requests)}
          trend={showTrend ? "+0.0%" : ""}
          isPositive
        />
        <MetricCard
          label="Avg Latency"
          value={loading ? "…" : fmtMs(summary.avg_latency_ms)}
          trend={showTrend ? "-0.0%" : ""}
          isPositive
        />
        <MetricCard
          label="Rate Limited"
          value={loading ? "…" : fmtInt(summary.rate_limited)}
          trend={showTrend ? "+0.0%" : ""}
          isPositive={false}
        />
      </div>

      {/* 2. Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">

        {/* Left: Requests Area Chart (2/3 width) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Activity size={18} className="text-indigo-500" /> Traffic Volume ({range})
            </h3>
          </div>

          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseries}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEnforced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                <Legend iconType="circle" />

                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorTotal)"
                  name="Total Requests"
                />

                <Area
                  type="monotone"
                  dataKey="enforced"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorEnforced)"
                  name="Enforcement Actions"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Threat Radar (1/3 width) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <Zap size={18} className="text-orange-500" /> Threat Vector Shape
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Counts by attack_type (falls back to decision.action when attack_type is missing).
          </p>

          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={threatRadar}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} />
                <PolarRadiusAxis angle={30} domain={[0, Math.max(5, ...(threatRadar.map(x => x.value || 0)))]} tick={false} axisLine={false} />
                <Radar name="Count" dataKey="value" stroke="#f43f5e" strokeWidth={2} fill="#f43f5e" fillOpacity={0.5} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Bottom Geo-Distribution Row */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Globe size={18} className="text-blue-500" /> Geographic Distribution
        </h3>

        {/* Only show warning if NOT loading and geoip is explicitly disabled */}
        {!loading && data && !data.geoip_enabled && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            GeoIP is not enabled on the backend (GeoLite2 database not found). 
            Showing "Local/Private" and "Unknown".
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
              // Show placeholders during load
              [...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg"></div>
              ))
          ) : topCountries.length === 0 ? (
            <div className="text-sm text-gray-500 col-span-full py-4 text-center">
              No geo data available for this range.
            </div>
          ) : (
            topCountries.map((row) => (
              <div key={row.country} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{row.flag || "🏳️"}</span>
                  <span className="text-sm font-medium text-gray-700">{row.country}</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{fmtInt(row.count)}</span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
