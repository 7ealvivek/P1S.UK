"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface Takeover {
  id: number;
  subdomain: string;
  root_domain: string;
  cname_target: string;
  service: string;
  fingerprint: string;
  nxdomain: number;
  url: string;
  confidence: string;
  found_at: string;
}

function fmt(d: string) {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z");
  if (isNaN(dt.getTime())) return "—";
  const diff = Date.now() - dt.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function TakeoversPage() {
  const [items, setItems] = useState<Takeover[]>([]);
  const [loading, setLoading] = useState(false);
  const [confidence, setConfidence] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (confidence) params.set("confidence", confidence);
      const res = await api.fetch<any>(`/api/elite/takeovers?${params}`);
      setItems((res as any).data || []);
    } catch {
      toast("Failed to load takeovers", "error");
    } finally {
      setLoading(false);
    }
  }, [confidence]);

  useEffect(() => { load(); }, [load]);

  const total = items.length;
  const highConf = items.filter((i) => i.confidence === "high").length;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Subdomain Takeovers"
        description="Potential subdomain takeover candidates detected during scanning"
        actions={
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{total}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Total Candidates</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-critical)]">{highConf}</div>
            <div className="text-caption text-[var(--text-tertiary)]">High Confidence</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-medium)]">{total - highConf}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Medium Confidence</div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {["", "high", "medium"].map((c) => (
            <button
              key={c}
              onClick={() => setConfidence(c)}
              className={`px-3 py-1.5 rounded-button text-caption font-medium border transition-all ${
                confidence === c
                  ? "bg-[var(--bg-active)] border-[var(--color-accent)] text-[var(--text-primary)]"
                  : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              {c === "" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Subdomain</th>
                <th className="px-4 py-2.5 text-left">CNAME Target</th>
                <th className="px-4 py-2.5 text-left">Service</th>
                <th className="px-4 py-2.5 text-left">Confidence</th>
                <th className="px-4 py-2.5 text-left">NXDOMAIN</th>
                <th className="px-4 py-2.5 text-left">Found</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <AlertTriangle className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-2" />
                    <p className="text-[var(--text-tertiary)]">No takeover candidates found</p>
                    <p className="text-caption text-[var(--text-tertiary)] mt-1">Takeover detection runs automatically during sweeps</p>
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-2.5">
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-caption font-mono text-[var(--color-accent)] hover:underline">
                      {item.subdomain}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-caption text-[var(--text-secondary)] max-w-[220px] truncate">
                    {item.cname_target || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-caption text-[var(--text-secondary)]">
                    {item.service || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={item.confidence === "high" ? "critical" : "medium"}>
                      {item.confidence}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {item.nxdomain ? (
                      <Badge variant="critical">YES</Badge>
                    ) : (
                      <span className="text-caption text-[var(--text-tertiary)]">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">
                    {fmt(item.found_at)}
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
