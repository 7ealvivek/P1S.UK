"use client";
import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Subdomain } from "@/lib/types";

export interface SubdomainFilters {
  search?: string;
  domain?: string;
  status_code?: string;
  source?: string;
  has_ports?: boolean;
  has_tech?: boolean;
  has_screenshot?: boolean;
  is_new?: boolean;
  tech?: string;
  port?: string;
  date_from?: string;
  date_to?: string;
}

export function useSubdomains() {
  const [subdomains, setSubdomains] = useState<Subdomain[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sort, setSort] = useState("first_seen");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (
    filters: SubdomainFilters = {},
    pageNum?: number,
    sortCol?: string,
    sortOrder?: "asc" | "desc",
    itemsPerPage?: number,
  ) => {
    setLoading(true);
    setError(null);
    const p = pageNum ?? page;
    const s = sortCol ?? sort;
    const o = sortOrder ?? order;
    const pp = itemsPerPage ?? perPage;

    try {
      const params: Record<string, string | number | boolean | undefined> = {
        page: p,
        per_page: pp,
        sort: s,
        order: o,
        ...filters,
      };

      const res = await api.getSubdomains(params);
      setSubdomains(res.data as unknown as Subdomain[]);
      setTotal(res.meta?.total ?? 0);
      setPage(res.meta?.page ?? 1);
      setPages(res.meta?.pages ?? 1);
      setPerPage(res.meta?.per_page ?? pp);
      setSort(s);
      setOrder(o);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subdomains");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = useCallback((col: string) => {
    if (sort === col) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(col);
      setOrder("desc");
    }
  }, [sort, order]);

  return {
    subdomains, total, page, pages, perPage, sort, order,
    loading, error, fetch, setPage, setPerPage, toggleSort,
  };
}
