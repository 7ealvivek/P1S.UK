"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, INTERESTING_TECH } from "@/lib/constants";
import { Search, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

interface TechEntry {
  name: string;
  count: number;
}

export default function TechPage() {
  const [categories, setCategories] = useState<Record<string, TechEntry[]>>({});
  const [interesting, setInteresting] = useState<{ name: string; count: number; category: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["cms", "frameworks", "devops"]));
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const [sumRes, intRes] = await Promise.all([api.getTechSummary(), api.getInterestingTech()]);
        setCategories((sumRes.data as { categories: Record<string, TechEntry[]> }).categories);
        setInteresting(intRes.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const filterTech = (techs: TechEntry[]) => {
    if (!search) return techs;
    return techs.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  };

  const maxCount = Math.max(...Object.values(categories).flat().map((t) => t.count), 1);

  return (
    <div>
      <Header title="Tech Stack" description="Technology inventory across your attack surface" />

      <div className="mb-6">
        <Input
          icon={<Search className="w-4 h-4" />}
          placeholder="Filter technologies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {loading ? (
        <TableSkeleton rows={10} />
      ) : (
        <>
          {/* Interesting Tech */}
          {interesting.length > 0 && (
            <Card className="mb-6" accentColor="var(--color-critical)">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-[var(--color-critical)]" />
                  <CardTitle>Interesting Technologies</CardTitle>
                </div>
              </CardHeader>
              <div className="flex flex-wrap gap-2">
                {interesting
                  .filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()))
                  .map((t) => (
                    <button
                      key={t.name}
                      onClick={() => router.push(`/subdomains?tech=${t.name}`)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-badge bg-[rgba(239,68,68,0.1)] text-[var(--color-critical)] hover:bg-[rgba(239,68,68,0.2)] transition-colors text-body"
                    >
                      {t.name}
                      <Badge variant="critical">{t.count}</Badge>
                    </button>
                  ))}
              </div>
            </Card>
          )}

          {/* Categories */}
          <div className="space-y-3">
            {Object.entries(categories).map(([cat, techs]) => {
              const filtered = filterTech(techs);
              if (filtered.length === 0 && search) return null;
              const isOpen = expanded.has(cat);

              return (
                <Card key={cat}>
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />}
                      <span className="text-heading text-[var(--text-primary)]">
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                      <Badge>{techs.length}</Badge>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 space-y-2">
                      {(search ? filtered : techs).map((t) => (
                        <button
                          key={t.name}
                          onClick={() => router.push(`/subdomains?tech=${t.name}`)}
                          className="flex items-center justify-between w-full px-3 py-2 rounded-button hover:bg-[var(--bg-hover)] transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-body text-[var(--text-primary)]">{t.name}</span>
                            {INTERESTING_TECH.has(t.name) && (
                              <Badge variant="critical" className="text-[0.65rem]">High interest</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-32 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[var(--color-accent)] rounded-full"
                                style={{ width: `${(t.count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-body tabular-nums text-[var(--text-secondary)] w-12 text-right">
                              {t.count}
                            </span>
                            <span className="text-caption text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                              View →
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
