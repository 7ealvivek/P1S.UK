"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { RefreshCw, Download, ExternalLink, ChevronDown, ChevronUp, Settings2, Save, Square, X, ZoomIn } from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-400/10 border-red-400/30",
  high: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  standard: "text-blue-400 bg-blue-400/10 border-blue-400/30",
};

interface IPResult {
  id: number;
  ip: string;
  port: number;
  hostname: string;
  root_domain: string;
  title: string;
  tech_stack: string;
  web_server: string;
  status_code: number;
  cdn: string;
  reason: string;
  risk: string;
  screenshot_path: string;
  first_seen: string;
  last_seen: string;
  is_new: number;
}

interface Stats {
  total: number;
  new_today: number;
  unique_ips: number;
  by_risk: { risk: string; count: number }[];
  by_port: { port: number; count: number; reason: string }[];
  monitored_domains: string[];
}

interface IPScanSettings {
  masscan_rate: number;
  masscan_mode: string;
  exclude_ports: string;
}

interface ScanProgress {
  phase: string;
  detail: string;
  ips: number;
  ports: number;
  live: number;
  done: boolean;
  ts: string;
  // Live masscan stats
  ports_found: number;
  ips_with_ports: number;
  ips_total: number;
  eta_secs: number;
}

const PHASE_LABELS: Record<string, string> = {
  shodan: "Querying Shodan",
  masscan: "Running masscan",
  httpx: "Probing with httpx",
  screenshots: "Taking screenshots",
  storing: "Saving to database",
  done: "Complete",
  stopped: "Stopped",
  idle: "Idle",
};

function getAuthHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("p1w_token")}` };
}

export default function IPScanPage() {
  const [results, setResults] = useState<IPResult[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [riskFilter, setRiskFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showConfig, setShowConfig] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [stopping, setStopping] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [domainFilter, setDomainFilter] = useState("");
  const [domainStats, setDomainStats] = useState<{domain: string; total: number; critical: number; high: number; medium: number; unique_ips: number}[]>([]);

  // Scan config state
  const [scope, setScope] = useState<"all" | "domain" | "custom">("all");
  const [scopeDomain, setScopeDomain] = useState("");
  const [customDomains, setCustomDomains] = useState("");
  const [scanRate, setScanRate] = useState<number | null>(null);

  // Saved settings
  const [savedSettings, setSavedSettings] = useState<IPScanSettings>({ masscan_rate: 1000, masscan_mode: "top", exclude_ports: "80,443,22,21,25,53" });
  const [dailyDomains, setDailyDomains] = useState<{domain: string; ipscan_daily: boolean}[]>([]);
  const [savingDailyDomains, setSavingDailyDomains] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const { toast } = useToast();
  const perPage = 50;

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/ipscan/progress", { headers: getAuthHeader() });
      const d = await res.json();
      setProgress(d.data);
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/ipscan/stats", { headers: getAuthHeader() });
      const d = await res.json();
      setStats(d.data);
    } catch {}
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const [settingsRes, dailyRes] = await Promise.all([
        fetch("/api/ipscan/settings", { headers: getAuthHeader() }),
        fetch("/api/ipscan/daily-domains", { headers: getAuthHeader() }),
      ]);
      const d = await settingsRes.json();
      setSavedSettings(d.data);
      setScanRate(d.data.masscan_rate);
      const dd = await dailyRes.json();
      setDailyDomains(dd.data || []);
    } catch {}
  }, []);

  const handleSaveDailyDomains = async () => {
    setSavingDailyDomains(true);
    try {
      const enabled = dailyDomains.filter((d) => d.ipscan_daily).map((d) => d.domain);
      await fetch("/api/ipscan/daily-domains", {
        method: "PUT",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ domains: enabled }),
      });
      toast("Daily scan domains saved", "success");
    } catch {
      toast("Failed to save", "error");
    } finally {
      setSavingDailyDomains(false);
    }
  };

  const fetchDomainStats = useCallback(async () => {
    try {
      const res = await fetch("/api/ipscan/domain-stats", { headers: getAuthHeader() });
      const d = await res.json();
      setDomainStats(d.data || []);
    } catch {}
  }, []);

    const fetchResults = useCallback(
    async (p = 1, risk = riskFilter, domain = domainFilter) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), per_page: String(perPage) });
        if (risk) params.set("risk", risk);
        if (domain) params.set("domain", domain);
        const res = await fetch(`/api/ipscan/results?${params}`, { headers: getAuthHeader() });
        const d = await res.json();
        setResults(d.data || []);
        setTotal(d.meta?.total || 0);
        setPage(d.meta?.page || 1);
        setPages(d.meta?.pages || 1);
      } catch {
        toast("Failed to load results", "error");
      } finally {
        setLoading(false);
      }
    },
    [riskFilter, domainFilter, toast]
  );

  useEffect(() => {
    fetchStats();
    fetchSettings();
    fetchResults();
    fetchProgress();
    fetchDomainStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll progress every 4s when scan is running, 60s otherwise
  useEffect(() => {
    const isRunning = progress && !progress.done;
    const interval = isRunning ? 4000 : 60000;
    const i = setInterval(() => {
      fetchProgress();
      fetchStats();
      if (!isRunning) fetchResults(page, riskFilter);
    }, interval);
    return () => clearInterval(i);
  }, [page, riskFilter, progress, fetchStats, fetchResults, fetchProgress]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/ipscan/settings", {
        method: "PUT",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          masscan_rate: scanRate ?? savedSettings.masscan_rate,
          masscan_mode: savedSettings.masscan_mode,
          exclude_ports: savedSettings.exclude_ports,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSavedSettings((prev) => ({ ...prev, masscan_rate: scanRate ?? prev.masscan_rate }));
      toast("IP Scan settings saved", "success");
    } catch {
      toast("Failed to save settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await fetch("/api/ipscan/stop", { method: "POST", headers: getAuthHeader() });
      toast("Stop signal sent — scan will halt after current step", "info");
      setTimeout(fetchProgress, 2000);
    } catch {
      toast("Failed to send stop signal", "error");
    } finally {
      setStopping(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const body: Record<string, unknown> = { scope };
      if (scope === "domain") body.domain = scopeDomain;
      if (scope === "custom") body.custom_domains = customDomains.split("\n").map((d) => d.trim()).filter(Boolean);
      if (scanRate && scanRate !== savedSettings.masscan_rate) body.masscan_rate = scanRate;

      const res = await fetch("/api/ipscan/scan", {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Scan failed");
      toast("Shodan + masscan scan started — results will appear shortly", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Scan failed", "error");
    } finally {
      setScanning(false);
    }
  };

  const handleExport = (fmt: "csv" | "json") => {
    fetch(`/api/ipscan/export?fmt=${fmt}`, { headers: getAuthHeader() })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `ipscan_export.${fmt}`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      });
  };

  const riskCounts = Object.fromEntries((stats?.by_risk || []).map((r) => [r.risk, r.count]));
  const monitoredDomains = stats?.monitored_domains || [];
  const RISKS = ["critical", "high", "medium", "standard"];

  const toggleExpand = (id: number) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div>
      <Header
        title="IP Scan"
        description={`${(stats?.unique_ips ?? 0).toLocaleString()} unique IPs · ${total.toLocaleString()} open ports via Shodan + masscan`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleExport("csv")}><Download className="w-4 h-4" /> CSV</Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport("json")}><Download className="w-4 h-4" /> JSON</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowConfig((v) => !v)}>
              <Settings2 className="w-4 h-4" /> {showConfig ? "Hide Config" : "Configure"}
            </Button>
            {progress && !progress.done && (
              <Button variant="danger" size="sm" onClick={handleStop} disabled={stopping}>
                <Square className="w-4 h-4" /> {stopping ? "Stopping..." : "Stop Scan"}
              </Button>
            )}
            <Button size="sm" onClick={handleScan} disabled={scanning || (!!progress && !progress.done)}>
              <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Starting..." : "Scan Now"}
            </Button>
          </div>
        }
      />

      {/* Config panel */}
      {showConfig && (
        <Card className="mb-6 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Masscan rate */}
            <div>
              <h4 className="text-subheading text-[var(--text-primary)] mb-3">Masscan Rate (IP Scan)</h4>
              <label className="text-body text-[var(--text-secondary)] mb-2 block">
                Rate: <span className="font-medium text-[var(--text-primary)]">{scanRate ?? savedSettings.masscan_rate} pps</span>
              </label>
              <input
                type="range" min={500} max={10000} step={500}
                value={scanRate ?? savedSettings.masscan_rate}
                onChange={(e) => setScanRate(Number(e.target.value))}
                className="w-full mb-1"
              />
              <div className="flex justify-between text-caption text-[var(--text-tertiary)] mb-3">
                <span>500 (safe)</span><span>10,000 (aggressive)</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { value: "top", label: "Top Ports", desc: "~600 critical ports", eta: "~2 min (all domains)" },
                  { value: "extended", label: "Extended", desc: "1–9999 + high ports", eta: "~3h (all) / 7min (1 domain)" },
                  { value: "full", label: "Full Scan", desc: "1–65535", eta: "~18h (all) / 25min (1 domain)" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSavedSettings((p) => ({ ...p, masscan_mode: opt.value }))}
                    className={`p-2.5 rounded-button text-left transition-colors ${
                      savedSettings.masscan_mode === opt.value
                        ? "bg-[var(--color-accent)] bg-opacity-10 border border-[var(--color-accent)]"
                        : "bg-[var(--bg-tertiary)] border border-[var(--border-default)]"
                    }`}
                  >
                    <div className="text-body font-medium text-[var(--text-primary)]">{opt.label}</div>
                    <div className="text-caption text-[var(--text-tertiary)]">{opt.desc}</div>
                    <div className="text-caption text-[var(--color-accent)] mt-0.5 opacity-75">{opt.eta}</div>
                  </button>
                ))}
              </div>
              <div className="mb-3">
                <label className="text-caption text-[var(--text-tertiary)] mb-1 block">
                  Exclude Ports <span className="text-[var(--text-tertiary)]">(comma-separated, skipped by masscan)</span>
                </label>
                <input
                  type="text"
                  value={savedSettings.exclude_ports}
                  onChange={(e) => setSavedSettings((p) => ({ ...p, exclude_ports: e.target.value }))}
                  placeholder="80,443,22,21,25,53"
                  className="w-full px-3 py-1.5 text-body bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-button text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <Button size="sm" onClick={handleSaveSettings} disabled={savingSettings}>
                <Save className="w-3.5 h-3.5" /> {savingSettings ? "Saving..." : "Save Settings"}
              </Button>
            </div>

            {/* Daily monitoring domains */}
            {dailyDomains.length > 0 && (
              <div>
                <h4 className="text-subheading text-[var(--text-primary)] mb-1">Daily Auto-Scan Domains</h4>
                <p className="text-caption text-[var(--text-tertiary)] mb-3">Select which domains are included in the daily automated IP scan</p>
                <div className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                  {dailyDomains.map((d) => (
                    <label key={d.domain} className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-button cursor-pointer hover:bg-[var(--bg-hover)]">
                      <input
                        type="checkbox"
                        checked={d.ipscan_daily}
                        onChange={(e) => setDailyDomains((prev) =>
                          prev.map((x) => x.domain === d.domain ? { ...x, ipscan_daily: e.target.checked } : x)
                        )}
                        className="rounded"
                      />
                      <span className="text-body text-[var(--text-primary)]">{d.domain}</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSaveDailyDomains} disabled={savingDailyDomains}>
                    <Save className="w-3.5 h-3.5" /> {savingDailyDomains ? "Saving..." : "Save Daily Domains"}
                  </Button>
                  <button className="text-caption text-[var(--color-accent)]" onClick={() => setDailyDomains((p) => p.map((x) => ({ ...x, ipscan_daily: true })))}>Select all</button>
                  <button className="text-caption text-[var(--text-tertiary)]" onClick={() => setDailyDomains((p) => p.map((x) => ({ ...x, ipscan_daily: false })))}>None</button>
                </div>
              </div>
            )}

            {/* Scan scope */}
            <div>
              <h4 className="text-subheading text-[var(--text-primary)] mb-3">Scan Scope</h4>
              <div className="space-y-2 mb-3">
                {[
                  { value: "all", label: "All monitored domains", desc: `${monitoredDomains.length} domains` },
                  { value: "domain", label: "Specific domain", desc: "Pick one from your list" },
                  { value: "custom", label: "Custom domains", desc: "Enter any domains manually" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setScope(opt.value as typeof scope)}
                    className={`w-full p-2.5 rounded-button text-left transition-colors flex items-center justify-between ${
                      scope === opt.value
                        ? "bg-[var(--color-accent)] bg-opacity-10 border border-[var(--color-accent)]"
                        : "bg-[var(--bg-tertiary)] border border-[var(--border-default)]"
                    }`}
                  >
                    <div>
                      <div className="text-body font-medium text-[var(--text-primary)]">{opt.label}</div>
                      <div className="text-caption text-[var(--text-tertiary)]">{opt.desc}</div>
                    </div>
                    <div className={`w-3 h-3 rounded-full border-2 ${scope === opt.value ? "bg-[var(--color-accent)] border-[var(--color-accent)]" : "border-[var(--border-default)]"}`} />
                  </button>
                ))}
              </div>

              {scope === "domain" && (
                <select
                  value={scopeDomain}
                  onChange={(e) => setScopeDomain(e.target.value)}
                  className="w-full px-3 py-2 rounded-button text-body bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[var(--text-primary)]"
                >
                  <option value="">Select domain...</option>
                  {monitoredDomains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}

              {scope === "custom" && (
                <div>
                  <textarea
                    rows={4}
                    placeholder="One domain per line e.g.&#10;example.com&#10;target.com"
                    value={customDomains}
                    onChange={(e) => setCustomDomains(e.target.value)}
                    className="w-full px-3 py-2 rounded-button text-body bg-[var(--bg-tertiary)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono resize-none"
                  />
                  <p className="text-caption text-[var(--text-tertiary)] mt-1">
                    {customDomains.split("\n").filter((d) => d.trim()).length} domain(s) entered
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Progress card */}
      {progress && (
        <Card className={`mb-4 p-4 border ${
          progress.phase === "done" ? "border-green-500/30 bg-green-500/5" :
          progress.phase === "stopped" ? "border-yellow-500/30 bg-yellow-500/5" :
          progress.done ? "border-[var(--border-default)]" :
          "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5"
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {!progress.done && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)]" />}
                <span className="text-body font-medium text-[var(--text-primary)]">
                  {PHASE_LABELS[progress.phase] || progress.phase}
                </span>
                <span className="text-caption text-[var(--text-tertiary)]">— {progress.detail}</span>
              </div>
              {/* Step indicators */}
              <div className="flex items-center gap-1 mt-2">
                {["shodan","masscan","httpx","screenshots","storing","done"].map((ph) => {
                  const phases = ["shodan","masscan","httpx","screenshots","storing","done"];
                  const currentIdx = phases.indexOf(progress.phase);
                  const thisIdx = phases.indexOf(ph);
                  const isDone = progress.phase === "done" || thisIdx < currentIdx;
                  const isActive = ph === progress.phase && !progress.done;
                  return (
                    <div key={ph} className="flex items-center gap-1">
                      <div className={`h-1.5 w-10 rounded-full transition-colors ${
                        isDone ? "bg-green-500" : isActive ? "bg-[var(--color-accent)]" : "bg-[var(--bg-tertiary)]"
                      }`} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              {/* Masscan live stats */}
              {progress.phase === "masscan" && progress.ips_total > 0 && (
                <>
                  <div className="text-caption font-medium text-[var(--text-primary)]">
                    {(progress.ports_found ?? 0).toLocaleString()} ports found
                  </div>
                  <div className="text-caption text-[var(--text-tertiary)]">
                    {(progress.ips_with_ports ?? 0).toLocaleString()} / {progress.ips_total.toLocaleString()} IPs
                  </div>
                  {(progress.eta_secs ?? 0) > 0 && (
                    <div className="text-caption text-[var(--color-accent)]">
                      ETA ~{Math.floor(progress.eta_secs / 60)}m {progress.eta_secs % 60}s
                    </div>
                  )}
                </>
              )}
              {/* Other phases */}
              {progress.phase !== "masscan" && (
                <>
                  {progress.ips > 0 && <div className="text-caption text-[var(--text-tertiary)]">{progress.ips.toLocaleString()} IPs</div>}
                  {progress.ports > 0 && <div className="text-caption text-[var(--text-tertiary)]">{progress.ports.toLocaleString()} open ports</div>}
                  {progress.live > 0 && <div className="text-caption text-[var(--text-tertiary)]">{progress.live.toLocaleString()} live</div>}
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Ports", value: stats?.total ?? 0, color: "var(--text-primary)" },
          { label: "New (24h)", value: stats?.new_today ?? 0, color: "var(--color-accent)" },
          { label: "Unique IPs", value: stats?.unique_ips ?? 0, color: "var(--text-primary)" },
          { label: "Critical", value: riskCounts["critical"] ?? 0, color: "#ef4444" },
          { label: "High", value: riskCounts["high"] ?? 0, color: "#f97316" },
        ].map((s) => (
          <Card key={s.label} className="text-center py-3">
            <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
            <div className="text-caption text-[var(--text-tertiary)] mt-1">{s.label}</div>
          </Card>
        ))}
      </div>


      {/* Domain filter sidebar */}
      {domainStats.length > 0 && (
        <div className="mb-4">
          <div className="text-caption text-[var(--text-tertiary)] mb-2 font-medium uppercase tracking-wide">Filter by Domain</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setDomainFilter(""); fetchResults(1, riskFilter, ""); }}
              className={`px-3 py-1.5 rounded-badge text-body transition-colors ${!domainFilter ? "bg-[var(--color-accent)] text-black" : "bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)]"}`}
            >
              All ({stats?.total ?? 0})
            </button>
            {domainStats.map((d) => (
              <button
                key={d.domain}
                onClick={() => { setDomainFilter(d.domain); fetchResults(1, riskFilter, d.domain); }}
                className={`px-3 py-1.5 rounded-badge text-body transition-colors flex items-center gap-1.5 ${domainFilter === d.domain ? "bg-[var(--color-accent)] text-black" : "bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--color-accent)]"}`}
              >
                <span>{d.domain}</span>
                <span className={`text-caption ${domainFilter === d.domain ? "text-black/70" : "text-[var(--text-tertiary)]"}`}>({d.total})</span>
                {d.critical > 0 && <span className="text-caption text-red-400 font-medium">{d.critical}C</span>}
                {d.high > 0 && <span className="text-caption text-orange-400">{d.high}H</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Risk filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setRiskFilter(""); fetchResults(1, ""); }}
          className={`px-3 py-1.5 rounded-badge text-body transition-colors ${!riskFilter ? "bg-[var(--color-accent)] text-black" : "bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)]"}`}
        >
          All
        </button>
        {RISKS.map((r) => (
          <button key={r} onClick={() => { setRiskFilter(r); fetchResults(1, r); }}
            className={`px-3 py-1.5 rounded-badge text-body capitalize border transition-colors ${riskFilter === r ? RISK_COLORS[r] : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-secondary)]"}`}
          >
            {r} {riskCounts[r] ? `(${riskCounts[r]})` : ""}
          </button>
        ))}
      </div>

      {/* Screenshot lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300" onClick={() => setLightbox(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={lightbox} alt="screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Results */}
      {loading ? (
        <TableSkeleton rows={10} />
      ) : results.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          No results yet — click &quot;Scan Now&quot; to run the Shodan + masscan pipeline
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((r) => {
            const isBig = r.risk === "critical" || r.risk === "high" || r.risk === "medium";
            return (
            <div key={r.id} className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
              <div
                className={`flex items-center gap-3 px-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors ${isBig ? "py-4" : "py-2.5"}`}
                onClick={() => toggleExpand(r.id)}
              >
                <span className={`shrink-0 font-medium px-2.5 rounded border capitalize ${isBig ? "text-body py-1" : "text-caption py-0.5"} ${RISK_COLORS[r.risk] || RISK_COLORS.standard}`}>
                  {r.risk}
                </span>
                <div className={`shrink-0 font-mono text-[var(--text-primary)] ${isBig ? "text-subheading" : "text-body"}`}>
                  {r.ip}:{r.port}
                  {r.status_code && <span className={`ml-2 text-[var(--text-tertiary)] ${isBig ? "text-body" : "text-caption"}`}>[{r.status_code}]</span>}
                </div>
                <div className="flex-1 min-w-0">
                  {r.title && <div className={`text-[var(--text-primary)] truncate ${isBig ? "text-body font-medium" : "text-body"}`}>{r.title}</div>}
                  <div className={`text-[var(--text-tertiary)] truncate ${isBig ? "text-body mt-0.5" : "text-caption"}`}>
                    {r.reason}
                    {r.tech_stack && <span className="ml-2 opacity-70">· {r.tech_stack}</span>}
                  </div>
                </div>
                {r.screenshot_path && (
                  <div className="relative shrink-0 group" onClick={(e) => { e.stopPropagation(); setLightbox(r.screenshot_path); }}>
                    <img src={r.screenshot_path} alt="ss"
                      className={`object-cover rounded border border-[var(--border-default)] cursor-zoom-in ${isBig ? "h-16 w-24" : "h-10 w-16"}`}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded flex items-center justify-center transition-opacity">
                      <ZoomIn className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}
                <div className="shrink-0 text-right">
                  {r.hostname && <div className={`text-[var(--text-tertiary)] truncate max-w-40 ${isBig ? "text-body" : "text-caption"}`}>{r.hostname.split(";")[0]}</div>}
                  <div className={`text-[var(--text-tertiary)] ${isBig ? "text-body" : "text-caption"}`}>{r.first_seen?.slice(0, 10)}</div>
                </div>
                <a href={`http://${r.ip}:${r.port}`} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--color-accent)]">
                  <ExternalLink className={isBig ? "w-5 h-5" : "w-4 h-4"} />
                </a>
                {expanded.has(r.id) ? <ChevronUp className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" />}
              </div>

              {expanded.has(r.id) && (
                <div className="px-4 pb-4 border-t border-[var(--border-subtle)]">
                  {r.screenshot_path && (
                    <div className="mt-3 mb-4 cursor-zoom-in" onClick={() => setLightbox(r.screenshot_path)}>
                      <img src={r.screenshot_path} alt="screenshot"
                        className="w-full max-h-64 object-cover rounded-lg border border-[var(--border-default)] hover:opacity-90 transition-opacity"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <p className="text-caption text-[var(--text-tertiary)] mt-1 flex items-center gap-1"><ZoomIn className="w-3 h-3" /> Click to expand</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2">
                    <div className="space-y-2">
                      <div><span className="text-caption text-[var(--text-tertiary)] block">IP</span><span className="text-body font-mono text-[var(--text-primary)]">{r.ip}</span></div>
                      <div><span className="text-caption text-[var(--text-tertiary)] block">Port</span><span className="text-body font-mono text-[var(--text-primary)]">{r.port}</span></div>
                      <div><span className="text-caption text-[var(--text-tertiary)] block">Risk</span><span className={`text-body capitalize ${RISK_COLORS[r.risk]?.split(" ")[0]}`}>{r.risk}</span></div>
                    </div>
                    <div className="space-y-2">
                      {r.hostname && <div><span className="text-caption text-[var(--text-tertiary)] block">Hostname</span><span className="text-body font-mono text-[var(--text-primary)] break-all">{r.hostname}</span></div>}
                      {r.web_server && <div><span className="text-caption text-[var(--text-tertiary)] block">Server</span><span className="text-body text-[var(--text-primary)]">{r.web_server}</span></div>}
                      {r.cdn && <div><span className="text-caption text-[var(--text-tertiary)] block">CDN</span><span className="text-body text-[var(--text-primary)]">{r.cdn}</span></div>}
                    </div>
                    <div className="space-y-2">
                      {r.tech_stack && <div><span className="text-caption text-[var(--text-tertiary)] block">Tech</span><span className="text-body text-[var(--text-primary)]">{r.tech_stack}</span></div>}
                      <div><span className="text-caption text-[var(--text-tertiary)] block">Why interesting</span><span className="text-body text-[var(--text-primary)]">{r.reason}</span></div>
                      <div><span className="text-caption text-[var(--text-tertiary)] block">First seen</span><span className="text-body text-[var(--text-primary)]">{r.first_seen?.slice(0, 10)}</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
          })}
          {total > perPage && (
            <Pagination page={page} pages={pages} total={total} perPage={perPage}
              onPageChange={(p) => { setPage(p); fetchResults(p, riskFilter); }} />
          )}
        </div>
      )}
    </div>
  );
}
