"use client";
import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/table";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ScreenshotData } from "@/lib/types";
import { parseTechStack, truncate } from "@/lib/utils";
import { Search, Grid, List, X, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<ScreenshotData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const perPage = 40;

  const fetchData = async (p: number = 1, s: string = search, domain: string = selectedDomain) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, per_page: perPage };
      if (s) params.search = s;
      if (domain) params.domain = domain;
      const res = await api.getScreenshots(params);
      setScreenshots(res.data as unknown as ScreenshotData[]);
      setTotal(res.meta?.total ?? 0);
      setPage(res.meta?.page ?? 1);
      setPages(res.meta?.pages ?? 1);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  // Fetch domain list + per-domain screenshot counts
  useEffect(() => {
    const loadDomains = async () => {
      try {
        const res = await api.getDomains(1, 200);
        const paged = res.data as unknown as { items: { domain: string }[] };
        const domainList = (paged.items || []).map((d) => d.domain);
        setDomains(domainList);

        // Fetch counts per domain in parallel
        const counts = await Promise.all(
          domainList.map(async (d) => {
            try {
              const r = await api.getScreenshots({ domain: d, per_page: 1, page: 1 });
              return [d, r.meta?.total ?? 0] as [string, number];
            } catch {
              return [d, 0] as [string, number];
            }
          })
        );
        setDomainCounts(Object.fromEntries(counts));
      } catch {
        // silent
      }
    };
    loadDomains();
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchData(1, val, selectedDomain), 300);
  };

  const handleDomainSelect = (domain: string) => {
    setSelectedDomain(domain);
    setSearch("");
    fetchData(1, "", domain);
  };

  const lightboxIdx = lightbox !== null ? screenshots.findIndex((s) => s.id === lightbox) : -1;

  const navigateLightbox = (dir: 1 | -1) => {
    if (lightboxIdx === -1) return;
    const next = lightboxIdx + dir;
    if (next >= 0 && next < screenshots.length) {
      setLightbox(screenshots[next].id);
    }
  };

  const domainsWithScreenshots = domains.filter((d) => (domainCounts[d] ?? 0) > 0);

  return (
    <div>
      <Header
        title="Screenshots"
        description={
          selectedDomain
            ? `${total.toLocaleString()} screenshots — ${selectedDomain}`
            : `${total.toLocaleString()} screenshots across ${domainsWithScreenshots.length} domains`
        }
      />

      {/* Domain Tabs */}
      <div className="flex gap-2 flex-wrap mb-5">
        <button
          onClick={() => handleDomainSelect("")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-badge text-body transition-colors ${
            selectedDomain === ""
              ? "bg-[var(--color-accent)] text-black font-medium"
              : "bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          All
          <span className={`text-caption px-1.5 py-0.5 rounded-full ${selectedDomain === "" ? "bg-black/20" : "bg-[var(--bg-tertiary)]"}`}>
            {Object.values(domainCounts).reduce((a, b) => a + b, 0) || total}
          </span>
        </button>
        {domainsWithScreenshots.map((d) => (
          <button
            key={d}
            onClick={() => handleDomainSelect(d)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-badge text-body font-mono transition-colors ${
              selectedDomain === d
                ? "bg-[var(--color-accent)] text-black font-medium"
                : "bg-[var(--bg-secondary)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]"
            }`}
          >
            {d}
            <span className={`text-caption px-1.5 py-0.5 rounded-full ${selectedDomain === d ? "bg-black/20" : "bg-[var(--bg-tertiary)]"}`}>
              {domainCounts[d] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 max-w-md">
          <Input
            icon={<Search className="w-4 h-4" />}
            placeholder={selectedDomain ? `Search in ${selectedDomain}...` : "Search by subdomain..."}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-[var(--bg-tertiary)] rounded-button p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-badge transition-colors ${viewMode === "grid" ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-badge transition-colors ${viewMode === "list" ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : screenshots.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-[var(--text-tertiary)] text-body">
            {selectedDomain ? `No screenshots for ${selectedDomain}` : "No screenshots found"}
          </div>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {screenshots.map((s) => (
            <motion.div
              key={s.id}
              whileHover={{ scale: 1.02 }}
              className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden cursor-pointer group"
              onClick={() => setLightbox(s.id)}
            >
              <div className="aspect-video bg-[var(--bg-tertiary)] relative overflow-hidden">
                <img
                  src={api.getScreenshotUrl(s.id)}
                  alt={s.subdomain}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <span className="text-white text-body opacity-0 group-hover:opacity-100 transition-opacity">View</span>
                </div>
                {!selectedDomain && (
                  <div className="absolute bottom-1.5 left-1.5">
                    <span className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white/80">{s.root_domain}</span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="font-mono text-mono text-[var(--text-primary)] truncate">{s.subdomain}</div>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge code={s.status_code} />
                  {s.title && <span className="text-caption text-[var(--text-tertiary)] truncate">{truncate(s.title, 25)}</span>}
                </div>
                {s.tech_stack && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {parseTechStack(s.tech_stack).slice(0, 3).map((t) => (
                      <Badge key={t} className="text-[0.65rem]">{t}</Badge>
                    ))}
                    {parseTechStack(s.tech_stack).length > 3 && (
                      <Badge variant="outline" className="text-[0.65rem]">+{parseTechStack(s.tech_stack).length - 3}</Badge>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
          {screenshots.map((s) => (
            <div
              key={s.id}
              onClick={() => setLightbox(s.id)}
              className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] cursor-pointer transition-colors"
            >
              <img
                src={api.getScreenshotUrl(s.id)}
                alt={s.subdomain}
                className="w-20 h-14 object-cover rounded-badge"
                loading="lazy"
              />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-mono text-[var(--text-primary)]">{s.subdomain}</div>
                <div className="text-caption text-[var(--text-tertiary)]">{s.title || "—"}</div>
                {!selectedDomain && (
                  <div className="text-caption text-[var(--text-tertiary)] font-mono mt-0.5">{s.root_domain}</div>
                )}
              </div>
              <StatusBadge code={s.status_code} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > perPage && (
        <div className="mt-4">
          <Pagination
            page={page}
            pages={pages}
            total={total}
            perPage={perPage}
            onPageChange={(p) => fetchData(p, search, selectedDomain)}
          />
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && lightboxIdx !== -1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setLightbox(null)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
              className="absolute top-4 right-4 text-white/70 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigateLightbox(-1); }}
              className="absolute left-4 text-white/70 hover:text-white disabled:opacity-30"
              disabled={lightboxIdx === 0}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigateLightbox(1); }}
              className="absolute right-4 text-white/70 hover:text-white disabled:opacity-30"
              disabled={lightboxIdx === screenshots.length - 1}
            >
              <ChevronRight className="w-8 h-8" />
            </button>

            <div className="max-w-5xl max-h-[90vh] p-4" onClick={(e) => e.stopPropagation()}>
              <img
                src={api.getScreenshotUrl(lightbox)}
                alt={screenshots[lightboxIdx].subdomain}
                className="max-w-full max-h-[80vh] object-contain rounded-card"
              />
              <div className="mt-3 text-center">
                <div className="font-mono text-body text-white">{screenshots[lightboxIdx].subdomain}</div>
                <div className="text-caption text-white/60 mt-1">
                  {screenshots[lightboxIdx].title} • {screenshots[lightboxIdx].status_code}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
