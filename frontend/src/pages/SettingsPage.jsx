// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import {
  User,
  Bell,
  Lock,
  Shield,
  Key,
  Globe,
  Smartphone,
  Mail,
  Save,
  Loader2,
  CheckCircle2
} from 'lucide-react';

const Toggle = ({ enabled, setEnabled }) => (
  <button
    onClick={() => setEnabled(!enabled)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      enabled ? 'bg-blue-600' : 'bg-gray-200'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const SectionHeader = ({ icon: Icon, title, description }) => (
  <div className="mb-6">
    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
      <Icon size={20} className="text-blue-500" />
      {title}
    </h3>
    <p className="text-sm text-gray-500 ml-7">{description}</p>
  </div>
);

const SettingsPage = () => {
  // Profile
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('analyst');
  const [newPassword, setNewPassword] = useState('');

  // WAF
  const [wafMode, setWafMode] = useState('protect');

  // Toggles
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [geoBlocking, setGeoBlocking] = useState(true);
  const [rateLimiting, setRateLimiting] = useState(true);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ── Fetch settings on mount ───────────────────────────
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const res = await fetch('/api/settings', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();

        // Profile
        setUsername(data.profile?.username || '');
        setRole(data.profile?.role || 'analyst');

        // WAF
        setWafMode(data.waf?.waf_mode || 'protect');

        // Toggles
        setEmailAlerts(data.toggles?.email_alerts ?? true);
        setSmsAlerts(data.toggles?.sms_alerts ?? false);
        setGeoBlocking(data.toggles?.geo_blocking ?? true);
        setRateLimiting(data.toggles?.rate_limiting ?? true);
      } catch (err) {
        console.error(err);
        setErrorMessage('Could not load settings. Is the database configured?');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // ── Save settings ─────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage('');

    const body = {
      profile: newPassword ? { new_password: newPassword } : undefined,
      waf: { waf_mode: wafMode },
      toggles: {
        email_alerts: emailAlerts,
        sms_alerts: smsAlerts,
        geo_blocking: geoBlocking,
        rate_limiting: rateLimiting,
      },
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Save failed');
      }
      setNewPassword('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">System Configuration</h1>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <CheckCircle2 size={16} /> Saved
            </span>
          )}
          {errorMessage && (
            <span className="text-red-500 text-sm font-medium">{errorMessage}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-black transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Profile & WAF Mode */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <SectionHeader icon={User} title="Analyst Profile" description="Manage your account details." />

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  disabled
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Role</label>
                <input
                  type="text"
                  value={role}
                  disabled
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed capitalize"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <SectionHeader icon={Key} title="WAF Mode" description="Switch between protect and shadow mode." />
            <div className="space-y-3">
              {['protect', 'shadow'].map((mode) => (
                <label
                  key={mode}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    wafMode === mode ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="wafMode"
                    value={mode}
                    checked={wafMode === mode}
                    onChange={() => setWafMode(mode)}
                    className="accent-blue-600"
                  />
                  <div>
                    <p className="text-sm font-bold text-gray-800 capitalize">{mode}</p>
                    <p className="text-xs text-gray-500">
                      {mode === 'protect'
                        ? 'Actively blocks malicious requests.'
                        : 'Logs threats without blocking them.'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Middle & Right: Notifications + Security */}
        <div className="lg:col-span-2 space-y-6">

          {/* Notifications */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <SectionHeader icon={Bell} title="Alert Notifications" description="Configure how you receive critical security alerts." />

            <div className="space-y-4 divide-y divide-gray-100">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Mail size={18} /></div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">Email Reports</p>
                    <p className="text-xs text-gray-500">Receive daily summaries and high-priority alerts.</p>
                  </div>
                </div>
                <Toggle enabled={emailAlerts} setEnabled={setEmailAlerts} />
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Smartphone size={18} /></div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">SMS / PagerDuty</p>
                    <p className="text-xs text-gray-500">Immediate alerts for DDoS attacks exceeding 1Gbps.</p>
                  </div>
                </div>
                <Toggle enabled={smsAlerts} setEnabled={setSmsAlerts} />
              </div>
            </div>
          </div>

          {/* Security & Mitigation */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <SectionHeader icon={Shield} title="Global Security Policies" description="Apply system-wide protection rules." />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <Globe size={20} className="text-gray-400" />
                  <Toggle enabled={geoBlocking} setEnabled={setGeoBlocking} />
                </div>
                <h4 className="font-bold text-sm text-gray-800">Geo-Blocking</h4>
                <p className="text-xs text-gray-500 mt-1">Automatically block traffic from high-risk regions based on threat intel.</p>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <Lock size={20} className="text-gray-400" />
                  <Toggle enabled={rateLimiting} setEnabled={setRateLimiting} />
                </div>
                <h4 className="font-bold text-sm text-gray-800">Strict Rate Limiting</h4>
                <p className="text-xs text-gray-500 mt-1">Enforce aggressive API limits on unauthenticated endpoints.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
