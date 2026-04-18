"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface AssetChange {
  id: number;
  subdomain: string;
  root_domain: string;
  status_code: number;
  title: string;
  tech: string;
  change_type: string;
  detail: string;
  detected_at: string;
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

const CHANGE_TYPE_STYLES: Record<string, { variant: string; label: string }> = {
  new_asset: { variant: "low", label: "New Asset" },
  status_change: { variant: "high", label: "Status Change" },
  title_change: { variant: "medium", label: "Title Change" },
};

export default function ChangesPage() {
  const [items, setItems] = useState<AssetChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();
  const perPage = 100;

  const load = useCallback(async (p: number = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      params.set("page", String(p));
      params.set("per_page", String(perPage));
      const res = await api.fetch<any>(`/api/elite/changes?${params}`);
      setItems((res as any).data || []);
      if ((res as any).meta) {
        setTotal((res as any).meta.total || 0);
        setTotalPages((res as any).meta.pages || 1);
        setPage((res as any).meta.page || 1);
      }
    } catch {
      toast("Failed to load changes", "error");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, page]);

  useEffect(() => { load(1); }, [typeFilter]);

  const goPage = (p: number) => { setPage(p); load(p); };

  const FILTERS = [
    { value: "", label: "All" },
    { value: "new_asset", label: "New Assets" },
    { value: "status_change", label: "Status Changes" },
    { value: "title_change", label: "Title Changes" },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Change Detection"
        description="Track changes to discovered assets over time"
        actions={
          <Button variant="ghost" size="sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{total.toLocaleString()}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Total Changes</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-low)]">{items.filter(i => i.change_type === "new_asset").length}</div>
            <div className="text-caption text-[var(--text-tertiary)]">New Assets (this page)</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 text-center">
            <div className="text-2xl font-bold text-[var(--color-high)]">{items.filter(i => i.change_type === "status_change").length}</div>
            <div className="text-caption text-[var(--text-tertiary)]">Status Changes (this page)</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setTypeFilter(f.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-button text-caption font-medium border transition-all ${
                  typeFilter === f.value
                    ? "bg-[var(--bg-active)] border-[var(--color-accent)] text-[var(--text-primary)]"
                    : "bg-[var(--bg-secondary)] border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="text-caption text-[var(--text-tertiary)]">
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-caption font-medium uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Subdomain</th>
                <th className="px-4 py-2.5 text-left">Change Type</th>
                <th className="px-4 py-2.5 text-left">Detail</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Detected</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--text-tertiary)]">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-tertiary)]">
                    No asset changes detected yet
                  </td>
                </tr>
              ) : items.map((item) => {
                const style = CHANGE_TYPE_STYLES[item.change_type] || { variant: "default", label: item.change_type };
                return (
                  <tr key={item.id} className="border-b border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-caption text-[var(--text-secondary)] max-w-[200px] truncate">
                      {item.subdomain}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={style.variant as any}>{style.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-caption text-[var(--text-secondary)] max-w-[280px] truncate" title={item.detail}>
                      {item.detail || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono font-bold text-caption ${
                        item.status_code === 200 ? "text-[var(--color-low)]" :
                        item.status_code === 0 ? "text-[var(--text-tertiary)]" :
                        "text-[var(--color-medium)]"
                      }`}>
                        {item.status_code || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-caption text-[var(--text-tertiary)] whitespace-nowrap">
                      {fmt(item.detected_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-2">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => goPage(p)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                    p === page
                      ? "bg-[var(--bg-active)] border-[var(--color-accent)] text-[var(--text-primary)]"
                      : "border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
