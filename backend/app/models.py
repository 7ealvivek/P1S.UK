"""P1 Warriors — Pydantic models for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, Any


# --- Auth ---

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


class UserResponse(BaseModel):
    id: int
    username: str
    created_at: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


# --- API Envelope ---

class APIResponse(BaseModel):
    data: Any = None
    meta: Optional[dict] = None
    error: Optional[str] = None


# --- Dashboard ---

class DashboardStats(BaseModel):
    total: int
    new: int
    domains: int
    with_ports: int
    with_tech: int
    with_screenshots: int


class TimelinePoint(BaseModel):
    date: str
    count: int
    new_count: int


class SourceCount(BaseModel):
    source: str
    count: int


class TechCount(BaseModel):
    name: str
    count: int


class PortCount(BaseModel):
    port: int
    service: str
    count: int
    risk: str


# --- Subdomains ---

class SubdomainOut(BaseModel):
    id: int
    subdomain: str
    root_domain: str
    source: str
    first_seen: str
    last_seen: str
    is_new: int
    ip: Optional[str] = None
    status_code: Optional[int] = None
    title: Optional[str] = None
    tech_stack: Optional[str] = None
    web_server: Optional[str] = None
    cdn: Optional[str] = None
    asn: Optional[str] = None
    ports: Optional[str] = None
    screenshot_path: Optional[str] = None
    content_length: Optional[int] = None
    redirect_url: Optional[str] = None
    cname: Optional[str] = None


class BulkActionRequest(BaseModel):
    ids: list[int]
    action: str = Field(..., pattern="^(reviewed|delete)$")


# --- Domains ---

class DomainOut(BaseModel):
    domain: str
    total: int
    new: int
    with_ports: int
    with_tech: int
    last_scan: Optional[str] = None
    top_tech: list[str] = []
    sparkline_data: list[int] = []


class AddDomainRequest(BaseModel):
    domain: str = Field(..., min_length=3)
    scan_now: bool = False


class BulkAddDomainsRequest(BaseModel):
    domains: list[str]
    scan_now: bool = False


class PatchDomainRequest(BaseModel):
    auto_sweep: Optional[bool] = None
    deep_scan: Optional[bool] = None


# --- Ports ---

class PortSummary(BaseModel):
    port: int
    service: str
    count: int
    risk: str
    percentage: float


class PortRiskOverview(BaseModel):
    critical: int
    high: int
    medium: int
    standard: int


# --- Tech ---

class TechEntry(BaseModel):
    name: str
    count: int
    category: str


# --- Scans ---

class ScanOut(BaseModel):
    id: int
    scan_type: str
    target: str
    started_at: str
    finished_at: Optional[str] = None
    new_count: int
    total_count: int
    duration_seconds: Optional[int] = None


class ScanMetrics(BaseModel):
    avg_duration: float
    avg_new: float
    total_scans: int
    rate_trend: list[dict] = []


# --- Settings ---

class SettingsUpdate(BaseModel):
    sweep_interval: Optional[int] = None
    tools: Optional[dict[str, bool]] = None
    ct_stream_enabled: Optional[bool] = None
    masscan_mode: Optional[str] = None
    masscan_rate: Optional[int] = None
    telegram_api_key: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    discord_webhook: Optional[str] = None
    slack_webhook: Optional[str] = None
    alerts_paused: Optional[bool] = None
    leakix_api_key: Optional[str] = None
    leakix_poll_interval: Optional[int] = None
    github_token: Optional[str] = None
    shodan_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None


class TestAlertRequest(BaseModel):
    channel: str = Field(..., pattern="^(telegram|discord|slack)$")


# --- System ---

class HealthResponse(BaseModel):
    status: str
    uptime: float
    db_size: int
    version: str
