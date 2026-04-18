"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { DashboardStats, TimelinePoint, SourceData, TechData, PortData, ScanData } from "@/lib/types";

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [sources, setSources] = useState<SourceData[]>([]);
  const [topTech, setTopTech] = useState<TechData[]>([]);
  const [topPorts, setTopPorts] = useState<PortData[]>([]);
  const [recentScans, setRecentScans] = useState<ScanData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async (period: string = "7d", domain?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, timelineRes, sourcesRes, techRes, portsRes, scansRes] = await Promise.all([
        api.getDashboardStats(),
        api.getTimeline(period, domain),
        api.getSources(),
        api.getTopTech(),
        api.getTopPorts(),
        api.getRecentScans(),
      ]);

      setStats(statsRes.data as unknown as DashboardStats);
      setTimeline(timelineRes.data);
      setSources(sourcesRes.data);
      setTopTech(techRes.data);
      setTopPorts(portsRes.data);
      setRecentScans(scansRes.data as unknown as ScanData[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTimeline = useCallback(async (period: string, domain?: string) => {
    try {
      const res = await api.getTimeline(period, domain);
      setTimeline(res.data);
    } catch {
      // silent fail for timeline refresh
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { stats, timeline, sources, topTech, topPorts, recentScans, loading, error, refresh: fetchAll, refreshTimeline };
}
