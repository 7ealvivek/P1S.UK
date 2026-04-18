"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Zap, ChevronDown, ChevronUp, Activity, Radio, Terminal, GitBranch, Globe, Shield, Bug, Copy, Check } from "lucide-react";

function getAuthHeader() { return { Authorization: `Bearer ${localStorage.getItem("p1w_token")}` }; }

interface AlertHunt {
  id: number; domain: string; status: string; started_at: string;
  finished_at: string | null; hypotheses_tested: number; findings_count: number; summary: string;
}
interface Finding {
  id: number; hunt_id: number; domain: string; subdomain: string | null;
  finding_type: string; severity: string; title: string; description: string;
  poc: string; created_at: string;
}
interface AlertHunterData {
  service_active: boolean; alert_hunts: AlertHunt[]; log_lines: string[];
  type_logs: Record<string, string>;
  recent_changes: { root_domain: string; change_type: string; cnt: number }[];
  active_hunts: { id: number; domain: string; summary: string }[];
  findings: Finding[];
}

const SEV: Record<string, { badge: string; dot: string }> = {
  critical: { dot: "bg-red-500", badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  high: { dot: "bg-orange-500", badge: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  medium: { dot: "bg-yellow-500", badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  low: { dot: "bg-blue-500", badge: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  info: { dot: "bg-gray-500", badge: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

export default function AlertHunterPage() {
  const [data, setData] = useState<AlertHunterData | null>(null);
  const [logTab, setLogTab] = useState<"live" | "changes" | "ports" | "tech">("live");
  const [loading, setLoading] = useState(true);
  const [expandedHunt, setExpandedHunt] = useState<number | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);
  const [copiedPoc, setCopiedPoc] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-hunter/alert-hunter", { headers: getAuthHeader() });
      const d = await res.json();
      if (d.data) setData(d.data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 5000); return () => clearInterval(i); }, [fetchData]);

  const huntType = (s: string) => {
    if (s?.includes("[CHANGES]")) return { label: "CHANGES", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30", icon: <GitBranch className="w-3 h-3" /> };
    if (s?.includes("[PORTS]")) return { label: "PORTS", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30", icon: <Radio className="w-3 h-3" /> };
    if (s?.includes("[TECH]")) return { label: "TECH", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", icon: <Shield className="w-3 h-3" /> };
    if (s?.includes("[SUBDOMAIN]")) return { label: "SUBDOMAIN", color: "text-pink-400", bg: "bg-pink-500/15 border-pink-500/30", icon: <Globe className="w-3 h-3" /> };
    return { label: "ALERT", color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30", icon: <Zap className="w-3 h-3" /> };
  };

  const copyPoc = (poc: string, id: number) => {
    navigator.clipboard.writeText(poc);
    setCopiedPoc(id);
    setTimeout(() => setCopiedPoc(null), 2000);
  };

  const activeCount = data?.active_hunts?.length || 0;
  const totalHunts = data?.alert_hunts?.length || 0;
  const totalFindings = data?.findings?.length || 0;
  const changeCount = data?.recent_changes?.length || 0;
  const critCount = data?.findings?.filter(f => f.severity === "critical").length || 0;
  const highCount = data?.findings?.filter(f => f.severity === "high").length || 0;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Header title="Alert Hunter" description="Separate Claude sessions — only bounty-paying targets" />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex justify-end">
          <span className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${data?.service_active ? "bg-green-500/15 border border-green-500/30 text-green-400" : "bg-red-500/15 border border-red-500/30 text-red-400"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${data?.service_active ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            {data?.service_active ? "LIVE — HUNTING" : loading ? "LOADING..." : "DOWN"}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4 border-cyan-500/20 bg-[var(--bg-secondary)]">
            <div className="text-3xl font-bold text-cyan-400">{activeCount}</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Hunting Now</div>
          </Card>
          <Card className="p-4 border-blue-500/20 bg-[var(--bg-secondary)]">
            <div className="text-3xl font-bold text-blue-400">{totalHunts}</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Total Hunts</div>
          </Card>
          <Card className="p-4 border-red-500/20 bg-[var(--bg-secondary)]">
            <div className="text-3xl font-bold text-red-400">{critCount}</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Critical Bugs</div>
          </Card>
          <Card className="p-4 border-orange-500/20 bg-[var(--bg-secondary)]">
            <div className="text-3xl font-bold text-orange-400">{highCount}</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">High Bugs</div>
          </Card>
          <Card className="p-4 border-yellow-500/20 bg-[var(--bg-secondary)]">
            <div className="text-3xl font-bold text-yellow-400">{changeCount}</div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">Changes (3h)</div>
          </Card>
        </div>

        {/* Active Hunts */}
        {data?.active_hunts && data.active_hunts.length > 0 && (
          <Card className="p-4 border-green-500/20 bg-[var(--bg-secondary)]">
            <div className="text-xs font-semibold text-green-400 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4" /> CLAUDE SESSIONS HUNTING NOW
            </div>
            <div className="flex flex-wrap gap-2">
              {data.active_hunts.map(h => {
                const ht = huntType(h.summary);
                return (
                  <div key={h.id} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border ${ht.bg} ${ht.color}`}>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    {ht.icon} {ht.label}: {h.domain}
                    <span className="text-[var(--text-tertiary)] font-normal text-xs">#{h.id}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* BUGS FOUND */}
        <Card className="p-4 border-red-500/20 bg-[var(--bg-secondary)]">
          <div className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-2">
            <Bug className="w-4 h-4" /> BUGS FOUND BY ALERT HUNTER ({totalFindings})
          </div>
          {data?.findings && data.findings.length > 0 ? (
            <div className="space-y-2">
              {data.findings.map(f => {
                const sev = SEV[f.severity] || SEV.info;
                const expanded = expandedFinding === f.id;
                return (
                  <div key={f.id} className={`rounded-lg bg-[var(--bg-primary)] border ${f.severity === "critical" ? "border-red-500/40" : "border-[var(--border-subtle)]"} overflow-hidden`}>
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors" onClick={() => setExpandedFinding(expanded ? null : f.id)}>
                      <span className={`w-2.5 h-2.5 rounded-full ${sev.dot}`} />
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${sev.badge}`}>{f.severity.toUpperCase()}</span>
                      <span className="text-xs text-[var(--text-primary)] font-semibold flex-1 truncate">{f.title}</span>
                      <span className="text-xs text-cyan-400 font-medium">{f.subdomain || f.domain}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">Hunt #{f.hunt_id}</span>
                      {expanded ? <ChevronUp className="w-3 h-3 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />}
                    </div>
                    {expanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[var(--border-subtle)]">
                        <div className="flex flex-wrap gap-4 pt-3 text-xs">
                          <div><span className="text-[var(--text-tertiary)]">Domain: </span><span className="text-[var(--text-primary)] font-medium">{f.domain}</span></div>
                          {f.subdomain && <div><span className="text-[var(--text-tertiary)]">Subdomain: </span><span className="text-[var(--text-primary)] font-medium">{f.subdomain}</span></div>}
                          <div><span className="text-[var(--text-tertiary)]">Type: </span><span className="text-[var(--text-primary)] font-medium">{f.finding_type}</span></div>
                          <div><span className="text-[var(--text-tertiary)]">Found: </span><span className="text-[var(--text-primary)] font-medium">{f.created_at}</span></div>
                        </div>
                        {f.description && (
                          <div>
                            <div className="text-[10px] font-semibold text-[var(--text-tertiary)] mb-1">DESCRIPTION</div>
                            <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{f.description}</div>
                          </div>
                        )}
                        {f.poc && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-[10px] font-semibold text-[var(--text-tertiary)]">PROOF OF CONCEPT</div>
                              <button onClick={(e) => { e.stopPropagation(); copyPoc(f.poc, f.id); }} className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300">
                                {copiedPoc === f.id ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                              </button>
                            </div>
                            <pre className="text-xs text-green-400 bg-black/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono border border-[var(--border-subtle)]">{f.poc}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[var(--text-tertiary)] text-center py-6 text-xs">No bugs found yet. Alert hunter is watching for changes on bounty targets...</div>
          )}
        </Card>

        {/* Recent Changes */}
        {data?.recent_changes && data.recent_changes.length > 0 && (
          <Card className="p-4 border-yellow-500/20 bg-[var(--bg-secondary)]">
            <div className="text-xs font-semibold text-yellow-400 mb-3">RECENT CHANGES (3h) — TRIGGERS FOR HUNTS</div>
            <div className="flex flex-wrap gap-2">
              {data.recent_changes.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                  <span className="text-[var(--text-primary)] font-medium">{c.root_domain}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    c.change_type === "new_subdomain" ? "bg-pink-500/15 text-pink-400 border border-pink-500/30" :
                    c.change_type === "port_change" ? "bg-orange-500/15 text-orange-400 border border-orange-500/30" :
                    c.change_type === "tech_change" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                    "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                  }`}>{c.change_type}</span>
                  <span className="text-cyan-400 font-bold">x{c.cnt}</span>
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Live Logs */}
        <Card className="p-4 border-cyan-500/20 bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" /> CLAUDE SESSION LOGS
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">Auto-refresh: 5s</div>
          </div>
          <div className="flex gap-1 mb-3">
            {(["live", "changes", "ports", "tech"] as const).map(t => (
              <button key={t} onClick={() => setLogTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  logTab === t
                    ? t === "changes" ? "bg-blue-500/15 border border-blue-500/30 text-blue-400"
                    : t === "ports" ? "bg-orange-500/15 border border-orange-500/30 text-orange-400"
                    : t === "tech" ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                    : "bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
                    : "bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}>
                {t === "live" ? "Live Feed" : t === "changes" ? "Changes Hunt" : t === "ports" ? "Ports Hunt" : "Tech Hunt"}
              </button>
            ))}
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg bg-black/40 p-4 font-mono text-xs leading-relaxed space-y-0.5 border border-[var(--border-subtle)]">
            {logTab === "live" ? (
              data?.log_lines && data.log_lines.length > 0 ? data.log_lines.map((line, i) => {
                const cl =
                  line.includes("Launching") ? "text-green-400 font-bold" :
                  line.includes("done") || line.includes("Done") ? "text-blue-400" :
                  line.includes("CHANGES") ? "text-blue-400/80" :
                  line.includes("PORTS") ? "text-orange-400/80" :
                  line.includes("TECH") ? "text-emerald-400/80" :
                  line.includes("Starting") ? "text-cyan-400 font-semibold" :
                  line.includes("Active") ? "text-yellow-400/70" :
                  line.includes("Hunt #") ? "text-green-300" :
                  line.includes("curl") || line.includes("->") ? "text-cyan-400/60" :
                  "text-gray-500";
                return <div key={i} className={cl}>{line.replace(/.*\[alert-hunter\]\s*/, "")}</div>;
              }) : <div className="text-gray-600 text-center py-8">Waiting for logs...</div>
            ) : (
              data?.type_logs?.[logTab] ? (
                data.type_logs[logTab].split("\n").map((line, i) => (
                  <div key={i} className={
                    line.includes("SAVED") || line.includes("FINDING") || line.includes("BUG") ? "text-red-400 font-bold" :
                    line.includes("Testing") || line.includes("Hypothesis") ? "text-yellow-400" :
                    line.includes("curl") ? "text-cyan-400/60" :
                    line.includes("Status:") ? "text-blue-400" :
                    "text-gray-500"
                  }>{line}</div>
                ))
              ) : <div className="text-gray-600 text-center py-8">No {logTab} hunt output yet.</div>
            )}
          </div>
        </Card>

        {/* Hunt History */}
        <Card className="p-4 border-purple-500/20 bg-[var(--bg-secondary)]">
          <div className="text-xs font-semibold text-[var(--text-secondary)] mb-3">HUNT HISTORY</div>
          <div className="space-y-1.5">
            {data?.alert_hunts?.map(h => {
              const ht = huntType(h.summary);
              const duration = h.finished_at && h.started_at
                ? Math.round((new Date(h.finished_at).getTime() - new Date(h.started_at).getTime()) / 1000)
                : null;
              const huntFindings = data.findings?.filter(f => f.hunt_id === h.id) || [];
              const isExpanded = expandedHunt === h.id;
              return (
                <div key={h.id}>
                  <div
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--bg-primary)] border ${huntFindings.length > 0 ? "border-red-500/30" : "border-[var(--border-subtle)]"} text-xs hover:border-[var(--border-default)] transition-colors ${huntFindings.length > 0 ? "cursor-pointer" : ""}`}
                    onClick={() => huntFindings.length > 0 && setExpandedHunt(isExpanded ? null : h.id)}
                  >
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border ${ht.bg} ${ht.color}`}>
                      {ht.icon} {ht.label}
                    </span>
                    <span className="text-[var(--text-primary)] font-semibold flex-1">{h.domain}</span>
                    <span className="text-[var(--text-tertiary)]">{h.hypotheses_tested || 0} tests</span>
                    {(h.findings_count || 0) > 0 && (
                      <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-bold border border-red-500/30">
                        {h.findings_count} BUGS
                      </span>
                    )}
                    {duration !== null && <span className="text-[var(--text-tertiary)]">{duration}s</span>}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      h.status === "running" ? "bg-green-500/15 text-green-400 border border-green-500/30" :
                      h.status === "done" ? "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]" :
                      "bg-red-500/15 text-red-400 border border-red-500/30"
                    }`}>{h.status}</span>
                    <span className="text-[var(--text-tertiary)] font-mono">{h.started_at?.slice(11, 16)}</span>
                    {huntFindings.length > 0 && (isExpanded ? <ChevronUp className="w-3 h-3 text-red-400" /> : <ChevronDown className="w-3 h-3 text-red-400" />)}
                  </div>
                  {isExpanded && huntFindings.length > 0 && (
                    <div className="ml-6 mt-1 space-y-1 mb-2">
                      {huntFindings.map(f => {
                        const sev = SEV[f.severity] || SEV.info;
                        return (
                          <div key={f.id} className="px-4 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${sev.badge}`}>{f.severity.toUpperCase()}</span>
                              <span className="text-[var(--text-primary)] font-medium">{f.title}</span>
                            </div>
                            {f.description && <div className="text-[var(--text-secondary)] text-[11px] mb-2 whitespace-pre-wrap">{f.description?.slice(0, 300)}</div>}
                            {f.poc && <pre className="text-green-400 bg-black/40 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">{f.poc}</pre>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {(!data?.alert_hunts || data.alert_hunts.length === 0) && (
              <div className="text-[var(--text-tertiary)] text-center py-6 text-xs">No hunts yet.</div>
            )}
          </div>
        </Card>

      </main>
    </div>
  );
}
