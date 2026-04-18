"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Zap, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

interface NucleiFinding {
  id: number;
  domain: string;
  subdomain: string;
  template_id: string;
  template_name: string;
  severity: string;
  matcher_name: string | null;
  matched_at: string;
  description: string | null;
  reference: string | null;
  tags: string | null;
  curl_command: string | null;
  found_at: string;
}

interface Stats {
  total: number;
  new_today: number;
  by_severity: Record<string, number>;
  by_domain: Array<{ domain: string; count: number }>;
  top_templates: Array<{ template_id: string; count: number }>;
}

const SEV_VARIANT: Record<string, string> = {
  critical: "critical", high: "high", medium: "medium", low: "low", info: "info",
};

export default function NucleiPage() {
  const [findings, setFindings] = useState<NucleiFinding[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (sevFilter) params.severity = sevFilter;
      if (domainFilter) params.domain = domainFilter;
      const [fRes, sRes] = await Promise.all([
        api.fetch<any>("/api/nuclei/findings?" + new URLSearchParams(params)),
        api.fetch<any>("/api/nuclei/stats"),
      ]);
      setFindings((fRes as any).data || []);
      setStats((sRes as any).data as Stats);
    } catch {
      toast("Failed to load nuclei findings", "error");
    } finally {
      setLoading(false);
    }
  }, [search, sevFilter, domainFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      <Header title="Nuclei Scanner" description="Automated vulnerability detection via nuclei templates" />
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Total</div>
            </div>
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
              <div className="text-2xl font-bold text-[var(--color-accent)]">{stats.new_today}</div>
              <div className="text-caption text-[var(--text-tertiary)]">Today</div>
            </div>
            {["critical","high","medium","low"].map(s => (
              <div key={s} className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
                <div className={`text-2xl font-bold text-[var(--color-${s})]`}>{stats.by_severity[s] || 0}</div>
                <div className="text-caption text-[var(--text-tertiary)] capitalize">{s}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search template / host..." value={search} onChange={e => setSearch(e.target.value)} className="w-60" />
          <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
            className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-secondary)]">
            <option value="">All Severities</option>
            {["critical","high","medium","low","info"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {stats?.by_domain && stats.by_domain.length > 0 && (
            <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-button px-3 py-2 text-body text-[var(--text-secondary)]">
              <option value="">All Domains</option>
              {stats.by_domain.map(d => <option key={d.domain} value={d.domain}>{d.domain} ({d.count})</option>)}
            </select>
          )}
        </div>

        {/* Findings list */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 text-[var(--text-tertiary)]">Loading...</div>
          ) : findings.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-tertiary)]">
              <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No nuclei findings yet.</p>
              <p className="text-caption mt-1">Findings appear automatically after domain sweeps complete.</p>
            </div>
          ) : findings.map(f => (
            <div key={f.id} className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
              <button
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--bg-hover)] transition-colors"
                onClick={() => setExpanded(expanded === f.id ? null : f.id)}
              >
                <Badge variant={SEV_VARIANT[f.severity] as any} className="mt-0.5 shrink-0">{f.severity}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">{f.template_name || f.template_id}</span>
                    {f.matcher_name && <span className="text-caption text-[var(--text-tertiary)]">[{f.matcher_name}]</span>}
                  </div>
                  <div className="text-caption text-[var(--text-tertiary)] mt-0.5">
                    {f.subdomain} · {f.domain} · {timeAgo(f.found_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={f.matched_at} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--color-accent)]">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {expanded === f.id ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
                </div>
              </button>
              {expanded === f.id && (
                <div className="border-t border-[var(--border-default)] px-4 py-3 space-y-3 bg-[var(--bg-tertiary)]">
                  {f.description && (
                    <div>
                      <div className="text-caption text-[var(--text-tertiary)] mb-1">Description</div>
                      <p className="text-body text-[var(--text-secondary)]">{f.description}</p>
                    </div>
                  )}
                  <div>
                    <div className="text-caption text-[var(--text-tertiary)] mb-1">Matched At</div>
                    <code className="text-caption text-[var(--color-accent)] font-mono break-all">{f.matched_at}</code>
                  </div>
                  {f.tags && (
                    <div className="flex flex-wrap gap-1">
                      {f.tags.split(",").map(t => (
                        <Badge key={t} variant="outline">{t.trim()}</Badge>
                      ))}
                    </div>
                  )}
                  {f.reference && (
                    <div>
                      <div className="text-caption text-[var(--text-tertiary)] mb-1">References</div>
                      {f.reference.split("\n").map((r, i) => (
                        <a key={i} href={r} target="_blank" rel="noopener noreferrer"
                          className="block text-caption text-[var(--color-accent)] hover:underline truncate">{r}</a>
                      ))}
                    </div>
                  )}
                  {f.curl_command && (
                    <div>
                      <div className="text-caption text-[var(--text-tertiary)] mb-1">cURL</div>
                      <pre className="text-caption text-[var(--text-secondary)] font-mono bg-[var(--bg-primary)] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{f.curl_command}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
