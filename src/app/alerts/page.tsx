"use client";
import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { RefreshCw, Bell, ChevronLeft, ChevronRight } from "lucide-react";

interface AlertLog {
  id: number;
  message: string;
  channel: string;
  sent_at: string;
}

function fmt(d: string) {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z");
  if (isNaN(dt.getTime())) return "—";
  const diff = Date.now() - dt.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const days = Math.floor(h / 24);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${days}d ago`;
}

const PAGE_SIZE = 20;

export default function AlertsPage() {
  const [items, setItems] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.fetch<any>("/api/elite/alerts?limit=200");
      setItems((res as any).data || []);
    } catch {
      toast("Failed to load alerts", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Strip HTML tags for display
  function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Alert Feed"
        description="Real-time alerts sent to Telegram and other channels"
        actions={
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Count */}
        <div className="text-caption text-[var(--text-tertiary)]">
          {items.length} alerts total
        </div>

        {/* Alert timeline */}
        {loading ? (
          <div className="text-center text-[var(--text-tertiary)] py-10">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-10 h-10 text-[var(--text-tertiary)] mx-auto mb-3" />
            <p className="text-[var(--text-secondary)]">No alerts yet</p>
            <p className="text-caption text-[var(--text-tertiary)] mt-1">
              Configure Telegram in Settings to receive alerts
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pageItems.map((alert) => (
              <div
                key={alert.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card p-4 flex gap-3"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                    {alert.channel === "telegram" ? (
                      <span className="text-base">✈️</span>
                    ) : (
                      <Bell className="w-4 h-4 text-[var(--text-tertiary)]" />
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-caption font-medium text-[var(--color-accent)] capitalize">
                      {alert.channel}
                    </span>
                    <span className="text-caption text-[var(--text-tertiary)]">{fmt(alert.sent_at)}</span>
                  </div>
                  <pre className="text-caption text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed">
                    {stripHtml(alert.message)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-caption text-[var(--text-tertiary)]">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
