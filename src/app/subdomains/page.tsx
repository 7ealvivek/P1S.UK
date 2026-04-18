"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { DataTable, Pagination } from "@/components/ui/table";
import { Badge, StatusBadge, SourceBadge } from "@/components/ui/badge"; // SourceBadge still used in detail panel
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useSubdomains, SubdomainFilters } from "@/hooks/useSubdomains";
import { api } from "@/lib/api";
import { Subdomain } from "@/lib/types";
import { timeAgo, truncate, parseTechStack, parsePorts, copyToClipboard, getPortRisk, getPortService } from "@/lib/utils";
import { Search, Filter, Download, X, ExternalLink, Copy, Eye, ChevronRight, ZoomIn } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function SubdomainsPage() {
  const searchParams = useSearchParams();
  const { subdomains, total, page, pages, perPage, sort, order, loading, error, fetch, setPage, setPerPage, toggleSort } = useSubdomains();
  const { toast } = useToast();

  const initPort = searchParams.get("port") || undefined;
  const initDomain = searchParams.get("domain") || undefined;
  const initStatusCode = searchParams.get("status_code") || undefined;
  const initIsNew = searchParams.get("is_new") === "true" ? true : undefined;
  const initTech = searchParams.get("tech") || undefined;
  const [filters, setFilters] = useState<SubdomainFilters>({
    search: searchParams.get("search") || "",
    port: initPort,
    domain: initDomain,
    status_code: initStatusCode,
    is_new: initIsNew,
    tech: initTech,
  });
  const [showFilters, setShowFilters] = useState(!!(initPort || initDomain || initStatusCode || initIsNew || initTech));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Subdomain | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const loadData = useCallback(() => {
    fetch(filters, 1, sort, order, perPage);
  }, [filters, sort, order, perPage, fetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load detail
  useEffect(() => {
    if (detailId === null) {
      setDetail(null);
      return;
    }
    api.getSubdomain(detailId).then((res) => setDetail(res.data as unknown as Subdomain)).catch(() => {});
  }, [detailId]);

  const handleSearch = (search: string) => {
    setFilters((f) => ({ ...f, search }));
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetch(filters, p, sort, order, perPage);
  };

  const handlePerPageChange = (pp: number) => {
    setPerPage(pp);
    fetch(filters, 1, sort, order, pp);
  };

  const handleSort = (col: string) => {
    const newOrder = sort === col && order === "desc" ? "asc" : "desc";
    toggleSort(col);
    fetch(filters, page, col, newOrder, perPage);
  };

  const handleSelectAll = () => {
    if (selected.size === subdomains.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(subdomains.map((s) => s.id)));
    }
  };

  const handleBulk = async (action: string) => {
    if (selected.size === 0) return;
    try {
      await api.bulkAction(Array.from(selected), action);
      toast(`${action === "reviewed" ? "Marked" : "Deleted"} ${selected.size} subdomains`, "success");
      setSelected(new Set());
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk action failed", "error");
    }
  };

  const handleExport = (format: string) => {
    const url = api.getExportUrl(format, filters as Record<string, string>);
    window.open(url, "_blank");
    setExportOpen(false);
  };

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== "" && v !== false).length;

  return (
    <div>
      {/* Screenshot lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300" onClick={() => setLightbox(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={lightbox} alt="screenshot" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      <Header
        title="Subdomains"
        description={`${total.toLocaleString()} subdomains discovered`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="sticky top-0 z-10 bg-[var(--bg-primary)] pb-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              icon={<Search className="w-4 h-4" />}
              placeholder="Search subdomains, IPs, titles... (press /)"
              value={filters.search || ""}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 1 && (
              <Badge variant="accent">{activeFilterCount - (filters.search ? 1 : 0)}</Badge>
            )}
          </Button>
          <Button
            variant={filters.status_code === "2xx,3xx,4xx,5xx" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilters(f => ({
              ...f,
              status_code: f.status_code === "2xx,3xx,4xx,5xx" ? undefined : "2xx,3xx,4xx,5xx"
            }))}
            title="Show only subdomains that respond over HTTP"
          >
            ⚡ Live Only
          </Button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card">
                <div>
                  <label className="text-caption text-[var(--text-tertiary)] mb-1 block">Status Code</label>
                  <select
                    value={filters.status_code || ""}
                    onChange={(e) => setFilters((f) => ({ ...f, status_code: e.target.value || undefined }))}
                    className="w-full bg-[var(--bg-tertiary)] text-body text-[var(--text-primary)] border border-[var(--border-default)] rounded-button px-3 py-2"
                  >
                    <option value="">All</option>
                    <option value="2xx">2xx (Success)</option>
                    <option value="3xx">3xx (Redirect)</option>
                    <option value="4xx">4xx (Client Error)</option>
                    <option value="5xx">5xx (Server Error)</option>
                    <option value="none">No Response</option>
                  </select>
                </div>
                <div>
                  <label className="text-caption text-[var(--text-tertiary)] mb-1 block">Tech Filter</label>
                  <Input
                    placeholder="e.g. WordPress"
                    value={filters.tech || ""}
                    onChange={(e) => setFilters((f) => ({ ...f, tech: e.target.value || undefined }))}
                  />
                </div>
                <div>
                  <label className="text-caption text-[var(--text-tertiary)] mb-1 block">Port Filter</label>
                  <Input
                    placeholder="e.g. 3389,6379"
                    value={filters.port || ""}
                    onChange={(e) => setFilters((f) => ({ ...f, port: e.target.value || undefined }))}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 text-body text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.is_new || false}
                      onChange={(e) => setFilters((f) => ({ ...f, is_new: e.target.checked || undefined }))}
                      className="rounded"
                    />
                    New only
                  </label>
                  <label className="flex items-center gap-2 text-body text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.has_ports || false}
                      onChange={(e) => setFilters((f) => ({ ...f, has_ports: e.target.checked || undefined }))}
                      className="rounded"
                    />
                    Has ports
                  </label>
                  <label className="flex items-center gap-2 text-body text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.has_screenshot || false}
                      onChange={(e) => setFilters((f) => ({ ...f, has_screenshot: e.target.checked || undefined }))}
                      className="rounded"
                    />
                    Has screenshot
                  </label>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters({ search: filters.search })}
                  >
                    <X className="w-3 h-3" /> Clear filters
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-[var(--color-accent)] bg-opacity-10 border border-[var(--color-accent)] border-opacity-20 rounded-card">
          <span className="text-body text-[var(--text-primary)]">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => handleBulk("reviewed")}>Mark Reviewed</Button>
          <Button size="sm" variant="danger" onClick={() => handleBulk("delete")}>Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      {loading && subdomains.length === 0 ? (
        <TableSkeleton rows={10} />
      ) : (
        <>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-card overflow-hidden">
            <DataTable
              columns={[
                {
                  key: "select",
                  label: "",
                  className: "w-10",
                  render: (row) => (
                    <input
                      type="checkbox"
                      checked={selected.has(row.id as number)}
                      onChange={(e) => {
                        const id = row.id as number;
                        const next = new Set(selected);
                        e.target.checked ? next.add(id) : next.delete(id);
                        setSelected(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded"
                    />
                  ),
                },
                {
                  key: "subdomain",
                  label: "Subdomain",
                  sortable: true,
                  className: "font-mono text-mono max-w-xs",
                  render: (row) => (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-mono text-[var(--text-primary)]" title={String(row.subdomain)}>
                        {truncate(String(row.subdomain), 40)}
                      </span>
                      {row.is_new === 1 && (
                        <span className="shrink-0 text-caption px-1.5 py-0.5 rounded-full font-medium" style={{ background: "color-mix(in srgb, var(--color-accent) 15%, transparent)", color: "var(--color-accent)", border: "1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)" }}>
                          new
                        </span>
                      )}
                    </div>
                  ),
                },
                { key: "root_domain", label: "Domain", sortable: true, className: "font-mono text-mono" },
                {
                  key: "ip",
                  label: "IP",
                  className: "font-mono text-mono",
                  render: (row) => <span className="font-mono text-mono">{row.ip as string || "—"}</span>,
                },
                {
                  key: "status_code",
                  label: "Status",
                  sortable: true,
                  render: (row) => <StatusBadge code={row.status_code as number | null} />,
                },
                {
                  key: "title",
                  label: "Title",
                  render: (row) => <span title={String(row.title || "")}>{truncate(String(row.title || "—"), 30)}</span>,
                },
                {
                  key: "tech_stack",
                  label: "Tech",
                  render: (row) => {
                    const techs = parseTechStack(row.tech_stack as string);
                    if (techs.length === 0) return <span className="text-[var(--text-tertiary)]">—</span>;
                    return (
                      <div className="flex gap-1 flex-wrap">
                        {techs.slice(0, 2).map((t) => <Badge key={t}>{t}</Badge>)}
                        {techs.length > 2 && <Badge variant="outline">+{techs.length - 2}</Badge>}
                      </div>
                    );
                  },
                },
                {
                  key: "screenshot_path",
                  label: "SS",
                  className: "w-20",
                  render: (row) => {
                    if (!row.screenshot_path) return <span className="text-[var(--text-tertiary)]">—</span>;
                    const url = api.getScreenshotUrl(row.id as number);
                    return (
                      <div
                        className="relative group cursor-zoom-in w-16 h-10"
                        onClick={(e) => { e.stopPropagation(); setLightbox(url); }}
                      >
                        <img
                          src={url}
                          alt="ss"
                          className="w-16 h-10 object-cover rounded border border-[var(--border-default)]"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded flex items-center justify-center transition-opacity">
                          <ZoomIn className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "first_seen",
                  label: "First Seen",
                  sortable: true,
                  render: (row) => (
                    <span className="text-[var(--text-secondary)]" title={String(row.first_seen)}>
                      {timeAgo(String(row.first_seen))}
                    </span>
                  ),
                },
              ]}
              data={subdomains as unknown as Record<string, unknown>[]}
              sort={sort}
              order={order}
              onSort={handleSort}
              onRowClick={(row) => setDetailId(row.id as number)}
              rowClassName={(row) => row.is_new === 1 ? "border-l-2 border-l-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_4%,transparent)]" : ""}
            />
            <Pagination
              page={page}
              pages={pages}
              total={total}
              perPage={perPage}
              onPageChange={handlePageChange}
              onPerPageChange={handlePerPageChange}
            />
          </div>
        </>
      )}

      {/* Detail Panel */}
      <AnimatePresence>
        {detail && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
              onClick={() => setDetailId(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-[480px] bg-[var(--bg-secondary)] border-l border-[var(--border-default)] z-40 overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="min-w-0">
                    <h2 className="font-mono text-heading text-[var(--text-primary)] break-all">{detail.subdomain}</h2>
                    <div className="flex gap-2 mt-2">
                      <StatusBadge code={detail.status_code} />
                      <SourceBadge source={detail.source} />
                      {detail.is_new === 1 && <Badge variant="accent">New</Badge>}
                    </div>
                  </div>
                  <button onClick={() => setDetailId(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[
                    { label: "IP", value: detail.ip },
                    { label: "Web Server", value: detail.web_server },
                    { label: "CDN", value: detail.cdn },
                    { label: "ASN", value: detail.asn },
                    { label: "CNAME", value: detail.cname },
                    { label: "Content Length", value: detail.content_length?.toString() },
                  ].map((item) => (
                    <div key={item.label}>
                      <span className="text-caption text-[var(--text-tertiary)] block">{item.label}</span>
                      <button
                        onClick={() => item.value && copyToClipboard(item.value).then(() => toast("Copied!", "success"))}
                        className="font-mono text-mono text-[var(--text-primary)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        {item.value || "—"}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Tech Stack */}
                {detail.tech_stack && (
                  <div className="mb-6">
                    <h3 className="text-subheading text-[var(--text-primary)] mb-2">Tech Stack</h3>
                    <div className="flex flex-wrap gap-2">
                      {parseTechStack(detail.tech_stack).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ports */}
                {detail.ports && (
                  <div className="mb-6">
                    <h3 className="text-subheading text-[var(--text-primary)] mb-2">Open Ports</h3>
                    <div className="flex flex-wrap gap-2">
                      {parsePorts(detail.ports).map((p) => {
                        const risk = getPortRisk(p);
                        const variant = risk === "critical" ? "critical" : risk === "high" ? "high" : risk === "medium" ? "medium" : "default";
                        return (
                          <span key={p} title={getPortService(p)}>
                            <Badge variant={variant} className="cursor-help">
                              {p} ({getPortService(p)})
                            </Badge>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Screenshot */}
                {detail.screenshot_path && (
                  <div className="mb-6">
                    <h3 className="text-subheading text-[var(--text-primary)] mb-2">Screenshot</h3>
                    <img
                      src={api.getScreenshotUrl(detail.id)}
                      alt={detail.subdomain}
                      className="w-full rounded-card border border-[var(--border-default)]"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Timeline */}
                <div className="mb-6">
                  <h3 className="text-subheading text-[var(--text-primary)] mb-2">Timeline</h3>
                  <div className="text-body text-[var(--text-secondary)] space-y-1">
                    <div>First seen: <span className="text-[var(--text-primary)]">{detail.first_seen}</span></div>
                    <div>Last seen: <span className="text-[var(--text-primary)]">{detail.last_seen}</span></div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                  <h3 className="text-subheading text-[var(--text-primary)] mb-2">Quick Actions</h3>
                  <a
                    href={`https://${detail.subdomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-button text-body text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" /> Open in browser
                  </a>
                  <button
                    onClick={() => {
                      copyToClipboard(`curl -sI https://${detail.subdomain}`);
                      toast("curl command copied!", "success");
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-button text-body text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Copy className="w-4 h-4" /> Copy as curl
                  </button>
                  <button
                    onClick={() => {
                      copyToClipboard(`nuclei -u https://${detail.subdomain} -severity critical,high`);
                      toast("nuclei command copied!", "success");
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-button text-body text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Copy nuclei command
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} title="Export Subdomains">
        <div className="space-y-3">
          <p className="text-body text-[var(--text-secondary)]">
            Export {total.toLocaleString()} matching subdomains:
          </p>
          <div className="flex gap-3">
            <Button onClick={() => handleExport("json")} variant="secondary">JSON</Button>
            <Button onClick={() => handleExport("csv")} variant="secondary">CSV</Button>
            <Button onClick={() => handleExport("txt")} variant="secondary">TXT (domains only)</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
