// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import {
  User, Shield, Key, Globe, Save, Loader2, CheckCircle2, FileCode, Layout, Mail, Send, Clock, Download
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [wafMode, setWafMode] = useState('protect');
  const [geoBlocking, setGeoBlocking] = useState(true);

  // ── NEW: Custom Pages State ──────────────────────────
  const [customErrorEnabled, setCustomErrorEnabled] = useState(false);
  const [errorHtml, setErrorHtml] = useState('<h1>403 Forbidden</h1><p>Blocked by Neuro-WAF AI</p>');
  const [customBotEnabled, setCustomBotEnabled] = useState(false);
  const [botHtml, setBotHtml] = useState('<h1>Verifying...</h1><p>Please wait while we check your connection.</p>');

  // ── Auto Report State ───────────────────────────────
  const [reportEnabled, setReportEnabled] = useState(false);
  const [reportEmail, setReportEmail] = useState('');
  const [reportFrequency, setReportFrequency] = useState('daily');
  const [reportTime, setReportTime] = useState('00:00');
  const [reportDow, setReportDow] = useState(null);      // 0=Mon..6=Sun
  const [reportDom, setReportDom] = useState(null);      // 1..31
  // defaults pulled at build time from VITE_ environment variables (set in .env)
  const [reportSmtpUser, setReportSmtpUser] = useState(import.meta.env.VITE_SMTP_SENDER_GMAIL || '');
  const [reportSmtpPassword, setReportSmtpPassword] = useState(import.meta.env.VITE_SMTP_APP_PASSWORD || '');
  const [reportLastSent, setReportLastSent] = useState(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportSettingsSaved, setReportSettingsSaved] = useState(true);  // Track if report settings have unsaved changes

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

        // Load Report Settings (separate endpoint)
        try {
          const reportRes = await fetch('/api/report-settings', { credentials: 'include' });
          if (reportRes.ok) {
            const rd = await reportRes.json();
            setReportEnabled(rd.enabled ?? false);
            setReportEmail(rd.recipient_email || '');
            setReportFrequency(rd.frequency || 'daily');
            setReportTime(rd.schedule_time || '00:00');
            setReportDow(rd.schedule_dow);
            setReportDom(rd.schedule_dom);
            // if backend returns empty values, keep build-time defaults from env vars
            setReportSmtpUser(rd.smtp_user || import.meta.env.VITE_SMTP_SENDER_GMAIL || '');
            setReportSmtpPassword(rd.smtp_password || import.meta.env.VITE_SMTP_APP_PASSWORD || '');
            setReportLastSent(rd.last_sent_at || null);
          }
        } catch (e) { /* report settings optional */ }

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
      profile: newPassword
        ? {
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword,
          }
        : undefined,
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
      // validate password change
      if (newPassword) {
        if (!currentPassword) throw new Error('Please enter your current password');
        if (newPassword !== confirmPassword) throw new Error('New passwords do not match');
      }

      // validate report schedule before hitting backend
      if (reportEnabled) {
        if (!reportEmail) throw new Error('Recipient email is required');
        if (reportFrequency === 'weekly' && (reportDow === null || reportDow === undefined)) {
          throw new Error('Please select a day of week for weekly reports');
        }
        if (reportFrequency === 'monthly' && (reportDom === null || reportDom === undefined)) {
          throw new Error('Please select a day of month for monthly reports');
        }
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');

      // Save report settings (separate endpoint)
      const reportRes = await fetch('/api/report-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: reportEnabled,
          recipient_email: reportEmail,
          frequency: reportFrequency,
          schedule_time: reportTime,
          schedule_dow: reportDow,
          schedule_dom: reportDom,
        }),
      });
      if (!reportRes.ok) throw new Error('Failed to save report settings');

      setNewPassword('');
      setCurrentPassword('');
      setConfirmPassword('');
      setReportSettingsSaved(true);  // Mark report settings as saved
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewPdf = async () => {
    try {
      const res = await fetch('/api/report-settings/preview', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate preview');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NeuroWAF_Report_Preview.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportMessage('Failed to generate preview PDF');
      setTimeout(() => setReportMessage(''), 5000);
    }
  };

  const handleSendNow = async () => {
    setSendingReport(true);
    setReportMessage('');
    try {
      const res = await fetch('/api/report-settings/send', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setReportMessage('Report sent successfully!');
        setReportLastSent(new Date().toISOString());
      } else {
        setReportMessage(data.message || 'Failed to send report');
      }
      setTimeout(() => setReportMessage(''), 5000);
    } catch (err) {
      setReportMessage('Failed to send report');
      setTimeout(() => setReportMessage(''), 5000);
    } finally {
      setSendingReport(false);
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
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Current Password</label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Confirm Password</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat new password"
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

          {/* ── AUTO REPORT SECTION ────────────────────────────── */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <SectionHeader
              icon={Mail}
              title="Auto Reports"
              description="Schedule automated PDF security reports sent to your email."
            />

            <div className="space-y-5">
              {/* Enable Toggle */}
              <div className="flex justify-between items-center p-4 border border-gray-100 rounded-lg bg-gray-50/50">
                <div>
                  <h4 className="font-bold text-sm text-gray-800">Enable Auto Reports</h4>
                  <p className="text-xs text-gray-500 mt-1">Automatically generate and email PDF reports on a schedule.</p>
                </div>
                <button
                  onClick={() => {
                    setReportEnabled(!reportEnabled);
                    setReportSettingsSaved(false);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    reportEnabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      reportEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {reportEnabled && (
                <div className="space-y-4 p-4 border border-blue-100 rounded-lg bg-blue-50/30">
                  {/* Recipient */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Recipient Email</label>
                    <input
                      type="email"
                      value={reportEmail}
                      onChange={(e) => {
                        setReportEmail(e.target.value);
                        setReportSettingsSaved(false);
                      }}
                      placeholder="analyst@company.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Frequency</label>
                    <div className="flex gap-3">
                      {['daily', 'weekly', 'monthly'].map((freq) => (
                        <label
                          key={freq}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                            reportFrequency === freq
                              ? 'border-blue-400 bg-blue-50 text-blue-700 font-bold'
                              : 'border-gray-200 hover:border-blue-200 text-gray-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="reportFreq"
                            value={freq}
                            checked={reportFrequency === freq}
                            onChange={() => {
                              setReportFrequency(freq);
                              setReportSettingsSaved(false);
                            }}
                            className="accent-blue-600"
                          />
                          <span className="capitalize">{freq}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Schedule details */}
                  <div className="mt-4">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Time of day</label>
                    <input
                      type="time"
                      value={reportTime}
                      onChange={(e) => {
                        setReportTime(e.target.value);
                        setReportSettingsSaved(false);
                      }}
                      className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {reportFrequency === 'weekly' && (
                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Day of week</label>
                      <select
                        value={reportDow ?? ''}
                        onChange={(e) => {
                          setReportDow(e.target.value === '' ? null : parseInt(e.target.value, 10));
                          setReportSettingsSaved(false);
                        }}
                        className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select</option>
                        {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i)=>(
                          <option key={i} value={i}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {reportFrequency === 'monthly' && (
                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Day of month</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={reportDom ?? ''}
                        onChange={(e) => {
                          const v = e.target.value ? parseInt(e.target.value, 10) : null;
                          setReportDom(v);
                          setReportSettingsSaved(false);
                        }}
                        className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* Send Now + Preview + Status */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={12} />
                      {reportLastSent
                        ? `Last sent: ${new Date(reportLastSent).toLocaleString()}`
                        : 'No reports sent yet'}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePreviewPdf}
                        className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors border border-gray-300"
                      >
                        <Download size={14} />
                        Preview PDF
                      </button>
                      <button
                        onClick={handleSendNow}
                        disabled={sendingReport || !reportEmail || !reportSettingsSaved}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!reportSettingsSaved ? "Please save settings first" : ""}
                      >
                        {sendingReport ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {sendingReport ? 'Sending...' : 'Send Now'}
                      </button>
                    </div>
                  </div>

                  {reportMessage && (
                    <div className={`text-sm font-medium p-2 rounded-lg ${
                      reportMessage.includes('success') ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
                    }`}>
                      {reportMessage}
                    </div>
                  )}

                  {!reportSettingsSaved && (
                    <div className="text-sm font-medium p-2 rounded-lg text-yellow-600 bg-yellow-50 border border-yellow-200">
                      ⚠️ Changes not saved. Click "Save Changes" to enable Send Now.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;