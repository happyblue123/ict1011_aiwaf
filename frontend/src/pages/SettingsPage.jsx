// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import {
  User, Shield, Key, Globe, Save, Loader2, CheckCircle2, FileCode, Layout
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
  // ... (Existing state: Profile, WAF, Toggles)
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('analyst');
  const [newPassword, setNewPassword] = useState('');
  const [wafMode, setWafMode] = useState('protect');
  const [geoBlocking, setGeoBlocking] = useState(true);

  // ── NEW: Custom Pages State ──────────────────────────
  const [customErrorEnabled, setCustomErrorEnabled] = useState(false);
  const [errorHtml, setErrorHtml] = useState('<h1>403 Forbidden</h1><p>Blocked by Neuro-WAF AI</p>');
  const [customBotEnabled, setCustomBotEnabled] = useState(false);
  const [botHtml, setBotHtml] = useState('<h1>Verifying...</h1><p>Please wait while we check your connection.</p>');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/settings', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();

        setUsername(data.profile?.username || '');
        setRole(data.profile?.role || 'analyst');
        setWafMode(data.waf?.waf_mode || 'protect');
        setGeoBlocking(data.toggles?.geo_blocking ?? true);

        // Load Custom Pages Data
        setCustomErrorEnabled(data.custom_pages?.error_enabled ?? false);
        setErrorHtml(data.custom_pages?.error_html || '');
        setCustomBotEnabled(data.custom_pages?.bot_enabled ?? false);
        setBotHtml(data.custom_pages?.bot_html || '');

      } catch (err) {
        setErrorMessage('Could not load settings. Database connection error?');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage('');

    const body = {
      profile: newPassword ? { new_password: newPassword } : undefined,
      waf: { waf_mode: wafMode },
      toggles: { geo_blocking: geoBlocking },
      // Send Custom Pages to API
      custom_pages: {
        error_enabled: customErrorEnabled,
        error_html: errorHtml,
        bot_enabled: customBotEnabled,
        bot_html: botHtml
      }
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      setNewPassword('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
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
    <div className="space-y-6 max-w-5xl mx-auto p-4">
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
        {/* Left Column: Profile & WAF Mode ... */}
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

        {/* Middle & Right: Security & Custom Pages */}
        <div className="lg:col-span-2 space-y-6">
            {/* Security & Mitigation */}
                      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <SectionHeader icon={Shield} title="Global Security Policies" description="Apply system-wide protection rules." />
            
                        <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <Globe size={20} className="text-gray-400" />
                            <Toggle enabled={geoBlocking} setEnabled={setGeoBlocking} />
                          </div>
                          <h4 className="font-bold text-sm text-gray-800">Geo-Blocking</h4>
                          <p className="text-xs text-gray-500 mt-1">
                            Automatically block traffic from high-risk regions (RU, CN, KP, IR) based on threat intelligence.
                            Uses real-time GeoIP lookups to identify request origin countries.
                          </p>
                          {geoBlocking && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {['Russia', 'China', 'North Korea', 'Iran'].map((c) => (
                                <span key={c} className="px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-600 rounded border border-red-200">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
          
          {/* Global Security Policies ... */}

          {/* ── NEW SECTION: Custom Response Pages ────────────────── */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <SectionHeader 
              icon={Layout} 
              title="Response Templates" 
              description="Customize the HTML content for block pages and challenges." 
            />

            <div className="space-y-6">
              {/* 403 Forbidden Template */}
              <div className="p-4 border border-gray-100 rounded-lg bg-gray-50/50">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <FileCode size={18} className="text-red-500" />
                    <h4 className="font-bold text-sm text-gray-800">403 Block Page</h4>
                  </div>
                  <Toggle enabled={customErrorEnabled} setEnabled={setCustomErrorEnabled} />
                </div>
                {customErrorEnabled && (
                  <textarea
                    className="w-full h-32 p-3 text-xs font-mono border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={errorHtml}
                    onChange={(e) => setErrorHtml(e.target.value)}
                    placeholder="Enter custom HTML for blocked requests..."
                  />
                )}
              </div>

              {/* Anti-Bot Challenge Template */}
              <div className="p-4 border border-gray-100 rounded-lg bg-gray-50/50">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <Shield size={18} className="text-blue-500" />
                    <h4 className="font-bold text-sm text-gray-800">Anti-Bot Challenge</h4>
                  </div>
                  <Toggle enabled={customBotEnabled} setEnabled={setCustomBotEnabled} />
                </div>
                {customBotEnabled && (
                  <textarea
                    className="w-full h-32 p-3 text-xs font-mono border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={botHtml}
                    onChange={(e) => setBotHtml(e.target.value)}
                    placeholder="Enter custom HTML for bot verification pages..."
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;