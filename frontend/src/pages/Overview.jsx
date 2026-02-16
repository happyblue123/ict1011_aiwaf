import React, { useState, useEffect, useMemo } from "react";
import {
  Globe,
  ShieldAlert,
  BrainCircuit,
  Activity,
  CheckCircle2,
  Target,
  AlertTriangle,
  RefreshCw,
  Server,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";

// --- Constants ---
const COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#10B981", "#3B82F6"];
const IP_COLORS = ["#10B981", "#EF4444"];

export default function Overview() {
  const [logs, setLogs] = useState([]); 
  const [ipCounts, setIpCounts] = useState({ whitelist: 0, blacklist: 0 });
  const [aiStats, setAiStats] = useState({
    baseline_count: 0,
    last_trained_at: null,
  });
  const [loading, setLoading] = useState(true);

  // 1. Fetch Data
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/get-overview?range=24h");
      const data = await response.json();

      // Use window_logs for analytics calculation
      const chartLogs = data.window_logs || [];
      const sortedLogs = [...chartLogs].sort((a, b) => new Date(a.ts) - new Date(b.ts));

      setLogs(sortedLogs);
      setIpCounts(data.ip_policy_counts || { whitelist: 0, blacklist: 0 });
      setAiStats(data.ai_training_stats || { baseline_count: 0, last_trained_at: null });
    } catch (error) {
      console.error("Failed to load overview data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // 2. Computed Metrics (KPIs)
  const stats = useMemo(() => {
    const total = logs.length;
    const blocked = logs.filter((l) => l.decision?.action === "block").length;
    const aiFlagged = logs.filter((l) => l.ai?.flagged === true).length;
    const monitor = logs.filter((l) => l.mode === "monitor").length;
    const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : 0;
    
    return { total, blocked, aiFlagged, monitor, blockRate };
  }, [logs]);

  // 3. Chart Data Preparation
  const timelineData = useMemo(() => {
    const grouped = {};
    logs.forEach((log) => {
      if (!log.ts) return;
      const date = new Date(log.ts);
      const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      
      if (!grouped[time]) grouped[time] = { time, signature: 0, aiAnomaly: 0 };
      
      if (log.ai?.flagged) {
        grouped[time].aiAnomaly += 1;
      } else if (log.decision?.action === "block") {
        grouped[time].signature += 1;
      }
    });
    return Object.values(grouped).slice(-20);
  }, [logs]);

  const attackDistData = useMemo(() => {
    const counts = {};
    logs.forEach((log) => {
      if (log.decision?.action === "block") {
        const rawReason = log.decision?.reasons?.[0] || "Unknown";
        const type = rawReason.split(":")[0]; 
        counts[type] = (counts[type] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: name.toUpperCase(), value }))
      .sort((a, b) => b.value - a.value);
  }, [logs]);

  const ipPolicyData = useMemo(
    () => [
      { name: "Whitelist", value: ipCounts.whitelist },
      { name: "Blacklist", value: ipCounts.blacklist },
    ],
    [ipCounts]
  );

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-gray-500">
        <RefreshCw className="animate-spin mb-2" size={32} />
        <p>Loading Dashboard Analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* HEADER */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Security Overview</h2>
          <p className="text-sm text-gray-500">Real-time analysis from Neuro-WAF Engine</p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
        >
          <RefreshCw size={14} /> Refresh Data
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase mb-1">Total Requests</div>
            <div className="text-3xl font-extrabold text-gray-800">{stats.total.toLocaleString()}</div>
            <div className="flex items-center gap-1 text-green-600 text-xs font-medium mt-2 bg-green-50 px-2 py-0.5 rounded-full w-fit">
              <Activity size={12} /> Live
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Globe size={24} /></div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase mb-1">Threats Blocked</div>
            <div className="text-3xl font-extrabold text-gray-800">{stats.blocked.toLocaleString()}</div>
            <div className="text-xs text-red-500 mt-2 font-medium">{stats.blockRate}% Block Rate</div>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-lg"><ShieldAlert size={24} /></div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase mb-1">AI Anomalies</div>
            <div className="text-3xl font-extrabold text-gray-800">{stats.aiFlagged.toLocaleString()}</div>
            <div className="text-xs text-purple-600 mt-2 font-medium">Neuro-Engine Active</div>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><BrainCircuit size={24} /></div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase mb-1">System Status</div>
            <div className="text-xl font-bold text-emerald-600 flex items-center gap-2 mt-1">
              <CheckCircle2 size={20} /> Operational
            </div>
            <div className="text-xs text-gray-400 mt-2">Mode: {stats.monitor > 0 ? "Hybrid" : "Protect"}</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><Activity size={24} /></div>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2">
          <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Activity size={18} className="text-indigo-500" /> Traffic & Threat Volume
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f3f4f6", opacity: 0.5 }} contentStyle={{ borderRadius: "8px", border: "none" }} />
                <Bar dataKey="signature" stackId="a" fill="#3B82F6" radius={[0, 0, 2, 2]} />
                <Bar dataKey="aiAnomaly" stackId="a" fill="#8B5CF6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <Target size={18} className="text-red-500" /> Threat Vectors
          </h3>
          <div className="flex-1 w-full min-h-[250px] relative">
            {attackDistData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attackDistData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                    {attackDistData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <CheckCircle2 size={32} className="text-green-200 mb-2" />
                <span className="text-sm">No threats detected</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-orange-500" /> High-Risk Paths
          </h3>
          <div className="flex flex-col gap-3">
            {Object.entries(
              logs.filter((l) => l.decision?.action === "block").reduce((acc, l) => {
                const path = l.normalized_path || l.raw_target_wire || "/";
                acc[path] = (acc[path] || 0) + 1;
                return acc;
              }, {})
            ).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([path, count], idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="text-xs font-medium text-gray-700 truncate w-32">{path}</div>
                </div>
                <div className="text-[10px] font-bold text-gray-900 bg-white px-1.5 py-0.5 rounded border">{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <ShieldAlert size={18} className="text-gray-600" /> IP Enforcement
          </h3>
          <div className="flex-1 w-full min-h-[160px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ipPolicyData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">
                  {ipPolicyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={IP_COLORS[index % IP_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: "10px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <BrainCircuit size={18} className="text-purple-500" /> Neuro-Engine
          </h3>
          <div className="flex-1 flex flex-col justify-center gap-4">
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
              <div className="text-xs text-purple-600 font-semibold mb-1 uppercase">Training Samples</div>
              <div className="text-3xl font-bold text-gray-800">{aiStats.baseline_count}</div>
            </div>
            <div className="px-4 py-3 bg-gray-50 rounded-lg border">
              <div className="text-xs text-gray-500 mb-1">Last Retrained</div>
              <div className="text-sm font-semibold text-gray-800">
                {aiStats.last_trained_at ? new Date(aiStats.last_trained_at).toLocaleString() : "Waiting for data..."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}