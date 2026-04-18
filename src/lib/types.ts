export interface Subdomain {
  id: number;
  subdomain: string;
  root_domain: string;
  source: string;
  first_seen: string;
  last_seen: string;
  is_new: number;
  ip: string | null;
  status_code: number | null;
  title: string | null;
  tech_stack: string | null;
  web_server: string | null;
  cdn: string | null;
  asn: string | null;
  ports: string | null;
  screenshot_path: string | null;
  content_length: number | null;
  redirect_url: string | null;
  cname: string | null;
}

export interface DashboardStats {
  total: number;
  new: number;
  domains: number;
  with_ports: number;
  with_tech: number;
  with_screenshots: number;
}

export interface TimelinePoint {
  date: string;
  count: number;
  new_count: number;
}

export interface SourceData {
  source: string;
  count: number;
}

export interface TechData {
  name: string;
  count: number;
}

export interface PortData {
  port: number;
  service: string;
  count: number;
  risk: string;
}

export interface DomainData {
  id: number;
  domain: string;
  added_at: string;
  is_active: boolean;
  total: number;
  new: number;
  with_ports: number;
  with_tech: number;
  last_scan: string | null;
  top_tech: string[];
  sparkline_data: number[];
}

export interface ScanData {
  id: number;
  scan_type: string;
  target: string;
  started_at: string;
  finished_at: string | null;
  new_count: number;
  total_count: number;
  duration_seconds: number | null;
}

export interface PortSummary {
  port: number;
  service: string;
  count: number;
  risk: string;
  percentage: number;
}

export interface RiskOverview {
  critical: number;
  high: number;
  medium: number;
  standard: number;
}

export interface TechCategory {
  [key: string]: { name: string; count: number }[];
}

export interface ScreenshotData {
  id: number;
  subdomain: string;
  root_domain: string;
  status_code: number | null;
  title: string | null;
  tech_stack: string | null;
  screenshot_path: string;
  first_seen: string;
  web_server: string | null;
}

export interface ScanMetrics {
  avg_duration: number;
  avg_new: number;
  total_scans: number;
  rate_trend: { date: string; scans: number; new_found: number }[];
}

export interface AppSettings {
  sweep_interval: number;
  tools: Record<string, boolean>;
  ct_stream_enabled: boolean;
  masscan_mode: string;
  masscan_rate: number;
  telegram_api_key: string;
  telegram_chat_id: string;
  discord_webhook: string;
  slack_webhook: string;
  alerts_paused: boolean;
  leakix_api_key: string;
  github_token: string;
  shodan_api_key: string;
  anthropic_api_key: string;
  leakix_poll_interval: number;
}

export interface LiveFeedItem {
  type: string;
  subdomain: string;
  source: string;
  status_code: number | null;
  root_domain: string;
  timestamp: string;
}

export interface APIResponse<T = unknown> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pages?: number;
    per_page?: number;
  };
  error?: string;
}

export interface User {
  id: number;
  username: string;
  created_at: string;
}
