// View of DDos attack statistics and mitigation controls
// src/pages/DDoSDashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { 
  Zap, 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  Settings2, 
  MapPin, 
  Clock
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

const defaultTraffic = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  currentRPS: 0,
  baselineRPS: 0,
  dropped: 0,
}));

const DDoSDashboard = () => {
  const [isMitigationActive, setMitigation] = useState(true);
  const [mode, setMode] = useState('Adaptive AI Rate-Limiting');
  const [modules, setModules] = useState([]);
  const [trafficData, setTrafficData] = useState(defaultTraffic);
  const [topAttackers, setTopAttackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingModules, setSavingModules] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const statusLabel = useMemo(() => (
    isMitigationActive ? 'Active & Filtering' : 'Monitoring Only'
  ), [isMitigationActive]);

  const fetchOverview = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/ddos/overview', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to load DDoS overview.');
      }
      const data = await response.json();
      setMitigation(Boolean(data?.status?.is_active));
      setMode(data?.status?.mode || 'Adaptive AI Rate-Limiting');
      setModules(data?.status?.modules || []);
      setTrafficData(data?.traffic || defaultTraffic);
      setTopAttackers(data?.top_attackers || []);
    } catch (error) {
      setErrorMessage(error.message || 'Failed to load DDoS overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleToggleMitigation = async () => {
    const next = !isMitigationActive;
    setMitigation(next);
    setErrorMessage('');

    try {
      const response = await fetch('/api/ddos/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: next }),
      });
      if (!response.ok) {
        throw new Error('Failed to update mitigation status.');
      }
      const data = await response.json();
      setMitigation(Boolean(data?.is_active));
      setMode(data?.mode || 'Adaptive AI Rate-Limiting');
      setModules(data?.modules || []);
    } catch (error) {
      setErrorMessage(error.message || 'Failed to update mitigation status.');
    }
  };

  const handleToggleModule = async (label) => {
    if (!label || savingModules) {
      return;
    }
    const nextModules = (modules.length ? modules : [
      { label: 'Volumetric Rate Limiter', active: true },
      { label: 'Behavioral Bot Detection', active: true },
      { label: 'Zombie-Request Filtering', active: false },
    ]).map((mod) => (
      mod.label === label ? { ...mod, active: !mod.active } : mod
    ));

    setModules(nextModules);
    setSavingModules(true);
    setErrorMessage('');
    try {
      const response = await fetch('/api/ddos/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ modules: nextModules }),
      });
      if (!response.ok) {
        throw new Error('Failed to update modules.');
      }
      const data = await response.json();
      setModules(data?.modules || nextModules);
    } catch (error) {
      setErrorMessage(error.message || 'Failed to update modules.');
      await fetchOverview();
    } finally {
      setSavingModules(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Mitigation Status Header */}
      <div className={`p-6 rounded-xl border flex items-center justify-between transition-colors ${
        isMitigationActive ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${isMitigationActive ? 'bg-green-500' : 'bg-amber-500'} text-white`}>
            {isMitigationActive ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              DDoS Protection: {statusLabel}
            </h2>
            <p className="text-sm text-gray-600">
              Current Mode: <span className="font-semibold">{mode}</span>
            </p>
          </div>
        </div>
        <button 
          onClick={handleToggleMitigation}
          className={`px-6 py-2 rounded-lg font-bold text-white transition-all ${
            isMitigationActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isMitigationActive ? 'DISABLE MITIGATION' : 'ENABLE MITIGATION'}
        </button>
      </div>

      {(loading || errorMessage) && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {loading ? 'Loading DDoS telemetry...' : errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 2. Main Chart: Requests vs Baseline */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Activity size={18} className="text-blue-500" /> Real-time Traffic vs. Baseline
              </h3>
              <p className="text-xs text-gray-400">Comparing live RPS against trained application behavior</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData}>
                <defs>
                  <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDropped" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <Tooltip />
                <Area type="monotone" dataKey="baselineRPS" stroke="#94a3b8" fill="transparent" strokeDasharray="5 5" name="Baseline (Normal)" />
                <Area type="monotone" dataKey="currentRPS" stroke="#3B82F6" fillOpacity={1} fill="url(#colorCurrent)" name="Live Requests" />
                <Area type="monotone" dataKey="dropped" stroke="#EF4444" fillOpacity={1} fill="url(#colorDropped)" name="AI Dropped Traffic" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. AI Threshold Tuning (Unique Value Prop) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings2 size={18} className="text-purple-500" /> Mitigation Modules
          </h3>
          <div className="flex-1 space-y-8">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Modules</h4>
              {(modules.length ? modules : [
                { label: 'Volumetric Rate Limiter', active: true },
                { label: 'Behavioral Bot Detection', active: true },
                { label: 'Zombie-Request Filtering', active: false },
              ]).map((mod) => (
                <button
                  key={mod.label}
                  type="button"
                  onClick={() => handleToggleModule(mod.label)}
                  className="flex items-center justify-between text-sm w-full text-left"
                >
                  <span className="text-gray-600">{mod.label}</span>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${mod.active ? 'bg-blue-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-1 w-2 h-2 bg-white rounded-full transition-all ${mod.active ? 'right-1' : 'left-1'}`}></div>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* 4. Top Malicious Sources Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Top Anomalous Traffic Sources</h3>
        </div>
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
            <tr>
              <th className="px-6 py-4">Source IP</th>
              <th className="px-6 py-4">Region</th>
              <th className="px-6 py-4">Peak RPS</th>
              <th className="px-6 py-4">AI Anomaly Score</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {topAttackers.map((attacker) => (
              <tr key={attacker.ip} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-mono text-sm font-bold text-gray-700">{attacker.ip}</td>
                <td className="px-6 py-4 text-sm text-gray-600 flex items-center gap-2">
                  <MapPin size={14} /> {attacker.region}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-red-500">{attacker.rps} r/s</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-24">
                      <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${attacker.score * 100}%` }}></div>
                    </div>
                    <span className="text-xs font-bold text-purple-600">{attacker.score}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-[10px] font-bold rounded ${
                    attacker.action === 'BLOCKED'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {attacker.action}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DDoSDashboard;