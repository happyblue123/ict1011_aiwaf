import React, { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Shield, TimerReset, Plus, Trash2 } from "lucide-react";

const initialEntries = {
  whitelist: [],
  blacklist: [],
};

const suggestions = [
  {
    title: "Auto-quarantine bursts",
    description: "Temporarily blacklist IPs with >20 blocked requests in 60 seconds.",
    confidence: "High",
    impact: "Blocklist automation",
    prefill: { list: "blacklist", reason: "Burst traffic quarantine (AI suggestion)", expires: "" },
  },
  {
    title: "Trusted partner allowlist",
    description: "Whitelist vendor IPs and enforce a shorter rule expiry review cycle.",
    confidence: "Medium",
    impact: "Allowlist governance",
    prefill: { list: "whitelist", reason: "Trusted partner traffic (AI suggestion)", expires: "" },
  },
  {
    title: "Geo-based gatekeeping",
    description: "Add a region toggle to block high-risk geographies during incidents.",
    confidence: "Medium",
    impact: "Incident response",
    prefill: { list: "blacklist", reason: "Geo incident block (AI suggestion)", expires: "" },
  },
  {
    title: "Slow-burn reconnaissance",
    description: "Auto-block IPs triggering low-and-slow scanning signatures over 24 hours.",
    confidence: "High",
    impact: "Recon deterrence",
    prefill: { list: "blacklist", reason: "Slow recon block (AI suggestion)", expires: "" },
  },
];

export default function PolicyRules() {
  const [activeList, setActiveList] = useState("blacklist");
  const [formValues, setFormValues] = useState({
    ip: "",
    reason: "",
    expires: "",
  });
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const summary = useMemo(
    () => ({
      whitelist: entries.whitelist.length,
      blacklist: entries.blacklist.length,
    }),
    [entries]
  );

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormValues({ ip: "", reason: "", expires: "" });
  };

  const formatDate = (value) => {
    if (!value) {
      return "Never";
    }
    if (typeof value === "string") {
      return value.split("T")[0];
    }
    if (value instanceof Date) {
      return value.toISOString().split("T")[0];
    }
    return "Never";
  };

  const normalizeEntries = (apiEntries) => {
    const grouped = { whitelist: [], blacklist: [] };
    (apiEntries || []).forEach((entry) => {
      const listKey = entry.list_type === "whitelist" ? "whitelist" : "blacklist";
      grouped[listKey].push({
        id: entry.rule_id,
        ip: entry.ip_address,
        reason: entry.reason || "Manual entry",
        addedBy: entry.created_by || "System",
        expires: formatDate(entry.expires_at),
      });
    });
    return grouped;
  };

  useEffect(() => {
    const fetchEntries = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch("/api/policy/entries", { credentials: "include" });
        if (!response.ok) {
          throw new Error("Failed to load policy rules.");
        }
        const data = await response.json();
        setEntries(normalizeEntries(data.entries));
      } catch (error) {
        setErrorMessage(error.message || "Failed to load policy rules.");
        setEntries(initialEntries);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, []);

  const handleSuggestionApply = (suggestion) => {
    if (!suggestion?.prefill) {
      return;
    }
    setActiveList(suggestion.prefill.list);
    setFormValues((prev) => ({
      ...prev,
      reason: suggestion.prefill.reason,
      expires: suggestion.prefill.expires,
    }));
  };

  const handleAddRule = (event) => {
    event.preventDefault();
    if (!formValues.ip.trim()) {
      return;
    }
    setErrorMessage("");

    const payload = {
      list_type: activeList,
      ip_address: formValues.ip.trim(),
      reason: formValues.reason.trim() || "Manual entry",
      created_by: "Admin User",
      expires_at: formValues.expires.trim() || null,
    };

    fetch("/api/policy/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to add policy rule.");
        }
        return response.json();
      })
      .then((data) => {
        const entry = data.entry;
        const newEntry = {
          id: entry.rule_id,
          ip: entry.ip_address,
          reason: entry.reason || "Manual entry",
          addedBy: entry.created_by || "System",
          expires: formatDate(entry.expires_at),
        };
        setEntries((prev) => ({
          ...prev,
          [activeList]: [newEntry, ...prev[activeList]],
        }));
        resetForm();
      })
      .catch((error) => {
        setErrorMessage(error.message || "Failed to add policy rule.");
      });
  };

  const handleRemove = (listKey, id) => {
    setErrorMessage("");
    fetch(`/api/policy/entries/${id}`, { method: "DELETE", credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to remove policy rule.");
        }
        return response.json();
      })
      .then((data) => {
        if (!data.deleted) {
          throw new Error("Policy rule could not be deleted.");
        }
        setEntries((prev) => ({
          ...prev,
          [listKey]: prev[listKey].filter((entry) => entry.id !== id),
        }));
      })
      .catch((error) => {
        setErrorMessage(error.message || "Failed to remove policy rule.");
      });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-500">
          Policy Rules
        </p>
        <h1 className="text-3xl font-bold text-gray-900">IP Allowlist & Blocklist</h1>
        <p className="text-gray-500 max-w-2xl">
          Maintain trusted and blocked sources for instant enforcement. Pair manual rules with AI
          recommendations to keep malicious traffic out without hurting legitimate users.
        </p>
      </header>
      {(loading || errorMessage) && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {loading ? "Loading policy rules..." : errorMessage}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Allowlisted IPs</p>
              <p className="text-2xl font-bold text-gray-900">{summary.whitelist}</p>
            </div>
            <div className="rounded-full bg-emerald-100 p-3 text-emerald-600">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Trusted sources with bypassed throttling and verified behaviors.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Blocked IPs</p>
              <p className="text-2xl font-bold text-gray-900">{summary.blacklist}</p>
            </div>
            <div className="rounded-full bg-red-100 p-3 text-red-600">
              <Ban size={20} />
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Malicious or abusive sources actively blocked at the edge.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Rule Expirations</p>
              <p className="text-2xl font-bold text-gray-900">Weekly</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3 text-blue-600">
              <TimerReset size={20} />
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Review rules with an expiry schedule to avoid stale policy drift.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Create a policy rule</h2>
              <p className="text-sm text-gray-500">
                Add IPs to a whitelist or blacklist and set an optional expiry date.
              </p>
            </div>
            <div className="flex rounded-full bg-gray-100 p-1 text-sm font-medium text-gray-500">
              {["blacklist", "whitelist"].map((listKey) => (
                <button
                  key={listKey}
                  type="button"
                  onClick={() => setActiveList(listKey)}
                  className={`rounded-full px-4 py-2 transition ${
                    activeList === listKey
                      ? "bg-gray-900 text-white shadow-sm"
                      : "hover:text-gray-900"
                  }`}
                >
                  {listKey === "blacklist" ? "Blocklist" : "Allowlist"}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleAddRule} className="mt-6 grid gap-4">
            <div className="grid gap-2 md:grid-cols-[1.4fr_1.6fr]">
              <label className="text-sm font-medium text-gray-700">
                IP address
                <input
                  name="ip"
                  value={formValues.ip}
                  onChange={handleInputChange}
                  placeholder="e.g. 203.0.113.10"
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white"
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Reason
                <input
                  name="reason"
                  value={formValues.reason}
                  onChange={handleInputChange}
                  placeholder="Why is this IP trusted or blocked?"
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white"
                />
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
              <label className="text-sm font-medium text-gray-700">
                Expiration (optional)
                <input
                  name="expires"
                  type="date"
                  value={formValues.expires}
                  onChange={handleInputChange}
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:bg-white"
                />
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  <Plus size={16} /> Add rule
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AI policy ideas</h2>
              <p className="text-sm text-gray-500">Suggestions to automate IP defense policy.</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3 text-blue-600">
              <Shield size={20} />
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {suggestions.map((item) => (
              <div key={item.title} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm">
                    {item.confidence} confidence
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500">{item.description}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                  <span className="rounded-full bg-white px-3 py-1 text-gray-600 shadow-sm">
                    {item.impact}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSuggestionApply(item)}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                  >
                    Apply template
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {[
          {
            key: "whitelist",
            title: "Allowlist",
            description: "Traffic from these IPs is trusted and never rate limited.",
            icon: CheckCircle2,
          },
          {
            key: "blacklist",
            title: "Blocklist",
            description: "Traffic from these IPs is immediately denied at the edge.",
            icon: Ban,
          },
        ].map((listConfig) => (
          <div
            key={listConfig.key}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{listConfig.title}</h3>
                <p className="text-sm text-gray-500">{listConfig.description}</p>
              </div>
              <div className="rounded-full bg-gray-100 p-3 text-gray-600">
                <listConfig.icon size={18} />
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {entries[listConfig.key].length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  No {listConfig.title.toLowerCase()} entries yet.
                </div>
              ) : (
                entries[listConfig.key].map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{entry.ip}</p>
                      <p className="text-xs text-gray-500">{entry.reason}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>By {entry.addedBy}</span>
                      <span className="rounded-full bg-white px-2 py-1 text-gray-600 shadow-sm">
                        Expires: {entry.expires}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(listConfig.key, entry.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
