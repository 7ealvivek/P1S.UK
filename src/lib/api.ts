const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.baseUrl || window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      });
    }
    return url.toString();
  }

  async fetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);

    const token = typeof window !== "undefined" ? localStorage.getItem("p1w_token") : null;

    const response = await fetch(url, {
      ...fetchOptions,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchOptions.headers,
      },
    });

    if (response.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("p1w_token");
        if (window.location.pathname !== "/login") window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Request failed" }));
      throw new Error(error.detail || error.error || `HTTP ${response.status}`);
    }

    // Handle file downloads
    const contentType = response.headers.get("content-type");
    if (contentType && (contentType.includes("text/csv") || contentType.includes("text/plain") || contentType.includes("application/json" ))) {
      if (options.headers && (options.headers as Record<string, string>)["Accept"] === "blob") {
        return response.blob() as unknown as T;
      }
    }

    return response.json();
  }

  // Auth
  async login(username: string, password: string) {
    const res = await this.fetch<{ data: { token: string; user: { id: number; username: string; created_at: string } } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (res.data.token) {
      localStorage.setItem("p1w_token", res.data.token);
    }
    return res.data;
  }

  async register(username: string, password: string) {
    const res = await this.fetch<{ data: { token: string; user: { id: number; username: string; created_at: string } } }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (res.data.token) {
      localStorage.setItem("p1w_token", res.data.token);
    }
    return res.data;
  }

  async getMe() {
    return this.fetch<{ data: { id: number; username: string; created_at: string } }>("/api/auth/me");
  }

  // Dashboard
  async getDashboardStats() {
    return this.fetch<{ data: Record<string, number> }>("/api/dashboard/stats");
  }

  async getTimeline(period: string = "7d", domain?: string) {
    return this.fetch<{ data: { date: string; count: number; new_count: number }[] }>("/api/dashboard/timeline", {
      params: { period, domain },
    });
  }

  async getSources() {
    return this.fetch<{ data: { source: string; count: number }[] }>("/api/dashboard/sources");
  }

  async getTopTech(limit: number = 10) {
    return this.fetch<{ data: { name: string; count: number }[] }>("/api/dashboard/top-tech", {
      params: { limit },
    });
  }

  async getTopPorts(limit: number = 10) {
    return this.fetch<{ data: { port: number; service: string; count: number; risk: string }[] }>("/api/dashboard/top-ports", {
      params: { limit },
    });
  }

  async getRecentScans(limit: number = 10) {
    return this.fetch<{ data: Record<string, unknown>[] }>("/api/dashboard/recent-scans", {
      params: { limit },
    });
  }

  // Subdomains
  async getSubdomains(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.fetch<{ data: Record<string, unknown>[]; meta: { total: number; page: number; pages: number; per_page: number } }>("/api/subdomains", { params });
  }

  async getSubdomain(id: number) {
    return this.fetch<{ data: Record<string, unknown> }>(`/api/subdomains/${id}`);
  }

  async searchSubdomains(q: string, limit: number = 20) {
    return this.fetch<{ data: Record<string, unknown>[] }>("/api/subdomains/search", { params: { q, limit } });
  }

  async bulkAction(ids: number[], action: string) {
    return this.fetch<{ data: { updated: number } }>("/api/subdomains/bulk", {
      method: "PATCH",
      body: JSON.stringify({ ids, action }),
    });
  }

  getExportUrl(format: string, params: Record<string, string> = {}): string {
    const searchParams = new URLSearchParams({ format, ...params });
    return `${this.baseUrl || ""}/api/subdomains/export?${searchParams.toString()}`;
  }

  // Domains
  async getDomains(page: number = 1, perPage: number = 50, search?: string) {
    return this.fetch<{ data: { items: Record<string, unknown>[]; total: number; page: number; per_page: number; pages: number } }>("/api/domains", {
      params: { page, per_page: perPage, ...(search ? { search } : {}) }
    });
  }

  async addDomain(domain: string, scanNow: boolean = false) {
    return this.fetch<{ data: { domain: string; status: string } }>("/api/domains", {
      method: "POST",
      body: JSON.stringify({ domain, scan_now: scanNow }),
    });
  }

  async bulkAddDomains(domains: string[], scanNow: boolean = false) {
    return this.fetch<{ data: { added: string[]; skipped: string[] } }>("/api/domains/bulk", {
      method: "POST",
      body: JSON.stringify({ domains, scan_now: scanNow }),
    });
  }

  async deleteDomain(domain: string) {
    return this.fetch<{ data: { deleted: string } }>(`/api/domains/${domain}`, {
      method: "DELETE",
    });
  }

  async patchDomain(domain: string, data: { auto_sweep?: boolean; deep_scan?: boolean }) {
    return this.fetch<{ data: { domain: string; updated: boolean } }>(`/api/domains/${domain}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async triggerSweep(domain: string) {
    return this.fetch<{ data: { status: string; scan_id: number } }>(`/api/domains/${domain}/sweep`, {
      method: "POST",
    });
  }

  // Programs
  async getPrograms(page: number = 1, perPage: number = 50, platform?: string, search?: string) {
    return this.fetch<{ data: { items: Record<string, unknown>[]; total: number; page: number; per_page: number; pages: number } }>("/api/programs", {
      params: { page, per_page: perPage, ...(platform ? { platform } : {}), ...(search ? { search } : {}) }
    });
  }

  async getProgramDomains(programId: number, page: number = 1, perPage: number = 50) {
    return this.fetch<{ data: { program: Record<string, unknown>; items: Record<string, unknown>[]; total: number; page: number; pages: number } }>(`/api/programs/${programId}/domains`, {
      params: { page, per_page: perPage }
    });
  }

  async patchProgram(programId: number, data: { auto_sweep?: boolean; deep_scan?: boolean }) {
    return this.fetch<{ data: { updated: boolean; domains_affected: number } }>(`/api/programs/${programId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getPlatformStats() {
    return this.fetch<{ data: { platforms: Record<string, unknown>[]; unmatched_domains: number } }>("/api/programs/stats/platforms");
  }

  // Ports
  async getPortSummary() {
    return this.fetch<{ data: Record<string, unknown>[] }>("/api/ports/summary");
  }

  async getPortRiskOverview() {
    return this.fetch<{ data: Record<string, number> }>("/api/ports/risk-overview");
  }

  async getPortSubdomains(port: number, page: number = 1) {
    return this.fetch<{ data: Record<string, unknown>[]; meta: Record<string, number> }>(`/api/ports/${port}/subdomains`, { params: { page } });
  }

  // Tech
  async getTechSummary() {
    return this.fetch<{ data: { categories: Record<string, { name: string; count: number }[]> } }>("/api/tech/summary");
  }

  async getInterestingTech() {
    return this.fetch<{ data: { name: string; count: number; category: string }[] }>("/api/tech/interesting");
  }

  async getTechSubdomains(techName: string, page: number = 1) {
    return this.fetch<{ data: Record<string, unknown>[]; meta: Record<string, number> }>(`/api/tech/${encodeURIComponent(techName)}/subdomains`, { params: { page } });
  }

  // Screenshots
  async getScreenshots(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.fetch<{ data: Record<string, unknown>[]; meta: { total: number; page: number; pages: number } }>("/api/screenshots", { params });
  }

  getScreenshotUrl(id: number): string {
    return `/api/screenshots/${id}/image`;
  }

  // Scans
  async getScans(limit: number = 100) {
    return this.fetch<{ data: Record<string, unknown>[] }>("/api/scans", { params: { limit } });
  }

  async getScanMetrics() {
    return this.fetch<{ data: Record<string, unknown> }>("/api/scans/metrics");
  }

  // Settings
  async getSettings() {
    return this.fetch<{ data: Record<string, unknown> }>("/api/settings");
  }

  async updateSettings(settings: Record<string, unknown>) {
    return this.fetch<{ data: { status: string } }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  }

  async testAlert(channel: string, webhook?: string) {
    return this.fetch<{ data: { success: boolean; channel: string } }>("/api/settings/test-alert", {
      method: "POST",
      body: JSON.stringify({ channel, ...(webhook ? { webhook } : {}) }),
    });
  }

  // Health
  async getHealth() {
    return this.fetch<{ status: string; uptime: number; db_size: number; version: string }>("/api/health");
  }
}

export const api = new ApiClient(API_URL);
