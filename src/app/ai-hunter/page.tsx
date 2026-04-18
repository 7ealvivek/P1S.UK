"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Brain, Crosshair, Link2, Clock, Play, ChevronDown, ChevronUp, Zap, Target, Copy, Check, ExternalLink, Square, Plus, X, Ban } from "lucide-react";

const SEV = {
  critical: { dot: "bg-red-500", badge: "bg-red-500/15 text-red-400 border-red-500/30", glow: "shadow-red-500/20 shadow-lg" },
  high: { dot: "bg-orange-500", badge: "bg-orange-500/15 text-orange-400 border-orange-500/30", glow: "shadow-orange-500/20 shadow-lg" },
};
const TYPE_LABELS: Record<string, string> = {
  idor: "IDOR", auth_bypass: "Auth Bypass", ssrf: "SSRF", rce: "RCE", sqli: "SQL Injection",
  privilege_escalation: "Privilege Escalation", account_takeover: "Account Takeover",
  jwt_weakness: "JWT Weakness", sensitive_data_exposure: "Data Exposure",
  subdomain_takeover: "Subdomain Takeover", business_logic: "Business Logic",
  race_condition: "Race Condition", broken_access_control: "Broken Access Control",
};

interface Hunt { id: number; domain: string; started_at: string; finished_at: string | null; status: string; targets_analyzed: number; hypotheses_tested: number; findings_count: number; chains_found: number; summary: string; }
interface Finding { id: number; hunt_id: number; domain: string; subdomain: string; finding_type: string; severity: string; title: string; description: string; poc: string; created_at: string; }
interface Chain { id: number; hunt_id: number; domain: string; title: string; severity: string; chain_steps: string; impact: string; full_report: string; created_at: string; }
interface Stats { total_hunts: number; total_findings: number; total_chains: number; by_severity: { severity: string; count: number }[]; by_type: { finding_type: string; count: number }[]; recent_hunts: Hunt[]; }

function getAuthHeader() { return { Authorization: `Bearer ${localStorage.getItem("p1w_token")}` }; }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="px-2 py-1 rounded text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
    >
      {copied ? <><Check className="w-3 h-3 inline mr-1" />Copied</> : <><Copy className="w-3 h-3 inline mr-1" />Copy PoC</>}
    </button>
  );
}


// ─── Alert Hunter Dashboard (Changes/Ports/Tech) ───────────────────

export default function AIHunterPage() {
  const [tab, setTab] = useState<"overview" | "findings" | "chains" | "hunts">("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [launchDomain, setLaunchDomain] = useState("");
  const [skipInput, setSkipInput] = useState("");
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [huntRunning, setHuntRunning] = useState(false);
  const [currentHunt, setCurrentHunt] = useState<{ id: number; domain: string; started_at: string } | null>(null);
  const logRef = { current: null as HTMLDivElement | null };
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set());
  const [expandedChains, setExpandedChains] = useState<Set<number>>(new Set());
  const [paused, setPaused] = useState(false);
  const [skippedDomains, setSkippedDomains] = useState<string[]>([]);
  const [findingPage, setFindingPage] = useState(1);
  const [findingPages, setFindingPages] = useState(1);
  const [chainPage, setChainPage] = useState(1);
  const [chainPages, setChainPages] = useState(1);
  const { toast } = useToast();

  const fetchStats = useCallback(async () => { try { const res = await fetch("/api/ai-hunter/stats", { headers: getAuthHeader() }); const d = await res.json(); setStats(d.data); if (d.data?.paused !== undefined) setPaused(d.data.paused); if (d.data?.skipped_domains) setSkippedDomains(d.data.skipped_domains); } catch {} finally { setLoading(false); } }, []);
  const fetchFindings = useCallback(async (p: number = 1) => { setLoading(true); try { const res = await fetch(`/api/ai-hunter/findings?page=${p}&per_page=30`, { headers: getAuthHeader() }); const d = await res.json(); setFindings(d.data || []); setFindingPage(d.meta?.page || 1); setFindingPages(d.meta?.pages || 1); } catch { toast("Failed to load findings", "error"); } finally { setLoading(false); } }, [toast]);
  const fetchChains = useCallback(async (p: number = 1) => { setLoading(true); try { const res = await fetch(`/api/ai-hunter/chains?page=${p}&per_page=20`, { headers: getAuthHeader() }); const d = await res.json(); setChains(d.data || []); setChainPage(d.meta?.page || 1); setChainPages(d.meta?.pages || 1); } catch { toast("Failed to load chains", "error"); } finally { setLoading(false); } }, [toast]);
  const fetchHunts = useCallback(async () => { setLoading(true); try { const res = await fetch("/api/ai-hunter/hunts?limit=50", { headers: getAuthHeader() }); const d = await res.json(); setHunts(d.data || []); } catch { toast("Failed to load hunts", "error"); } finally { setLoading(false); } }, [toast]);

  const launchHunt = async () => {
    if (!launchDomain.trim()) { toast("Enter a domain", "error"); return; }
    setLaunching(true);
    try {
      const res = await fetch("/api/ai-hunter/launch", { method: "POST", headers: { ...getAuthHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ domain: launchDomain.trim() }) });
      const d = await res.json();
      if (d.data?.status === "launched") { toast(`Hunting ${launchDomain}...`, "success"); setLaunchDomain(""); setTimeout(() => { fetchStats(); fetchHunts(); fetchLive(); }, 5000); }
      else toast(d.detail || "Failed to launch", "error");
    } catch { toast("Failed to launch hunt", "error"); }
    finally { setLaunching(false); }
  };

  const stopHunt = async () => {
    setStopping(true);
    try {
      const res = await fetch("/api/ai-hunter/stop", { method: "POST", headers: { ...getAuthHeader(), "Content-Type": "application/json" } });
      const d = await res.json();
      if (d.data?.stopped) {
        toast(`Stopped hunt on ${d.data.domain}`, "success");
        setHuntRunning(false);
        setCurrentHunt(null);
        setTimeout(() => { fetchStats(); fetchHunts(); fetchLive(); }, 2000);
      } else toast(d.detail || "Failed to stop", "error");
    } catch { toast("Failed to stop hunt", "error"); }
    finally { setStopping(false); }
  };

  const togglePause = async () => {
    try {
      const res = await fetch("/api/ai-hunter/pause", { method: "POST", headers: { ...getAuthHeader(), "Content-Type": "application/json" } });
      const d = await res.json();
      if (d.data) { setPaused(d.data.paused); toast(d.data.paused ? "Hunter PAUSED" : "Hunter RESUMED", "success"); }
    } catch { toast("Failed to toggle pause", "error"); }
  };

  const skipDomain = async (domain: string) => {
    if (!domain.trim()) return;
    try {
      const res = await fetch("/api/ai-hunter/skip", { method: "POST", headers: { ...getAuthHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ domain: domain.trim() }) });
      const d = await res.json();
      if (d.data) { setSkippedDomains(prev => prev.includes(domain.trim()) ? prev : [...prev, domain.trim()]); toast(`Never hunt ${domain}`, "success"); fetchStats(); }
    } catch { toast("Failed to skip", "error"); }
  };

  const unskipDomain = async (domain: string) => {
    try {
      const res = await fetch("/api/ai-hunter/unskip", { method: "POST", headers: { ...getAuthHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
      const d = await res.json();
      if (d.data) { setSkippedDomains(prev => prev.filter(d => d !== domain)); toast(`Removed ${domain} from skip list`, "success"); fetchStats(); }
    } catch { toast("Failed to unskip", "error"); }
  };

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-hunter/live?lines=80", { headers: getAuthHeader() });
      const d = await res.json();
      if (d.data) {
        setLiveLog(d.data.log || []);
        setHuntRunning(d.data.running);
        setCurrentHunt(d.data.current_hunt);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); fetchLive(); }, [fetchStats, fetchLive]);
  useEffect(() => { if (tab === "findings") fetchFindings(); if (tab === "chains") fetchChains(); if (tab === "hunts") fetchHunts(); }, [tab, fetchFindings, fetchChains, fetchHunts]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLive();
      fetchStats();
      if (tab === "hunts") fetchHunts();
      if (tab === "findings") fetchFindings(findingPage);
      if (tab === "chains") fetchChains(chainPage);
    }, huntRunning ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [tab, findingPage, chainPage, huntRunning, fetchStats, fetchHunts, fetchFindings, fetchChains, fetchLive]);

  const crits = stats?.by_severity?.reduce((a, b) => a + (b.severity === "critical" ? b.count : 0), 0) || 0;
  const highs = stats?.by_severity?.reduce((a, b) => a + (b.severity === "high" ? b.count : 0), 0) || 0;

  return (
    <>
      <Header title="AI Hunter" />

      <div className="px-6 space-y-6">
        {/* Launch Bar */}
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/10 via-red-500/10 to-orange-500/10 blur-xl" />
          <Card className="relative p-5 border-purple-500/20 bg-[var(--bg-secondary)]/80 backdrop-blur">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">Launch Hunt</div>
                <div className="flex gap-3">
                  <input
                    type="text" value={launchDomain} onChange={(e) => setLaunchDomain(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && launchHunt()}
                    placeholder="Target domain — e.g. unisys.com"
                    className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 placeholder:text-[var(--text-tertiary)]"
                  />
                  <Button onClick={launchHunt} disabled={launching} className="px-6 bg-purple-500 hover:bg-purple-600 text-white border-0 font-medium">
                    {launching ? <Clock className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    {launching ? "Launching..." : "Hunt"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 pl-14">
              <div className="flex gap-6 text-xs text-[var(--text-tertiary)] flex-1">
                <span>Opus 4.6 · Max Effort</span>
                <span>Chains vulns into crits</span>
                <span>Only saves P1/P2 bugs</span>
                <span>24/7 autonomous</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={togglePause} className={`px-3 py-1 text-xs border font-medium ${paused ? "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30" : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"}`}>
                  {paused ? "Resume Daemon" : "Pause Daemon"}
                </Button>
                {huntRunning && (
                  <Button onClick={stopHunt} disabled={stopping} className="px-3 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 font-medium">
                    <Square className="w-3 h-3 mr-1.5 fill-current" />
                    {stopping ? "Skipping..." : `Skip ${currentHunt?.domain || "Hunt"} ⏭`}
                  </Button>
                )}
              </div>
            </div>
            {paused && (
              <div className="mt-2 ml-14 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium">
                PAUSED — daemon will not start new hunts until resumed. You can still launch manual hunts above.
              </div>
            )}

            {/* Never Hunt List */}
            <div className="mt-3 ml-14">
              <div className="flex items-center gap-2 mb-2">
                <Ban className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Never Hunt List</span>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  type="text" value={skipInput} onChange={(e) => setSkipInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && skipInput.trim()) { skipDomain(skipInput.trim()); setSkipInput(""); } }}
                  placeholder="Add domain to never hunt..."
                  className="flex-1 max-w-xs px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 placeholder:text-[var(--text-tertiary)]"
                />
                <Button
                  onClick={() => { if (skipInput.trim()) { skipDomain(skipInput.trim()); setSkipInput(""); } }}
                  className="px-3 py-1.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 font-medium"
                >
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              {skippedDomains.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skippedDomains.map(d => (
                    <span key={d} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                      <Ban className="w-3 h-3" />
                      {d}
                      <button onClick={() => unskipDomain(d)} className="ml-1 hover:text-white transition-colors"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">No domains blocked. Add domains you never want to hunt.</span>
              )}
            </div>
          </Card>
        </div>

        {/* Live Activity */}
        <Card className={`p-4 ${huntRunning ? "border-green-500/30" : "border-[var(--border-subtle)]"} bg-[var(--bg-secondary)]`}>
          <div className="flex items-center gap-3 mb-3">
            {huntRunning && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {huntRunning ? `Hunting ${currentHunt?.domain || ""}...` : "Hunt Activity"}
            </span>
            {huntRunning && !paused && <span className="text-xs text-green-400 ml-auto font-mono tracking-wider">LIVE</span>}
            {paused && !huntRunning && <span className="text-xs text-yellow-400 ml-auto font-mono tracking-wider">PAUSED</span>}
            {!huntRunning && !paused && liveLog.length > 0 && <span className="text-xs text-[var(--text-tertiary)] ml-auto">Last run</span>}
          </div>
          <div
            ref={(el) => { logRef.current = el; if (el && huntRunning) el.scrollTop = el.scrollHeight; }}
            className="max-h-96 overflow-y-auto rounded-lg bg-[var(--bg-primary)] p-3 font-mono text-xs leading-relaxed space-y-0.5"
          >
            {liveLog.length > 0 ? liveLog.map((line, i) => {
              const clean = line.replace(/.*\[ai-hunter\]\s*/, "");
              const cl =
                clean.includes("SAVED") || clean.includes("***") ? "text-red-400 font-bold" :
                clean.includes("FINDING") || clean.includes("CHAIN") ? "text-orange-400 font-semibold" :
                clean.includes("[thinking]") || clean.includes("[THINKING]") ? "text-purple-400/70 italic" :
                clean.includes("Hunt #") && clean.includes("started") ? "text-green-400 font-semibold" :
                clean.includes("Done:") || clean.includes("finished") ? "text-blue-400" :
                clean.includes("-> Bash") || clean.includes("[TOOL]") || clean.includes("curl") ? "text-cyan-400/80" :
                clean.includes("Intel gathered") ? "text-yellow-400/70" :
                clean.includes("ERROR") || clean.includes("error") || clean.includes("stderr") ? "text-red-400/70" :
                clean.includes("Stopped") || clean.includes("stopped") ? "text-red-400 font-semibold" :
                clean.includes("Launching") || clean.includes("DAEMON") ? "text-green-400/70" :
                "text-[var(--text-tertiary)]";
              return <div key={i} className={cl}>{clean}</div>;
            }) : (
              <div className="text-[var(--text-tertiary)] text-center py-4">No activity yet. Launch a hunt or wait for auto-trigger.</div>
            )}
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2">
          {([
            { key: "overview", icon: Brain, label: "Overview" },
            { key: "chains", icon: Link2, label: `Chains${stats ? ` (${stats.total_chains})` : ""}` },
            { key: "findings", icon: Crosshair, label: `Findings${stats ? ` (${stats.total_findings})` : ""}` },
            { key: "hunts", icon: Clock, label: "Hunt Log" },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? "bg-purple-500/15 border border-purple-500/30 text-purple-400" : "bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-default)]"
              }`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              {[
                { value: stats?.total_hunts || 0, label: "Hunts Completed", color: "purple", icon: Brain },
                { value: stats?.total_chains || 0, label: "Attack Chains", color: "red", icon: Link2 },
                { value: crits, label: "Critical Bugs", color: "red", icon: Zap },
                { value: highs, label: "High Bugs", color: "orange", icon: Target },
              ].map((s, i) => (
                <Card key={i} className={`p-5 border-${s.color}-500/20 relative overflow-hidden`}>
                  <div className={`absolute top-0 right-0 w-20 h-20 bg-${s.color}-500/5 rounded-bl-full`} />
                  <s.icon className={`w-5 h-5 text-${s.color}-400 mb-2`} />
                  <div className={`text-3xl font-bold text-${s.color}-400`}>{s.value}</div>
                  <div className="text-xs text-[var(--text-tertiary)] mt-1">{s.label}</div>
                </Card>
              ))}
            </div>

            {stats?.by_type && stats.by_type.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Bug Types Found</h3>
                <div className="flex flex-wrap gap-2">
                  {stats.by_type.map((t) => (
                    <span key={t.finding_type} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/10 border border-purple-500/20 text-purple-300">
                      {TYPE_LABELS[t.finding_type] || t.finding_type} <span className="text-purple-400 font-bold ml-1">{t.count}</span>
                    </span>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Hunts</h3>
              {(!stats?.recent_hunts || stats.recent_hunts.length === 0) ? (
                <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">No hunts yet. Launch one above.</div>
              ) : (
                <div className="space-y-2">
                  {stats.recent_hunts.map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${h.status === "running" ? "bg-yellow-400 animate-pulse" : h.status === "done" ? "bg-green-400" : h.status === "stopped" ? "bg-red-400" : "bg-gray-400"}`} />
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{h.domain}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">{h.started_at?.replace("T", " ").slice(0, 16)}</span>
                      </div>
                      <div className="flex items-center gap-5 text-xs">
                        <span className="text-[var(--text-tertiary)]"><Zap className="w-3 h-3 inline mr-1" />{h.hypotheses_tested} tests</span>
                        <span className={h.findings_count > 0 ? "text-orange-400 font-bold" : "text-[var(--text-tertiary)]"}><Crosshair className="w-3 h-3 inline mr-1" />{h.findings_count} bugs</span>
                        <span className={h.chains_found > 0 ? "text-red-400 font-bold" : "text-[var(--text-tertiary)]"}><Link2 className="w-3 h-3 inline mr-1" />{h.chains_found} chains</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {loading && !stats && <TableSkeleton rows={5} />}
          </div>
        )}

        {/* Chains Tab */}
        {tab === "chains" && (
          <div className="space-y-4">
            {chains.length === 0 && !loading && (
              <Card className="p-12 text-center">
                <Link2 className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                <div className="text-[var(--text-secondary)] font-medium">No chains yet</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">When AI Hunter combines multiple vulnerabilities into a critical attack, chains appear here.</div>
              </Card>
            )}
            {chains.map((c) => {
              const steps = (() => { try { return JSON.parse(c.chain_steps); } catch { return []; } })();
              const isExpanded = expandedChains.has(c.id);
              const sev = SEV[c.severity as keyof typeof SEV] || SEV.high;
              return (
                <Card key={c.id} className={`overflow-hidden border-l-2 ${c.severity === "critical" ? "border-l-red-500" : "border-l-orange-500"} ${sev.glow}`}>
                  <div onClick={() => setExpandedChains(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-black uppercase border ${sev.badge}`}>{c.severity}</span>
                      <Link2 className="w-4 h-4 text-red-400" />
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{c.title}</div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{c.domain} · {steps.length} steps · {c.created_at?.slice(0, 10)}</div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-[var(--border-subtle)] space-y-4 pt-4">
                      <div>
                        <div className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-2">Attack Chain</div>
                        <div className="space-y-2 pl-2 border-l-2 border-purple-500/30">
                          {steps.map((step: string, i: number) => (
                            <div key={i} className="flex items-start gap-3 pl-3">
                              <span className="shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                              <span className="text-sm text-[var(--text-secondary)] leading-relaxed">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                        <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Impact</div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">{c.impact}</p>
                      </div>
                      {c.full_report && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-bold text-green-400 uppercase tracking-widest">Ready-to-Submit Report</div>
                            <CopyButton text={c.full_report} />
                          </div>
                          <pre className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] whitespace-pre-wrap overflow-auto max-h-[500px] leading-relaxed">{c.full_report}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
            {chainPages > 1 && <Pagination page={chainPage} pages={chainPages} total={chains.length} perPage={20} onPageChange={(p) => fetchChains(p)} />}
            {loading && <TableSkeleton rows={3} />}
          </div>
        )}

        {/* Findings Tab */}
        {tab === "findings" && (
          <div className="space-y-3">
            {findings.length === 0 && !loading && (
              <Card className="p-12 text-center">
                <Crosshair className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                <div className="text-[var(--text-secondary)] font-medium">No findings yet</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">Only confirmed critical and high severity bugs appear here. No junk.</div>
              </Card>
            )}
            {findings.map((f) => {
              const isExpanded = expandedFindings.has(f.id);
              const sev = SEV[f.severity as keyof typeof SEV] || SEV.high;
              return (
                <Card key={f.id} className={`overflow-hidden border-l-2 ${f.severity === "critical" ? "border-l-red-500" : "border-l-orange-500"}`}>
                  <div onClick={() => setExpandedFindings(prev => { const n = new Set(prev); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })}
                    className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded text-xs font-black uppercase border ${sev.badge}`}>{f.severity}</span>
                      <span className="px-2 py-0.5 rounded text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">{TYPE_LABELS[f.finding_type] || f.finding_type}</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{f.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                      <code className="text-purple-400 text-xs">{f.subdomain}</code>
                      <span>{f.created_at?.slice(0, 10)}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-[var(--border-subtle)] space-y-4 pt-4">
                      <div>
                        <div className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1">Description</div>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.description}</p>
                      </div>
                      {f.poc && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-bold text-green-400 uppercase tracking-widest">Proof of Concept</div>
                            <CopyButton text={f.poc} />
                          </div>
                          <pre className="p-4 rounded-lg bg-[var(--bg-primary)] border border-green-500/20 text-xs text-green-300/80 whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed font-mono">{f.poc}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
            {findingPages > 1 && <Pagination page={findingPage} pages={findingPages} total={findings.length} perPage={30} onPageChange={(p) => fetchFindings(p)} />}
            {loading && <TableSkeleton rows={5} />}
          </div>
        )}

        {/* Hunts Tab */}
        {tab === "hunts" && (
          <div className="space-y-2">
            {hunts.length === 0 && !loading && (
              <Card className="p-12 text-center">
                <Clock className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                <div className="text-[var(--text-secondary)] font-medium">No hunts yet</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">Launch a hunt above or wait for the nightly run at 2 AM UTC.</div>
              </Card>
            )}
            {hunts.map((h) => (
              <Card key={h.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${h.status === "running" ? "bg-yellow-400 animate-pulse" : h.status === "done" ? "bg-green-400" : h.status === "stopped" ? "bg-red-400" : "bg-gray-400"}`} />
                    <span className="text-sm font-bold text-[var(--text-primary)]">{h.domain}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${h.status === "running" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : h.status === "done" ? "bg-green-500/10 text-green-400 border-green-500/30" : h.status === "stopped" ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-gray-500/10 text-gray-400 border-gray-500/30"}`}>{h.status}</span>
                  </div>
                  <div className="flex items-center gap-5 text-xs text-[var(--text-tertiary)]">
                    <span><Zap className="w-3 h-3 inline mr-1" />{h.hypotheses_tested} tests</span>
                    <span className={h.findings_count > 0 ? "text-orange-400 font-bold" : ""}>{h.findings_count} bugs</span>
                    <span className={h.chains_found > 0 ? "text-red-400 font-bold" : ""}>{h.chains_found} chains</span>
                    <span>{h.started_at?.replace("T", " ").slice(0, 16)}</span>
                    {h.finished_at && <span className="text-green-400">{Math.round((new Date(h.finished_at).getTime() - new Date(h.started_at).getTime()) / 60000)}min</span>}
                  </div>
                </div>
                {h.summary && <div className="mt-2 text-xs text-[var(--text-tertiary)] pl-6">{h.summary}</div>}
              </Card>
            ))}
            {loading && <TableSkeleton rows={8} />}
          </div>
        )}
      </div>
    </>
  );
}
