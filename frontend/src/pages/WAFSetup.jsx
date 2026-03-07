import React, { useState } from 'react';
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
  Database,
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

const WAFSetup = ({ onComplete }) => {
  const navigate = useNavigate();

  // Steps:
  // 1 = DB setup
  // 2 = WAF config -> /setupwaf
  // 3 = crawler/baseline config -> /generate_baseline
  // 4 = success
  const [step, setStep] = useState(1);

  const [error, setError] = useState("");

  const [dbReady, setDbReady] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);

  const [wafLoading, setWafLoading] = useState(false);
  const [baselineLoading, setBaselineLoading] = useState(false);

  // Optional: store instance_id returned by /setupwaf
  const [wafInstanceId, setWafInstanceId] = useState(null);

  const [formData, setFormData] = useState({
    // ✅ Step 2: WAF config
    targetIp: '',
    wafMode: 'protect',
    wafPort: '8080',
    username: 'admin',
    password: '',

    // ✅ Step 3: crawler config
    excludedEndpoints: ['/logout'], // ✅ NOW MULTIPLE

    // ✅ Step 1: DB setup
    dbHost: '127.0.0.1',
    dbPort: '3306',
    dbUser: 'root',
    dbPassword: '',
    dbName: 'NeuroWAF_db',
    schemaFile: 'schema.sql',
  });

  // ===== Excluded endpoints helpers (NEW) =====
  const addExcludedEndpoint = () => {
    setFormData((prev) => ({
      ...prev,
      excludedEndpoints: [...(prev.excludedEndpoints || []), ""],
    }));
  };

  const removeExcludedEndpoint = (idx) => {
    setFormData((prev) => ({
      ...prev,
      excludedEndpoints: (prev.excludedEndpoints || []).filter((_, i) => i !== idx),
    }));
  };

  const updateExcludedEndpoint = (idx, val) => {
    setFormData((prev) => ({
      ...prev,
      excludedEndpoints: (prev.excludedEndpoints || []).map((ep, i) =>
        i === idx ? val : ep
      ),
    }));
  };

  const normalizeExcludedEndpoints = () => {
    // Trim, ensure starts with "/", drop empties, de-dupe
    const cleaned = Array.from(
      new Set(
        (formData.excludedEndpoints || [])
          .map((x) => (x || "").trim())
          .filter(Boolean)
          .map((x) => (x.startsWith("/") ? x : `/${x}`))
      )
    );

    setFormData((prev) => ({
      ...prev,
      excludedEndpoints: cleaned.length ? cleaned : ["/logout"],
    }));

    return cleaned.length ? cleaned : ["/logout"];
  };

  // ✅ Step 1: call /api/setupdb
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

      setDbReady(true);
      setStep(2);
    } catch (e) {
      setDbReady(false);
      setError(e?.message || "Database setup failed");
    } finally {
      setDbLoading(false);
    }
  };

  // ✅ Step 2: call /api/setupwaf (ONLY WAF instance config)
  const handleSetupWaf = async () => {
    setError("");
    setWafLoading(true);

    try {
      const payload = {
        target_host: formData.targetIp,
        waf_mode: formData.wafMode,
        proxy_port: parseInt(formData.wafPort, 10),

        username: formData.username,
        password: formData.password,

        // optional db info (keep if backend accepts it)
        db: {
          host: formData.dbHost,
          port: parseInt(formData.dbPort, 10),
          user: formData.dbUser,
          password: formData.dbPassword,
          database: formData.dbName,
          init_database: false,
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
        const msg = (await readErrorMessage(res)) || `Setup WAF failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      let data = null;
      try {
        data = await res.json();
      } catch {
        // ignore
      }

      if (data?.instance_id) setWafInstanceId(data.instance_id);

      // Wait for server to restart on the new port
      const maxWait = 15000;
      const interval = 1000;
      const startTime = Date.now();
      let serverReady = false;

      while (Date.now() - startTime < maxWait) {
        await new Promise((r) => setTimeout(r, interval));
        try {
          const check = await fetch(`${API_BASE_URL}/auth/check`, {
            credentials: "include",
          });
          if (check.ok || check.status === 401) {
            serverReady = true;
            break;
          }
        } catch {
          // Server still restarting
        }
      }

      if (!serverReady) {
        throw new Error("Server is restarting. Please refresh the page.");
      }

      setStep(3);
    } catch (e) {
      setError(e?.message || "Setup WAF failed");
    } finally {
      setWafLoading(false);
    }
  };

  // ✅ Step 3: call /api/generate_baseline (crawler/baseline config only)
  const handleGenerateBaseline = async () => {
    setError("");
    setBaselineLoading(true);

    try {
      const excluded_endpoints = normalizeExcludedEndpoints();

      const payload = {
        instance_id: wafInstanceId,
        target_host: formData.targetIp,
        excluded_endpoints,
      };

      const res = await fetch(`${API_BASE_URL}/generate_baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = (await readErrorMessage(res)) || `Baseline generation failed (HTTP ${res.status})`;
        throw new Error(msg);
      }

      if (typeof onComplete === "function") onComplete();
      setStep(4);
    } catch (e) {
      setError(e?.message || "Baseline generation failed");
    } finally {
      setBaselineLoading(false);
    }
  };

  const handleBack = () => setStep((s) => Math.max(1, s - 1));
  const handleFinish = () => navigate("/login", { replace: true });

  const canProceedWaf =
    !!formData.targetIp &&
    !!formData.wafMode &&
    !!formData.wafPort &&
    !!formData.username &&
    !!formData.password;

  const canProceedBaseline = (formData.excludedEndpoints || []).some((x) => (x || "").trim());

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
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 w-12 rounded-full transition-colors ${step >= s ? 'bg-blue-500' : 'bg-gray-700'}`}
              />
            ))}
          </div>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3 text-sm animate-in slide-in-from-top-2">
              <AlertCircle size={20} />
              {error}
              <button
                onClick={() => setError("")}
                className="ml-auto text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          )}

          {/* ✅ STEP 1: DATABASE SETUP */}
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

          {/* ✅ STEP 2: WAF CONFIG -> /setupwaf */}
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

              <div className="space-y-3 pt-4 border-t border-gray-100">
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
                  onClick={handleSetupWaf}
                  disabled={!canProceedWaf || wafLoading}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {wafLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Creating WAF instance...
                    </>
                  ) : (
                    <>
                      Save WAF Configuration <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ✅ STEP 3: BASELINE CONFIG -> /generate_baseline */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              {/* Professional Header Section */}
              <div className="border-b pb-4">
                <h3 className="text-lg font-bold text-gray-900">Crawler Scope Configuration</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Define high-risk or sensitive endpoints (e.g., <code>/logout</code>, <code>/delete</code>) 
                  to be excluded from the automated discovery and baseline generation process.
                </p>
              </div>
              {/* ✅ MULTIPLE EXCLUDED ENDPOINTS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700">Excluded Endpoints</p>
                  <button
                    type="button"
                    onClick={addExcludedEndpoint}
                    className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold"
                  >
                    + Add Endpoint
                  </button>
                </div>

                {(formData.excludedEndpoints || []).map((ep, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="/logout"
                      className="col-span-11 p-3 rounded-lg border border-gray-200 outline-none text-sm"
                      value={ep}
                      onChange={(e) => updateExcludedEndpoint(idx, e.target.value)}
                      onBlur={normalizeExcludedEndpoints}
                    />
                    <button
                      type="button"
                      onClick={() => removeExcludedEndpoint(idx)}
                      disabled={(formData.excludedEndpoints || []).length <= 1}
                      className="col-span-1 h-10 w-10 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}

                <p className="text-xs text-gray-500">
                  Pages you do NOT want the crawler to visit (e.g. /logout, /admin).
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
                  onClick={handleGenerateBaseline}
                  disabled={baselineLoading || !canProceedBaseline}
                  className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-50"
                >
                  {baselineLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" /> Generating baseline...
                    </>
                  ) : (
                    <>
                      Generate Baseline <Rocket size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ✅ STEP 4: SUCCESS */}
          {step === 4 && (
            <div className="py-6 text-center space-y-6 animate-in fade-in scale-100">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <ShieldCheck size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-800">Activation Ready</h3>
                <p className="text-sm text-gray-500 mt-2 px-6">
                  Neuro-WAF is now configured for <strong>{formData.targetIp}</strong>. Baseline generation completed.
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
