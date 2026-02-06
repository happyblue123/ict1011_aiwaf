import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  Settings,
  Rocket,
  ShieldCheck,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Server,
  Lock,
  AlertCircle,
  Database
} from 'lucide-react';

const API_BASE_URL = "/api";

// ---- helper: robust error parsing (JSON detail OR text) ----
async function readErrorMessage(res) {
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return data?.detail || data?.message || null;
    }
    const text = await res.text();
    return text || null;
  } catch {
    return null;
  }
}

// Accept onComplete prop from App.jsx
const WAFSetup = ({ onComplete }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const [dbReady, setDbReady] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);

  const [formData, setFormData] = useState({
    // ✅ Step 2 (after DB)
    targetIp: '',

    // Step 3
    wafMode: 'protect',
    wafPort: '8080',
    username: 'admin',
    password: '',
    loginEndpoint: '/login',
    escapeEndpoint: '/logout',

    // ✅ Step 1: DB Setup
    dbHost: '127.0.0.1',
    dbPort: '3306',
    dbUser: 'root',
    dbPassword: '',
    dbName: 'NeuroWAF_db',
    schemaFile: 'schema.sql',

    // Step 4: Crawler payload pairs
    loginPayloadPairs: [
      { key: "username", value: "test" },
      { key: "password", value: "test" },
    ],
  });

  const addPayloadPair = () => {
    setFormData((prev) => ({
      ...prev,
      loginPayloadPairs: [...prev.loginPayloadPairs, { key: "", value: "" }],
    }));
  };

  const removePayloadPair = (idx) => {
    setFormData((prev) => ({
      ...prev,
      loginPayloadPairs: prev.loginPayloadPairs.filter((_, i) => i !== idx),
    }));
  };

  const updatePayloadPair = (idx, field, val) => {
    setFormData((prev) => ({
      ...prev,
      loginPayloadPairs: prev.loginPayloadPairs.map((row, i) =>
        i === idx ? { ...row, [field]: val } : row
      ),
    }));
  };

  // ✅ Step 1 action: call /api/setupdb
  const handleSetupDb = async () => {
    setError("");
    setDbLoading(true);

    try {
      const payload = {
        host: formData.dbHost,
        port: parseInt(formData.dbPort, 10),
        user: formData.dbUser,
        password: formData.dbPassword,
        database: formData.dbName,
        init_database: true,    
        schema_file: "schema.sql",  
      };

      const res = await fetch(`${API_BASE_URL}/setupdb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = (await readErrorMessage(res)) || `Database setup failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      // ✅ DB ready, go next
      setDbReady(true);
      setStep(2);

    } catch (e) {
      setDbReady(false);
      setError(e?.message || "Database setup failed");
    } finally {
      setDbLoading(false);
    }
  };

  // Track if deployment has started to prevent double-firing
  const deploymentStarted = useRef(false);

  // ✅ Deploy happens on STEP 5
  useEffect(() => {
    if (step !== 5) return;
    if (deploymentStarted.current) return;

    deploymentStarted.current = true;
    setError("");

    setProgress(10);
    const timer = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + 10));
    }, 300);

    const deployToBackend = async () => {
      const login_payload = {};
      for (const row of formData.loginPayloadPairs) {
        const k = (row.key || "").trim();
        if (!k) continue;
        login_payload[k] = row.value ?? "";
      }

      try {
        const payload = {
          target_host: formData.targetIp,
          waf_mode: formData.wafMode,
          proxy_port: parseInt(formData.wafPort, 10),
          login_endpoint: formData.loginEndpoint,
          excluded_endpoints: formData.escapeEndpoint,
          username: formData.username,
          password: formData.password,
          login_payload,

          // ✅ still send db info (optional but useful)
          db: {
            host: formData.dbHost,
            port: parseInt(formData.dbPort, 10),
            user: formData.dbUser,
            password: formData.dbPassword,
            database: formData.dbName,
            init_database: false, // ✅ already done in /setupdb
            schema_file: formData.schemaFile,
          },
        };

        const res = await fetch(`${API_BASE_URL}/setupwaf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = (await readErrorMessage(res)) || `Deployment failed (HTTP ${res.status})`;
          throw new Error(msg);
        }

        clearInterval(timer);
        setProgress(100);
        deploymentStarted.current = false;
        setStep(6);

      } catch (err) {
        clearInterval(timer);
        console.error("setupwaf error:", err);
        setError(err?.message || "Deployment failed");
        deploymentStarted.current = false;
        setStep(4);
      }
    };

    deployToBackend();
    return () => clearInterval(timer);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = () => setStep((s) => s + 1);
  const handleBack = () => setStep((s) => s - 1);

  const handleFinish = () => navigate("/login", { replace: true });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

        <div className="bg-gray-900 p-8 text-white text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-500 rounded-xl shadow-lg shadow-blue-500/30">
              <ShieldCheck size={32} />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Neuro-WAF Setup</h1>
          <p className="text-gray-400 text-sm mt-1">Configure your AI-powered protection layer</p>

          <div className="flex justify-center mt-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className={`h-1 w-10 rounded-full transition-colors ${step >= s ? 'bg-blue-500' : 'bg-gray-700'}`}
              />
            ))}
          </div>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm animate-in slide-in-from-top-2">
              <AlertCircle size={20} />
              {error}
              <button onClick={() => setError("")} className="ml-auto text-gray-400 hover:text-red-600">×</button>
            </div>
          )}

          {/* ✅ STEP 1: DATABASE SETUP (NEW FIRST STEP) */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Database size={16} /> MySQL Connection
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Host (e.g. 127.0.0.1)"
                    className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                    value={formData.dbHost}
                    onChange={(e) => setFormData({ ...formData, dbHost: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Port (e.g. 3306)"
                    className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                    value={formData.dbPort}
                    onChange={(e) => setFormData({ ...formData, dbPort: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="User"
                    className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                    value={formData.dbUser}
                    onChange={(e) => setFormData({ ...formData, dbUser: e.target.value })}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                    value={formData.dbPassword}
                    onChange={(e) => setFormData({ ...formData, dbPassword: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Database Name</label>
                <input
                  type="text"
                  placeholder="NeuroWAF_db"
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                  value={formData.dbName}
                  onChange={(e) => setFormData({ ...formData, dbName: e.target.value })}
                  readOnly
                />

                <p className="text-xs text-gray-500">
                  Click “Setup Database” to test credentials and initialize schema.
                </p>

                {dbReady && (
                  <p className="text-xs text-green-600 font-semibold">
                    ✅ Database initialized successfully.
                  </p>
                )}
              </div>

              <button
                onClick={handleSetupDb}
                disabled={dbLoading || !formData.dbHost || !formData.dbUser || !formData.dbName}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {dbLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Setting up database...
                  </>
                ) : (
                  <>
                    Setup Database <ChevronRight size={18} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: TARGET IP */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Globe size={16} /> Web Server IP / URL
                </label>
                <input
                  type="text"
                  placeholder="e.g. http://localhost:3000"
                  className="w-full p-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={formData.targetIp}
                  onChange={(e) => setFormData({ ...formData, targetIp: e.target.value })}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-6 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  <ChevronLeft size={20} />
                </button>

                <button
                  onClick={handleNext}
                  disabled={!formData.targetIp}
                  className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50"
                >
                  Continue to Configuration <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIGURATIONS */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Settings size={16} /> WAF Mode
                  </label>
                  <select
                    className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                    value={formData.wafMode}
                    onChange={(e) => setFormData({ ...formData, wafMode: e.target.value })}
                  >
                    <option value="shadow">Shadow (Logging Only)</option>
                    <option value="protect">Protect (Active Blocking)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Server size={16} /> Proxy Port
                  </label>
                  <input
                    type="number"
                    placeholder="8080"
                    className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                    value={formData.wafPort}
                    onChange={(e) => setFormData({ ...formData, wafPort: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-100">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Lock size={16} /> Admin Credentials (Create New)
                </label>
                <input
                  type="text"
                  placeholder="Username"
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full p-3 rounded-lg border border-gray-200 outline-none"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-6 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  <ChevronLeft size={20} />
                </button>

                <button
                  onClick={handleNext}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                >
                  Crawler Settings <Rocket size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: CRAWLER SETTINGS */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700">
                    Login Payload (Key / Value Pairs)
                  </p>
                  <button
                    type="button"
                    onClick={addPayloadPair}
                    className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold"
                  >
                    + Add Field
                  </button>
                </div>

                {formData.loginPayloadPairs.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="key (e.g. username)"
                      className="col-span-5 p-3 rounded-lg border border-gray-200 outline-none text-sm"
                      value={row.key}
                      onChange={(e) => updatePayloadPair(idx, "key", e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="value (e.g. admin)"
                      className="col-span-6 p-3 rounded-lg border border-gray-200 outline-none text-sm"
                      value={row.value}
                      onChange={(e) => updatePayloadPair(idx, "value", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removePayloadPair(idx)}
                      disabled={formData.loginPayloadPairs.length <= 1}
                      className="col-span-1 h-10 w-10 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}

                <p className="text-xs text-gray-500">
                  Example: username=admin, password=pass, any_other_field=value
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-6 py-4 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  <ChevronLeft size={20} />
                </button>

                <button
                  onClick={() => setStep(5)}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                >
                  Deploy Configuration <Rocket size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: DEPLOYING */}
          {step === 5 && (
            <div className="py-10 text-center space-y-6 animate-in zoom-in-95">
              <Loader2 size={48} className="text-blue-500 animate-spin mx-auto" />
              <div>
                <h3 className="text-xl font-bold text-gray-800">Deploying Neuro-WAF</h3>
                <p className="text-sm text-gray-500 mt-2">
                  {progress < 30 ? 'Connecting to target...' :
                    progress < 60 ? 'Configuring proxy & policies...' :
                      progress < 85 ? 'Training AI model...' :
                        'Finalizing setup...'}
                </p>
              </div>
              <div className="space-y-2">
                <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-400">{progress}% Complete</span>
              </div>
            </div>
          )}

          {/* STEP 6: SUCCESS */}
          {step === 6 && (
            <div className="py-6 text-center space-y-6 animate-in fade-in scale-100">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <ShieldCheck size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-800">Activation Ready</h3>
                <p className="text-sm text-gray-500 mt-2 px-6">
                  Neuro-WAF is now configured for <strong>{formData.targetIp}</strong>. The admin account has been created.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Database: <strong>{formData.dbName}</strong> @ {formData.dbHost}:{formData.dbPort}
                </p>
              </div>
              <button
                onClick={handleFinish}
                className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all"
              >
                Proceed to Login
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default WAFSetup;
