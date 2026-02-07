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
  // NEW: Add state for IP Policy Counts
  const [ipCounts, setIpCounts] = useState({ whitelist: 0, blacklist: 0 });
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/get-overview");
      const data = await response.json();

      // ... existing log parsing logic ...
      const parsedLogs = (data.recent_events || [])
        .map((event) => event.raw_log)
        .filter(Boolean)
        .sort((a, b) => new Date(a.ts) - new Date(b.ts));

      setLogs(parsedLogs);

      // NEW: Set IP Policy Counts from API
      setIpCounts(data.ip_policy_counts || { whitelist: 0, blacklist: 0 });
    } catch (error) {
      console.error("Failed to load logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // 2. Compute Metrics (Memoized for performance)
  const stats = useMemo(() => {
    const total = logs.length;
    const blocked = logs.filter((l) => l.decision?.action === "block").length;
    const aiFlagged = logs.filter((l) => l.ai?.flagged).length;
    const monitor = logs.filter((l) => l.mode === "monitor").length;

    // Calculate Block Rate
    const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : 0;

    return { total, blocked, aiFlagged, monitor, blockRate };
  }, [logs]);

  // 3. Prepare Chart Data
  const timelineData = useMemo(() => {
    // Group by Minute (HH:MM)
    const grouped = {};
    logs.forEach((log) => {
      const time = new Date(log.ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (!grouped[time]) grouped[time] = { time, signature: 0, aiAnomaly: 0 };

      // Categorize: If blocked by AI reason vs Standard reason
      // (Simplified logic: if AI flagged it, count as AI, otherwise Signature)
      if (log.ai?.flagged) {
        grouped[time].aiAnomaly += 1;
      } else if (log.decision?.action === "block") {
        grouped[time].signature += 1;
      }
    });
    // Return last 10 minutes or all data
    return Object.values(grouped).slice(-15);
  }, [logs]);

  const attackDistData = useMemo(() => {
    const counts = {};
    logs.forEach((log) => {
      if (log.decision?.action === "block") {
        // Extract primary reason (e.g. "sqli" from "sqli:boolean_based")
        const type = log.decision?.reasons?.[0]?.split(":")[0] || "Unknown";
        counts[type] = (counts[type] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
    }));
  }, [logs]);

  const COLORS = ["#F59E0B", "#EF4444", "#8B5CF6", "#10B981", "#3B82F6"];

  const ipPolicyData = useMemo(
    () => [
      { name: "Whitelist", value: ipCounts.whitelist },
      { name: "Blacklist", value: ipCounts.blacklist },
    ],
    [ipCounts],
  );

  const IP_COLORS = ["#10B981", "#EF4444"]; // Emerald for Allow, Red for Block

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-gray-500">
        <RefreshCw className="animate-spin mb-2" size={32} />
        <p>Loading Dashboard Analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 1. Header & Actions */}
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

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Traffic */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between relative overflow-hidden">
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

        {/* Card 2: Threats Blocked */}
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

        {/* Card 3: AI Detections */}
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

        {/* Card 4: System Health */}
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

      {/* 3. Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Hybrid Timeline (2/3 width) */}
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

        {/* Right: Attack Distribution (1/3 width) */}
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

            {/* Center Text for Donut */}
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

      {/* 4. High Risk Endpoints (Dynamic List) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: High Risk Endpoints (Takes 2/3 width) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 lg:col-span-2">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-orange-500" /> High-Risk
            Endpoints
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              .slice(0, 4)
              .map(([path, count], idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="font-mono text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded border border-orange-200 shrink-0">
                      #{idx + 1}
                    </div>
                    <div
                      className="text-sm font-medium text-gray-700 truncate"
                      title={path}
                    >
                      {path}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-gray-900 bg-white px-2 py-1 rounded shadow-sm border border-gray-100">
                    {count} Attacks
                  </div>
                </div>
              ))}
            {stats.blocked === 0 && (
              <div className="col-span-2 text-center py-4 text-gray-400 text-sm italic">
                System clean. No high-risk endpoints identified.
              </div>
            )}
          </div>
        </div>

        {/* Right: IP Policy Donut Chart (Takes 1/3 width) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
            <ShieldAlert size={18} className="text-gray-600" /> IP Enforcement
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Active firewall rules distribution.
          </p>

          <div className="flex-1 w-full min-h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ipPolicyData}
                  innerRadius={55}
                  outerRadius={75}
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
                  height={36}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Text for Donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
              <span className="text-2xl font-bold text-gray-800">
                {ipCounts.whitelist + ipCounts.blacklist}
              </span>
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">
                Rules
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
