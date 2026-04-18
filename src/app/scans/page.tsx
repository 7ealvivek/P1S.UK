"use client";
import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/table";
import { StatCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ScanData, ScanMetrics } from "@/lib/types";
import { timeAgo, formatDuration } from "@/lib/utils";
import { Clock, Zap, BarChart3, TrendingUp } from "lucide-react";

export default function ScansPage() {
  const [scans, setScans] = useState<ScanData[]>([]);
  const [metrics, setMetrics] = useState<ScanMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [scansRes, metricsRes] = await Promise.all([api.getScans(), api.getScanMetrics()]);
        setScans(scansRes.data as unknown as ScanData[]);
        setMetrics(metricsRes.data as unknown as ScanMetrics);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Group by date
  const groupedByDate: Record<string, ScanData[]> = {};
  scans.forEach((s) => {
    const date = s.started_at.split("T")[0] || s.started_at.split(" ")[0];
    if (!groupedByDate[date]) groupedByDate[date] = [];
    groupedByDate[date].push(s);
  });

  return (
    <div>
      <Header title="Scan History" description="Operational log of all scan activity" />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Avg Duration" value={Math.round(metrics.avg_duration)} icon={<Clock className="w-5 h-5" />} accentColor="var(--color-info)" />
            <StatCard label="Avg New / Scan" value={Math.round(metrics.avg_new)} icon={<Zap className="w-5 h-5" />} accentColor="var(--color-accent)" />
            <StatCard label="Total Scans" value={metrics.total_scans} icon={<BarChart3 className="w-5 h-5" />} accentColor="var(--color-low)" />
            <StatCard label="Rate Trend" value={metrics.rate_trend.length} icon={<TrendingUp className="w-5 h-5" />} accentColor="var(--color-medium)" />
          </>
        )}
      </div>

      {/* Timeline View */}
      {loading ? (
        <TableSkeleton rows={10} />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByDate).map(([date, dayScans]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full bg-[var(--color-accent)]" />
                <h3 className="text-subheading text-[var(--text-primary)]">{date}</h3>
                <div className="h-px flex-1 bg-[var(--border-default)]" />
                <Badge>{dayScans.length} scans</Badge>
              </div>
              <div className="ml-6 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
                <DataTable
                  columns={[
                    {
                      key: "scan_type",
                      label: "Type",
                      render: (row) => {
                        const type = String(row.scan_type);
                        const variant = type.includes("ct") ? "accent" : type.includes("passive") ? "info" : "default";
                        return <Badge variant={variant}>{type}</Badge>;
                      },
                    },
                    { key: "target", label: "Target", className: "font-mono text-mono" },
                    {
                      key: "started_at",
                      label: "Time",
                      render: (row) => (
                        <span className="text-[var(--text-secondary)]">{timeAgo(String(row.started_at))}</span>
                      ),
                    },
                    {
                      key: "duration_seconds",
                      label: "Duration",
                      render: (row) => <span>{formatDuration(row.duration_seconds as number | null)}</span>,
                    },
                    {
                      key: "new_count",
                      label: "New",
                      render: (row) => {
                        const n = row.new_count as number;
                        return (
                          <span className={n > 0 ? "text-[var(--color-accent)] font-medium" : "text-[var(--text-secondary)]"}>
                            {n}
                          </span>
                        );
                      },
                    },
                    {
                      key: "total_count",
                      label: "Total",
                      render: (row) => {
                        const t = row.total_count as number;
                        const n = row.new_count as number;
                        return (
                          <div className="flex items-center gap-2">
                            <span>{t}</span>
                            {t > 0 && (
                              <div className="w-16 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[var(--color-accent)] rounded-full"
                                  style={{ width: `${t > 0 ? (n / t) * 100 : 0}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                  data={dayScans as unknown as Record<string, unknown>[]}
                  compact
                />
              </div>
            </div>
          ))}

          {scans.length === 0 && (
            <div className="text-center py-16 text-[var(--text-tertiary)]">No scan history yet</div>
          )}
        </div>
      )}
    </div>
  );
}
