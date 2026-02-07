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

export default function Overview() {
  const [logs, setLogs] = useState([]);
  const [ipCounts, setIpCounts] = useState({ whitelist: 0, blacklist: 0 });
  const [aiStats, setAiStats] = useState({
    baseline_count: 0,
    last_trained_at: null,
  });
  const [loading, setLoading] = useState(true);

  // 1. Fetch & Parse Data
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/get-overview");
      const data = await response.json();

      // Parse Logs
      const parsedLogs = (data.recent_events || [])
        .map((event) => event.raw_log)
        .filter(Boolean)
        .sort((a, b) => new Date(a.ts) - new Date(b.ts));

      setLogs(parsedLogs);

      // Parse IP Counts
      setIpCounts(data.ip_policy_counts || { whitelist: 0, blacklist: 0 });

      // Parse AI Training Stats (Coming from retrain_state.json via API)
      setAiStats(
        data.ai_training_stats || {
          baseline_count: 0,
          last_trained_at: null,
        },
      );
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // 2. Compute Metrics
  const stats = useMemo(() => {
    const total = logs.length;
    const blocked = logs.filter((l) => l.decision?.action === "block").length;
    const aiFlagged = logs.filter((l) => l.ai?.flagged).length;
    const monitor = logs.filter((l) => l.mode === "monitor").length;
    const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : 0;
    return { total, blocked, aiFlagged, monitor, blockRate };
  }, [logs]);

  // 3. Prepare Chart Data
  const timelineData = useMemo(() => {
    const grouped = {};
    logs.forEach((log) => {
      const time = new Date(log.ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (!grouped[time]) grouped[time] = { time, signature: 0, aiAnomaly: 0 };
      if (log.ai?.flagged) {
        grouped[time].aiAnomaly += 1;
      } else if (log.decision?.action === "block") {
        grouped[time].signature += 1;
      }
    });
    return Object.values(grouped).slice(-15);
  }, [logs]);

  const attackDistData = useMemo(() => {
    const counts = {};
    logs.forEach((log) => {
      if (log.decision?.action === "block") {
        const type = log.decision?.reasons?.[0]?.split(":")[0] || "Unknown";
        counts[type] = (counts[type] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
    }));
  }, [logs]);

  // IP Policy Chart Data
  const ipPolicyData = useMemo(
    () => [
      { name: "Whitelist", value: ipCounts.whitelist },
      { name: "Blacklist", value: ipCounts.blacklist },
    ],
    [ipCounts],
  );

  const COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#10B981", "#3B82F6"];
  const IP_COLORS = ["#10B981", "#EF4444"];

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
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">
            Security Overview
          </h2>
          <p className="text-sm text-gray-500">
            Real-time analysis from Neuro-WAF Engine
          </p>
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
        {/* Total Traffic */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Total Requests
            </div>
            <div className="text-3xl font-extrabold text-gray-800">
              {stats.total.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-green-600 text-xs font-medium mt-2 bg-green-50 px-2 py-0.5 rounded-full w-fit">
              <Activity size={12} /> Live
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Globe size={40} />
          </div>
        </div>

        {/* Threats Blocked */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Threats Blocked
            </div>
            <div className="text-3xl font-extrabold text-gray-800">
              {stats.blocked.toLocaleString()}
            </div>
            <div className="text-xs text-red-500 mt-2 font-medium">
              {stats.blockRate}% of total traffic
            </div>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-lg">
            <ShieldAlert size={40} />
          </div>
        </div>

        {/* AI Anomalies */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              AI Anomalies
            </div>
            <div className="text-3xl font-extrabold text-gray-800">
              {stats.aiFlagged.toLocaleString()}
            </div>
            <div className="text-xs text-purple-600 mt-2 font-medium">
              Neuro-Engine Active
            </div>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <BrainCircuit size={40} />
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              System Status
            </div>
            <div className="text-xl font-bold text-emerald-600 flex items-center gap-2 mt-1">
              <CheckCircle2 size={20} /> Operational
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Mode: {stats.monitor > 0 ? "Hybrid" : "Protect"}
            </div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Activity size={40} />
          </div>
        </div>
      </div>

      {/* MAIN CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Activity size={18} className="text-indigo-500" /> Traffic &
              Threat Volume
            </h3>
            <div className="flex gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span>{" "}
                Signature Block
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-500"></span>{" "}
                AI Anomaly
              </span>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} barSize={12}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f3f4f6"
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "#f3f4f6", opacity: 0.5 }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                />
                <Bar
                  dataKey="signature"
                  stackId="a"
                  fill="#3B82F6"
                  radius={[0, 0, 2, 2]}
                />
                <Bar
                  dataKey="aiAnomaly"
                  stackId="a"
                  fill="#8B5CF6"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Attack Distribution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <Target size={18} className="text-red-500" /> Threat Vectors
          </h3>
          <p className="text-xs text-gray-500 mb-6">
            Distribution by attack category.
          </p>
          <div className="flex-1 w-full min-h-[250px] relative">
            {attackDistData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attackDistData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {attackDistData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <CheckCircle2 size={32} className="text-green-200 mb-2" />
                <span className="text-sm">No threats detected yet</span>
              </div>
            )}
            {attackDistData.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                <span className="text-3xl font-bold text-gray-800">
                  {stats.blocked}
                </span>
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                  Blocked
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. THREE COLUMN BOTTOM LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COL 1: High Risk Endpoints */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-orange-500" /> High-Risk
            Paths
          </h3>
          <div className="flex flex-col gap-3">
            {Object.entries(
              logs
                .filter((l) => l.decision?.action === "block")
                .reduce((acc, l) => {
                  const path =
                    l.raw_target_wire || l.normalized_path || "Unknown";
                  acc[path] = (acc[path] || 0) + 1;
                  return acc;
                }, {}),
            )
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4) // Show top 4
              .map(([path, count], idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="font-mono text-[10px] text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded border border-orange-200 shrink-0">
                      #{idx + 1}
                    </div>
                    <div
                      className="text-xs font-medium text-gray-700 truncate w-32"
                      title={path}
                    >
                      {path}
                    </div>
                  </div>
                  <div className="text-[10px] font-bold text-gray-900 bg-white px-1.5 py-0.5 rounded shadow-sm border border-gray-100">
                    {count}
                  </div>
                </div>
              ))}
            {stats.blocked === 0 && (
              <div className="text-center py-8 text-gray-400 text-xs italic">
                No high-risk paths detected.
              </div>
            )}
          </div>
        </div>

        {/* COL 2: IP Policy Donut */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <ShieldAlert size={18} className="text-gray-600" /> IP Enforcement
          </h3>
          <p className="text-xs text-gray-500 mb-2">Active firewall rules.</p>

          <div className="flex-1 w-full min-h-[160px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ipPolicyData}
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {ipPolicyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={IP_COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  height={24}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "10px" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
              <span className="text-xl font-bold text-gray-800">
                {ipCounts.whitelist + ipCounts.blacklist}
              </span>
            </div>
          </div>
        </div>

        {/* COL 3: AI Training Stats (FROM retrain_state.json) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <BrainCircuit size={18} className="text-purple-500" /> Neuro-Engine
          </h3>

          <div className="flex-1 flex flex-col justify-center gap-4">
            {/* Stat 1: Dataset Size */}
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 relative overflow-hidden">
              <div className="text-xs text-purple-600 font-semibold uppercase tracking-wider mb-1">
                Training Samples
              </div>
              <div className="text-3xl font-bold text-gray-800">
                {aiStats.baseline_count}
              </div>
              <div className="absolute right-0 bottom-0 opacity-10 p-2">
                <Activity size={64} className="text-purple-900" />
              </div>
            </div>

            {/* Stat 2: Last Trained */}
            <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="text-xs text-gray-500 font-medium mb-1">
                Last Retrained
              </div>
              <div className="text-sm font-semibold text-gray-800">
                {aiStats.last_trained_at
                  ? new Date(aiStats.last_trained_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Waiting for data..."}
              </div>
            </div>

            {/* Live Indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              Model Live & Learning
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
