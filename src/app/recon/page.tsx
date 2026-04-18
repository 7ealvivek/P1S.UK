"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { ExternalLink, Shield, Code, Cloud, GitBranch, Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

type Tab = "admin" | "graphql" | "s3" | "github";

interface AdminPanel  { id: number; domain: string; subdomain: string; url: string; panel_type: string; status_code: number; title: string | null; path: string; first_seen: string; }
interface GraphQL     { id: number; domain: string; subdomain: string; url: string; introspection_enabled: number; query_count: number; first_seen: string; }
interface S3          { id: number; domain: string; bucket_name: string; region: string | null; is_public: number | null; is_listable: number; status: string; first_seen: string; }
interface GitHubSecret{ id: number; domain: string; repo_url: string; raw_url: string | null; secret_type: string; secret_value: string | null; file_path: string | null; line_number: number | null; verified: number; first_seen: string; discovered_at: string; }

interface Stats {
  admin_panels: number;
  git_exposed: number;
  env_exposed: number;
  graphql_total: number;
  graphql_introspection: number;
  s3_total: number;
  s3_public: number;
  github_secrets: number;
  by_panel_type: Array<{ panel_type: string; count: number }>;
}

const PANEL_SEVERITY: Record<string, { variant: string; label: string }> = {
  // Critical exposures
  "env-exposure":       { variant: "critical", label: ".ENV File" },
  "git-exposure":       { variant: "critical", label: ".GIT Exposed" },
  "backup-exposure":    { variant: "critical", label: "Backup File" },
  "config-exposure":    { variant: "critical", label: "Config File" },
  "k8s-api":            { variant: "critical", label: "K8s API" },
  "elasticsearch":      { variant: "critical", label: "Elasticsearch" },
  // High severity
  "spring-actuator":    { variant: "high",     label: "Actuator" },
  "adminer":            { variant: "high",     label: "Adminer" },
  "phpmyadmin":         { variant: "high",     label: "phpMyAdmin" },
  "portainer":          { variant: "high",     label: "Portainer" },
  "jenkins":            { variant: "high",     label: "Jenkins" },
  "phpinfo":            { variant: "high",     label: "phpinfo" },
  "server-status":      { variant: "high",     label: "Server Status" },
  "log-exposure":       { variant: "high",     label: "Log File" },
  "sourcemap-exposure": { variant: "high",     label: "Source Map" },
  "debug-endpoint":     { variant: "high",     label: "Debug Endpoint" },
  "laravel-debug":      { variant: "high",     label: "Laravel Debug" },
  "h2-console":         { variant: "high",     label: "H2 Console" },
  "jboss":              { variant: "high",     label: "JBoss Console" },
  "tomcat":             { variant: "high",     label: "Tomcat Manager" },
  "dotnet-debug":       { variant: "high",     label: ".NET Debug" },
  "svn-exposure":       { variant: "high",     label: "SVN Exposed" },
  "hg-exposure":        { variant: "high",     label: "Mercurial Exposed" },
  // Medium severity
  "grafana":            { variant: "medium",   label: "Grafana" },
  "kibana":             { variant: "medium",   label: "Kibana" },
  "wordpress":          { variant: "medium",   label: "WordPress" },
  "swagger":            { variant: "medium",   label: "Swagger" },
  "cpanel":             { variant: "medium",   label: "cPanel" },
  "whm":                { variant: "medium",   label: "WHM" },
  "metrics":            { variant: "medium",   label: "Metrics" },
  "solr":               { variant: "medium",   label: "Solr Admin" },
  "webmail":            { variant: "medium",   label: "Webmail" },
  "druid":              { variant: "medium",   label: "Druid Console" },
  "k8s-endpoint":       { variant: "medium",   label: "K8s Health" },
  "ds-store":           { variant: "medium",   label: ".DS_Store" },
  // Low / Info
  "generic":            { variant: "default",  label: "Panel" },
};

function fmt(d: string) {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z");
  if (isNaN(dt.getTime())) return "—";
  const diff = Date.now() - dt.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff/60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

const TABS = [
  { id: "admin" as Tab,   label: "Admin Panels",   icon: Shield,    statKey: "admin_panels"      },
  { id: "graphql" as Tab, label: "GraphQL",         icon: Code,      statKey: "graphql_introspection" },
  { id: "s3" as Tab,      label: "S3 Buckets",      icon: Cloud,     statKey: "s3_public"         },
  { id: "github" as Tab,  label: "GitHub Secrets",  icon: GitBranch, statKey: "github_secrets"    },
];

export default function ReconPage() {
  const [tab, setTab] = useState<Tab>("admin");
  const [stats, setStats] = useState<Stats | null>(null);
  const [adminPanels, setAdminPanels] = useState<AdminPanel[]>([]);
  const [adminMeta, setAdminMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [graphql, setGraphql]     = useState<GraphQL[]>([]);
  const [s3, setS3]               = useState<S3[]>([]);
  const [github, setGithub]       = useState<GitHubSecret[]>([]);
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(true);
  const [scanning, setScanning]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch]       = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const { toast } = useToast();

  const loadStats = useCallback(async () => {
    try { setStats((await api.fetch<any>("/api/recon/stats")).data); } catch {}
  }, []);

  const loadAdminPanels = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "50" });
      if (search) params.set("search", search);
      if (typeFilter) params.set("panel_type", typeFilter);
      const res = await api.fetch<any>(`/api/recon/admin-panels?${params}`);
      setAdminPanels(res.data || []);
      setAdminMeta(res.meta || { total: 0, page: 1, pages: 1 });
    } finally { setIsLoading(false); }
  }, [search, typeFilter]);

  const loadTabData = useCallback(async (t: Tab, verifiedOnly = showVerifiedOnly) => {
    setIsLoading(true);
    try {
      const map: Record<string, string> = {
        graphql: "/api/recon/graphql?per_page=100",
        s3:      "/api/recon/s3?per_page=100",
        github:  `/api/recon/github-secrets?per_page=200&verified_only=${verifiedOnly}`,
      };
      const res = await api.fetch<any>(map[t]);
      if (t === "graphql") setGraphql(res.data || []);
      if (t === "s3")      setS3(res.data || []);
      if (t === "github")  setGithub(res.data || []);
    } finally { setIsLoading(false); }
  }, [showVerifiedOnly]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    if (tab === "admin") loadAdminPanels(1);
    else loadTabData(tab);
  }, [tab, loadAdminPanels, loadTabData]);
  useEffect(() => {
    if (tab === "github") loadTabData("github", showVerifiedOnly);
  }, [showVerifiedOnly]);

  const triggerScan = async (type: "s3" | "github") => {
    setScanning(true);
    try {
      const body = domainInput.trim() ? { domains: [domainInput.trim()] } : {};
      await api.fetch<any>(`/api/recon/${type}/scan`, { method: "POST", body: JSON.stringify(body) });
      toast(`${type.toUpperCase()} scan started`, "success");
    } catch { toast("Failed to start scan", "error"); }
    finally { setScanning(false); }
  };

  const panelTypes = stats?.by_panel_type?.map(p => p.panel_type) || [];

  return (
    <div className="flex flex-col h-full">
      <Header title="Recon Hub" description="Exposed panels, GraphQL introspection, S3 buckets, GitHub secrets" />
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.admin_panels.toLocaleString()}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Total Panels</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-critical)]">{(stats.env_exposed + stats.git_exposed).toLocaleString()}</div>
              <div className="text-caption text-[var(--text-tertiary)]">.env / .git</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-high)]">{stats.graphql_introspection}</div>
              <div className="text-caption text-[var(--text-tertiary)]">GraphQL Open</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-high)]">{stats.s3_public}</div>
              <div className="text-caption text-[var(--text-tertiary)]">S3 Public</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-critical)]">{stats.github_secrets}</div>
              <div className="text-caption text-[var(--text-tertiary)]">GitHub Secrets</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map(t => {
            const Icon = t.icon;
            const count = stats ? (stats as any)[t.statKey] : null;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-button border text-body transition-all ${
                  tab === t.id
                    ? "bg-[var(--bg-active)] border-[var(--color-accent)] text-[var(--text-primary)] font-medium"
                    : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                }`}>
                <Icon className="w-4 h-4" />
                {t.label}
                {count !== null && count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    tab === t.id ? "bg-[var(--color-accent)] text-white" : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Admin Panels */}
        {tab === "admin" && (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                <Input placeholder="Search domain / URL..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-64" />
              </div>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-secondary)]">
                <option value="">All Types</option>
                {panelTypes.map(t => <option key={t} value={t}>{PANEL_SEVERITY[t]?.label || t}</option>)}
              </select>
              <span className="text-caption text-[var(--text-tertiary)] ml-auto">{adminMeta.total.toLocaleString()} results</span>
            </div>

            {/* Quick filters */}
            <div className="flex gap-2 flex-wrap">
              {[
                { label: ".ENV",          type: "env-exposure",       variant: "critical" },
                { label: ".GIT",          type: "git-exposure",       variant: "critical" },
                { label: "Config File",   type: "config-exposure",    variant: "critical" },
                { label: "Backup File",   type: "backup-exposure",    variant: "critical" },
                { label: "Elasticsearch", type: "elasticsearch",      variant: "critical" },
                { label: "phpinfo",       type: "phpinfo",            variant: "high" },
                { label: "Server Status", type: "server-status",      variant: "high" },
                { label: "Log File",      type: "log-exposure",       variant: "high" },
                { label: "Source Map",    type: "sourcemap-exposure", variant: "high" },
                { label: "Actuator",      type: "spring-actuator",    variant: "high" },
                { label: "Debug",         type: "debug-endpoint",     variant: "high" },
                { label: "Jenkins",       type: "jenkins",            variant: "high" },
                { label: "phpMyAdmin",    type: "phpmyadmin",         variant: "high" },
                { label: "Portainer",     type: "portainer",          variant: "high" },
                { label: "Swagger",       type: "swagger",            variant: "medium" },
                { label: "Metrics",       type: "metrics",            variant: "medium" },
                { label: "Grafana",       type: "grafana",            variant: "medium" },
              ].map(q => (
                <button key={q.type} onClick={() => setTypeFilter(typeFilter === q.type ? "" : q.type)}
                  className={`px-3 py-1 rounded-full text-caption font-medium border transition-all ${
                    typeFilter === q.type
                      ? q.variant === "critical" ? "bg-[rgba(239,68,68,0.2)] border-[var(--color-critical)] text-[var(--color-critical)]"
                        : q.variant === "high" ? "bg-[rgba(249,115,22,0.2)] border-[var(--color-high)] text-[var(--color-high)]"
                        : "bg-[rgba(234,179,8,0.2)] border-[var(--color-medium)] text-[var(--color-medium)]"
                      : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)]"
                  }`}>
                  {q.label}
                  {stats?.by_panel_type?.find(p => p.panel_type === q.type) && (
                    <span className="ml-1 opacity-70">({stats.by_panel_type.find(p => p.panel_type === q.type)!.count})</span>
                  )}
                </button>
              ))}
            </div>

            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
              <table className="w-full text-body">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-left">URL</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Title</th>
                    <th className="px-4 py-2.5 text-left">Domain</th>
                    <th className="px-4 py-2.5 text-left">Found</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
                  ) : adminPanels.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-tertiary)]">No results</td></tr>
                  ) : adminPanels.map(p => {
                    const sev = PANEL_SEVERITY[p.panel_type] || PANEL_SEVERITY.generic;
                    return (
                      <tr key={p.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors">
                        <td className="px-4 py-2.5">
                          <Badge variant={sev.variant as any}>{sev.label}</Badge>
                        </td>
                        <td className="px-4 py-2.5 max-w-[280px]">
                          <span className="text-caption font-mono text-[var(--text-secondary)] truncate block" title={p.url}>{p.url}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-caption font-bold ${p.status_code === 200 ? "text-[var(--color-low)]" : "text-[var(--color-medium)]"}`}>{p.status_code}</span>
                        </td>
                        <td className="px-4 py-2.5 text-caption text-[var(--text-secondary)] max-w-[160px] truncate">{p.title || <span className="text-[var(--text-tertiary)]">—</span>}</td>
                        <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)]">{p.domain}</td>
                        <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">{fmt(p.first_seen)}</td>
                        <td className="px-4 py-2.5">
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)] inline-flex">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {adminMeta.pages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-caption text-[var(--text-tertiary)]">Page {adminMeta.page} of {adminMeta.pages}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => loadAdminPanels(adminMeta.page - 1)} disabled={adminMeta.page <= 1}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => loadAdminPanels(adminMeta.page + 1)} disabled={adminMeta.page >= adminMeta.pages}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* GraphQL */}
        {tab === "graphql" && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
            <table className="w-full text-body">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left">Endpoint</th>
                  <th className="px-4 py-2.5 text-left">Types</th>
                  <th className="px-4 py-2.5 text-left">Domain</th>
                  <th className="px-4 py-2.5 text-left">Found</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
                ) : graphql.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--text-tertiary)]">No GraphQL endpoints with introspection enabled found yet.</td></tr>
                ) : graphql.map(g => (
                  <tr key={g.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)]">
                    <td className="px-4 py-2.5 font-mono text-caption text-[var(--text-secondary)] max-w-[300px] truncate">{g.url}</td>
                    <td className="px-4 py-2.5"><Badge variant="critical">{g.query_count} types exposed</Badge></td>
                    <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)]">{g.domain}</td>
                    <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">{fmt(g.first_seen)}</td>
                    <td className="px-4 py-2.5">
                      <a href={g.url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)] inline-flex">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* S3 */}
        {tab === "s3" && (
          <>
            <div className="flex gap-2 items-center bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4">
              <Input value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="example.com (blank = all domains)" className="w-64" />
              <Button variant="primary" size="sm" onClick={() => triggerScan("s3")} disabled={scanning}>
                {scanning ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
                Scan S3 Buckets
              </Button>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
              <table className="w-full text-body">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Bucket</th>
                    <th className="px-4 py-2.5 text-left">Access</th>
                    <th className="px-4 py-2.5 text-left">Listable</th>
                    <th className="px-4 py-2.5 text-left">Region</th>
                    <th className="px-4 py-2.5 text-left">Domain</th>
                    <th className="px-4 py-2.5 text-left">Found</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
                  ) : s3.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--text-tertiary)]">No S3 buckets found. Click Scan to search.</td></tr>
                  ) : s3.map(b => (
                    <tr key={b.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)]">
                      <td className="px-4 py-2.5 font-mono text-caption text-[var(--color-accent)]">{b.bucket_name}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={b.is_public ? "critical" : "low"}>{b.is_public ? "PUBLIC" : "Private"}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {b.is_listable ? <Badge variant="critical">Listable</Badge> : <span className="text-caption text-[var(--text-tertiary)]">No</span>}
                      </td>
                      <td className="px-4 py-2.5 text-caption text-[var(--text-secondary)]">{b.region || "—"}</td>
                      <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)]">{b.domain}</td>
                      <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">{fmt(b.first_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* GitHub Secrets */}
        {tab === "github" && (
          <>
            <div className="flex gap-2 items-center bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4">
              <Input value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="example.com" className="w-64" />
              <Button variant="primary" size="sm" onClick={() => triggerScan("github")} disabled={scanning}>
                {scanning ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : <GitBranch className="w-4 h-4 mr-1" />}
                Scan GitHub Org
              </Button>
              <button
                onClick={() => setShowVerifiedOnly(v => !v)}
                className={`px-3 py-1.5 rounded-button text-caption font-medium border transition-all ${
                  showVerifiedOnly
                    ? "bg-[color-mix(in_srgb,var(--color-critical)_15%,transparent)] border-[color-mix(in_srgb,var(--color-critical)_30%,transparent)] text-[var(--color-critical)]"
                    : "bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                }`}
                title={showVerifiedOnly ? "Showing verified only — click to show all" : "Showing all — click for verified only"}
              >
                {showVerifiedOnly ? "✓ Verified Only" : "All (incl. unverified)"}
              </button>
              <div className="ml-auto text-caption text-[var(--text-tertiary)]">{github.length} secrets</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
              <table className="w-full text-body">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Secret Type</th>
                    <th className="px-4 py-2.5 text-left">Value</th>
                    <th className="px-4 py-2.5 text-left">File</th>
                    <th className="px-4 py-2.5 text-left">Domain</th>
                    <th className="px-4 py-2.5 text-left">Found</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
                  ) : github.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-tertiary)]">No secrets found. Enter a domain and click Scan GitHub Org.</td></tr>
                  ) : github.map(s => (
                    <tr key={s.id} className={`border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] ${s.verified ? "bg-[rgba(239,68,68,0.04)]" : ""}`}>
                      <td className="px-4 py-2.5">
                        {s.verified
                          ? <Badge variant="critical">VERIFIED</Badge>
                          : <Badge variant="default">Unverified</Badge>}
                      </td>
                      <td className="px-4 py-2.5"><Badge variant={s.verified ? "high" : "default"}>{s.secret_type}</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-caption text-[var(--text-secondary)]">{s.secret_value || "—"}</td>
                      <td className="px-4 py-2.5 max-w-[220px]">
                        {s.raw_url
                          ? <a href={s.raw_url} target="_blank" rel="noopener noreferrer"
                              className="font-mono text-caption text-[var(--color-accent)] hover:underline truncate block" title={s.file_path || s.raw_url}>
                              {s.file_path || s.raw_url.split("/blob/HEAD/")[1] || "view file"}
                            </a>
                          : <span className="font-mono text-caption text-[var(--text-tertiary)] truncate block">{s.file_path || "—"}</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)]">{s.domain}</td>
                      <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">{fmt(s.discovered_at || s.first_seen)}</td>
                      <td className="px-4 py-2.5">
                        <a href={s.raw_url || s.repo_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)] inline-flex">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
