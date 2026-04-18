"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { timeAgo, copyToClipboard } from "@/lib/utils";
import { FileCode, Copy, ExternalLink, Key, Link2, Play, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface JSFinding {
  id: number;
  domain: string;
  subdomain: string;
  js_url: string;
  finding_type: string;
  key_name: string | null;
  value_preview: string | null;
  severity: string;
  found_at: string;
}

interface Stats {
  total: number;
  secrets: number;
  endpoints: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  top_keys: Array<{ key_name: string; count: number }>;
}

interface ScanJob {
  id: string;
  domain: string;
  subdomains: string;
  status: string;
  total: number;
  done: number;
  findings: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

const SEV_VARIANT: Record<string, string> = {
  critical: "critical", high: "high", medium: "medium", low: "low", info: "info",
};

const TYPE_VARIANT: Record<string, string> = {
  secret: "critical", api_key: "high", token: "high", endpoint: "info", url: "info",
};

export default function JSAnalysisPage() {
  const [findings, setFindings] = useState<JSFinding[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sevFilter, setSevFilter] = useState("");

  // Custom scan state
  const [scanExpanded, setScanExpanded] = useState(false);
  const [scanDomain, setScanDomain] = useState("");
  const [scanSubdomains, setScanSubdomains] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanJobId, setScanJobId] = useState<string | null>(null);
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [scanFindings, setScanFindings] = useState<JSFinding[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (typeFilter) params.finding_type = typeFilter;
      if (sevFilter) params.severity = sevFilter;
      const [fRes, sRes] = await Promise.all([
        api.fetch<any>("/api/js-analysis/findings?" + new URLSearchParams(params)),
        api.fetch<any>("/api/js-analysis/stats"),
      ]);
      setFindings((fRes as any).data || []);
      setStats((sRes as any).data as Stats);
    } catch {
      toast("Failed to load JS findings", "error");
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, sevFilter]);

  useEffect(() => { load(); }, [load]);

  // Poll scan job status
  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await api.fetch<any>(`/api/elite/js-scan/${jobId}`);
      const { job, findings: jf } = (res as any).data || {};
      if (job) {
        setScanJob(job);
        setScanFindings(jf || []);
        if (job.status === "done" || job.status === "error") {
          setScanning(false);
          if (pollRef.current) clearInterval(pollRef.current);
          if (job.status === "done") {
            toast(`Scan complete — ${job.findings} findings`, "success");
            load(); // refresh main table
          } else {
            toast("Scan failed — check logs", "error");
          }
        }
      }
    } catch {
      // ignore poll errors
    }
  }, [load]);

  useEffect(() => {
    if (scanJobId && scanning) {
      pollRef.current = setInterval(() => pollJob(scanJobId), 3000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [scanJobId, scanning, pollJob]);

  const startScan = async () => {
    const domain = scanDomain.trim();
    const subs = scanSubdomains.split("\n").map(s => s.trim()).filter(Boolean);
    if (!domain) { toast("Enter a domain", "error"); return; }
    if (!subs.length) { toast("Enter at least one subdomain", "error"); return; }
    if (subs.length > 50) { toast("Max 50 subdomains per scan", "error"); return; }

    setScanning(true);
    setScanJob(null);
    setScanFindings([]);
    try {
      const res = await api.fetch<any>("/api/elite/js-scan", {
        method: "POST",
        body: JSON.stringify({ domain, subdomains: subs }),
      });
      const jobId = (res as any).data?.job_id;
      setScanJobId(jobId);
      toast(`Scan started for ${subs.length} subdomains`, "success");
    } catch (e: any) {
      toast(e?.message || "Failed to start scan", "error");
      setScanning(false);
    }
  };

  const copy = async (text: string) => {
    await copyToClipboard(text);
    toast("Copied", "success");
  };

  const scanProgress = scanJob ? Math.round((scanJob.done / Math.max(scanJob.total, 1)) * 100) : 0;
  const parsedSubs = scanJob ? (() => { try { return JSON.parse(scanJob.subdomains || "[]"); } catch { return []; } })() : [];

  return (
    <div className="flex flex-col h-full">
      <Header title="JS Analysis" description="Secrets and endpoints extracted from JavaScript files via katana + jsluice + trufflehog" />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Custom Scan Panel ────────────────────────────────────────── */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          <button
            onClick={() => setScanExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-hover)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Play className="w-4 h-4 text-[var(--color-accent)]" />
              <span className="font-medium text-[var(--text-primary)]">Custom JS Scan</span>
              <span className="text-caption text-[var(--text-tertiary)]">Scan specific subdomains on demand</span>
            </div>
            {scanExpanded ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
          </button>

          {scanExpanded && (
            <div className="border-t border-[var(--border-default)] p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Inputs */}
                <div className="space-y-3">
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] block mb-1">Root Domain</label>
                    <Input
                      placeholder="example.com"
                      value={scanDomain}
                      onChange={e => setScanDomain(e.target.value)}
                      disabled={scanning}
                    />
                  </div>
                  <div>
                    <label className="text-caption text-[var(--text-tertiary)] block mb-1">
                      Subdomains <span className="text-[var(--text-muted)]">(one per line, max 50)</span>
                    </label>
                    <textarea
                      placeholder={"api.example.com\nstaging.example.com\napp.example.com"}
                      value={scanSubdomains}
                      onChange={e => setScanSubdomains(e.target.value)}
                      disabled={scanning}
                      rows={6}
                      className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-primary)] font-mono text-caption placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-y disabled:opacity-50"
                    />
                    <p className="text-caption text-[var(--text-muted)] mt-1">
                      {scanSubdomains.split("\n").filter(s => s.trim()).length} subdomains entered
                    </p>
                  </div>
                  <button
                    onClick={startScan}
                    disabled={scanning}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-button font-medium text-body hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {scanning ? "Scanning..." : "Scan Now"}
                  </button>
                </div>

                {/* Progress / Status */}
                <div className="space-y-3">
                  {scanJob ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-caption text-[var(--text-secondary)]">Status</span>
                        <Badge variant={
                          scanJob.status === "done" ? "low" :
                          scanJob.status === "error" ? "critical" :
                          scanJob.status === "running" ? "high" : "default"
                        }>
                          {scanJob.status}
                        </Badge>
                      </div>
                      <div>
                        <div className="flex justify-between text-caption text-[var(--text-tertiary)] mb-1">
                          <span>{scanJob.done} / {scanJob.total} subdomains</span>
                          <span>{scanProgress}%</span>
                        </div>
                        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-500"
                            style={{ width: `${scanProgress}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-[var(--bg-tertiary)] rounded p-2">
                          <div className="text-lg font-bold text-[var(--color-critical)]">{scanJob.findings}</div>
                          <div className="text-caption text-[var(--text-muted)]">Findings</div>
                        </div>
                        <div className="bg-[var(--bg-tertiary)] rounded p-2">
                          <div className="text-lg font-bold text-[var(--text-primary)]">{scanJob.done}</div>
                          <div className="text-caption text-[var(--text-muted)]">Scanned</div>
                        </div>
                        <div className="bg-[var(--bg-tertiary)] rounded p-2">
                          <div className="text-lg font-bold text-[var(--text-secondary)]">{parsedSubs.length}</div>
                          <div className="text-caption text-[var(--text-muted)]">Total</div>
                        </div>
                      </div>
                      {scanJob.status === "running" && (
                        <p className="text-caption text-[var(--text-muted)] flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Running katana + jsluice + trufflehog + gf…
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8 text-[var(--text-muted)]">
                      <FileCode className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-body">Enter subdomains and click Scan Now</p>
                      <p className="text-caption mt-1">Runs katana, gau, jsluice, trufflehog, gf + regex</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Live findings from this scan */}
              {scanFindings.length > 0 && (
                <div className="border-t border-[var(--border-default)] pt-4">
                  <p className="text-caption text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
                    <Key className="w-3.5 h-3.5" /> Live Findings from This Scan ({scanFindings.length})
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {scanFindings.map(f => (
                      <div key={f.id} className="flex items-start gap-3 p-3 bg-[var(--bg-tertiary)] rounded border border-[var(--border-default)]">
                        <Badge variant={(SEV_VARIANT[f.severity] || "default") as any} className="shrink-0">{f.severity}</Badge>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-caption font-mono text-[var(--color-accent)]">{f.key_name || f.finding_type}</span>
                            <span className="text-caption text-[var(--text-muted)]">{f.subdomain}</span>
                          </div>
                          {f.value_preview && (
                            <code className="text-caption text-[var(--text-secondary)] font-mono block mt-0.5">{f.value_preview}</code>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {f.value_preview && (
                            <button onClick={() => copy(f.value_preview!)}
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)]">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <a href={f.js_url} target="_blank" rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)]">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Total</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-critical)]">{stats.secrets}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Secrets</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-info)]">{stats.endpoints}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Endpoints</div>
            </div>
            {["critical","high"].map(s => (
              <div key={s} className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
                <div className={`text-2xl font-bold text-[var(--color-${s})]`}>{stats.by_severity?.[s] || 0}</div>
                <div className="text-caption text-[var(--text-tertiary)] capitalize">{s}</div>
              </div>
            ))}
          </div>
        )}

        {/* Top keys */}
        {stats?.top_keys && stats.top_keys.length > 0 && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4">
            <div className="text-caption text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
              <Key className="w-3.5 h-3.5" /> Top Secret Keys Found
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.top_keys.map(k => (
                <span key={k.key_name} className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded text-caption">
                  <span className="text-[var(--color-critical)] font-mono">{k.key_name}</span>
                  <span className="text-[var(--text-tertiary)]">×{k.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search key / URL..." value={search} onChange={e => setSearch(e.target.value)} className="w-60" />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-secondary)]">
            <option value="">All Types</option>
            {["secret","api_key","token","endpoint","url"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-secondary)]">
            <option value="">All Severities</option>
            {["critical","high","medium","low","info"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)]">
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Type</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Key / Pattern</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Value (preview)</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Severity</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Host</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">JS File</th>
                <th className="px-4 py-3 text-left text-[var(--text-secondary)] font-medium">Found</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
              ) : findings.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-[var(--text-tertiary)]">
                  <FileCode className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>No JS findings yet.</p>
                  <p className="text-caption mt-1">Use the Custom JS Scan above or wait for the next domain sweep.</p>
                </td></tr>
              ) : findings.map(f => (
                <tr key={f.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-3">
                    <Badge variant={(TYPE_VARIANT[f.finding_type] || "default") as any}>{f.finding_type}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-caption text-[var(--color-accent)]">{f.key_name || "-"}</td>
                  <td className="px-4 py-3">
                    <code className="text-caption text-[var(--text-secondary)] font-mono">{f.value_preview || "-"}</code>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={(SEV_VARIANT[f.severity] || "default") as any}>{f.severity}</Badge>
                  </td>
                  <td className="px-4 py-3 text-caption text-[var(--text-secondary)]">{f.subdomain}</td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <a href={f.js_url} target="_blank" rel="noopener noreferrer"
                      className="text-caption text-[var(--color-accent)] hover:underline truncate block">
                      {f.js_url.replace(/^https?:\/\//, "").substring(0, 40)}…
                    </a>
                  </td>
                  <td className="px-4 py-3 text-caption text-[var(--text-tertiary)]">{timeAgo(f.found_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {f.value_preview && (
                        <button onClick={() => copy(f.value_preview!)}
                          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a href={f.js_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)]">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
