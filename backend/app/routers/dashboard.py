"""P1 Warriors — Dashboard API routes."""

from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.auth import get_current_user
from app.database import fetch_all, fetch_one, fetch_val
from app.models import APIResponse

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_stats(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get dashboard KPI stats."""
    total = await fetch_val("SELECT COUNT(*) FROM subdomains") or 0
    new = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE first_seen >= datetime('now','-24 hours')") or 0
    # Count monitored domains (not just distinct from subdomains)
    domains = await fetch_val("SELECT COUNT(*) FROM monitored_domains WHERE is_active = 1") or 0
    with_ports = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE ports IS NOT NULL AND ports != ''") or 0
    with_tech = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE tech_stack IS NOT NULL AND tech_stack != ''") or 0
    with_screenshots = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE screenshot_path IS NOT NULL AND screenshot_path != ''") or 0

    return APIResponse(data={
        "total": total,
        "new": new,
        "domains": domains,
        "with_ports": with_ports,
        "with_tech": with_tech,
        "with_screenshots": with_screenshots,
    })


@router.get("/timeline")
async def get_timeline(
    period: str = Query("7d", pattern="^(24h|7d|30d)$"),
    domain: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get discovery timeline data."""
    if period == "24h":
        group_fmt = "%Y-%m-%d %H:00"
        where_clause = "first_seen >= datetime('now', '-1 day')"
    elif period == "7d":
        group_fmt = "%Y-%m-%d"
        where_clause = "first_seen >= datetime('now', '-7 days')"
    else:
        group_fmt = "%Y-%m-%d"
        where_clause = "first_seen >= datetime('now', '-30 days')"

    params: list = []
    if domain:
        where_clause += " AND root_domain = ?"
        params.append(domain)

    query = f"""
        SELECT
            strftime('{group_fmt}', first_seen) as date,
            COUNT(*) as count,
            SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_count
        FROM subdomains
        WHERE {where_clause}
        GROUP BY date
        ORDER BY date ASC
    """
    rows = await fetch_all(query, tuple(params))
    return APIResponse(data=rows)


@router.get("/sources")
async def get_sources(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get subdomain source distribution."""
    rows = await fetch_all("""
        SELECT source, COUNT(*) as count
        FROM subdomains
        GROUP BY source
        ORDER BY count DESC
    """)
    return APIResponse(data=rows)


@router.get("/top-tech")
async def get_top_tech(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get top technologies detected."""
    # tech_stack is comma-separated, we need to split and count
    rows = await fetch_all("""
        SELECT tech_stack FROM subdomains
        WHERE tech_stack IS NOT NULL AND tech_stack != ''
    """)

    tech_counts: dict[str, int] = {}
    for row in rows:
        techs = [t.strip() for t in row["tech_stack"].split(",") if t.strip()]
        for tech in techs:
            tech_counts[tech] = tech_counts.get(tech, 0) + 1

    sorted_techs = sorted(tech_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return APIResponse(data=[{"name": name, "count": count} for name, count in sorted_techs])


# Port risk classification
CRITICAL_PORTS = {21, 23, 445, 1433, 3389, 5900}
HIGH_PORTS = {22, 3306, 5432, 6379, 9200, 27017}
MEDIUM_PORTS = {8080, 8443, 9090, 8888, 10000}

PORT_SERVICES = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 445: "SMB",
    993: "IMAPS", 995: "POP3S", 1433: "MSSQL", 1521: "Oracle",
    3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL", 5900: "VNC",
    6379: "Redis", 8080: "HTTP-Alt", 8443: "HTTPS-Alt", 8888: "HTTP-Alt",
    9090: "HTTP-Alt", 9200: "Elasticsearch", 10000: "Webmin",
    27017: "MongoDB",
}


def classify_port(port: int) -> str:
    if port in CRITICAL_PORTS:
        return "critical"
    if port in HIGH_PORTS:
        return "high"
    if port in MEDIUM_PORTS:
        return "medium"
    return "standard"


def get_service_name(port: int) -> str:
    return PORT_SERVICES.get(port, f"port-{port}")


@router.get("/top-ports")
async def get_top_ports(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get top open ports detected."""
    rows = await fetch_all("""
        SELECT ports FROM subdomains
        WHERE ports IS NOT NULL AND ports != ''
    """)

    port_counts: dict[int, int] = {}
    for row in rows:
        ports_str = row["ports"]
        for p in ports_str.split(","):
            p = p.strip()
            if p.isdigit():
                port_num = int(p)
                port_counts[port_num] = port_counts.get(port_num, 0) + 1

    sorted_ports = sorted(port_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return APIResponse(data=[
        {
            "port": port,
            "service": get_service_name(port),
            "count": count,
            "risk": classify_port(port),
        }
        for port, count in sorted_ports
    ])


@router.get("/recent-scans")
async def get_recent_scans(
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get recent scan log entries."""
    rows = await fetch_all("""
        SELECT *,
            CASE
                WHEN finished_at IS NOT NULL
                THEN CAST((julianday(finished_at) - julianday(started_at)) * 86400 AS INTEGER)
                ELSE NULL
            END as duration_seconds
        FROM scan_log
        ORDER BY started_at DESC
        LIMIT ?
    """, (limit,))
    return APIResponse(data=rows)


@router.get("/stats/extended")
async def get_extended_stats(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get extended dashboard stats with deltas and new subdomain tracking."""
    total = await fetch_val("SELECT COUNT(*) FROM subdomains") or 0
    live = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE status_code IS NOT NULL") or 0
    new_today = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE first_seen >= datetime('now', '-1 day')") or 0
    new_week = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE first_seen >= datetime('now', '-7 days')") or 0
    with_ports = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE ports IS NOT NULL AND ports != ''") or 0
    with_screenshots = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE screenshot_path IS NOT NULL AND screenshot_path != ''") or 0
    domains = await fetch_val("SELECT COUNT(*) FROM monitored_domains WHERE is_active = 1") or 0

    # Deltas: compare today vs yesterday
    today_total = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE first_seen >= date('now')") or 0
    today_live = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE first_seen >= date('now') AND status_code IS NOT NULL") or 0
    today_ports = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE first_seen >= date('now') AND ports IS NOT NULL AND ports != ''") or 0

    return APIResponse(data={
        "total_subdomains": total,
        "live_hosts": live,
        "new_today": new_today,
        "new_this_week": new_week,
        "open_ports": with_ports,
        "screenshots": with_screenshots,
        "domains": domains,
        "delta_today": {
            "subdomains": today_total,
            "live_hosts": today_live,
            "ports": today_ports,
        }
    })


@router.get("/recent-discoveries")
async def get_recent_discoveries(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get recently discovered subdomains."""
    rows = await fetch_all(
        "SELECT * FROM subdomains ORDER BY first_seen DESC LIMIT ?",
        (limit,)
    )
    return APIResponse(data=rows)


@router.get("/new-today")
async def get_new_today(
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get subdomains discovered in the last 24 hours."""
    rows = await fetch_all(
        "SELECT * FROM subdomains WHERE first_seen >= datetime('now', '-1 day') ORDER BY first_seen DESC LIMIT ?",
        (limit,)
    )
    return APIResponse(data=rows)


@router.get("/critical-ports")
async def get_critical_ports(
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get subdomains with critical ports (21,23,445,3389,6379,27017)."""
    rows = await fetch_all("""
        SELECT * FROM subdomains
        WHERE (ports LIKE '%21%' OR ports LIKE '%23%' OR ports LIKE '%445%'
               OR ports LIKE '%3389%' OR ports LIKE '%6379%' OR ports LIKE '%27017%')
        AND ports IS NOT NULL AND ports != ''
        ORDER BY first_seen DESC LIMIT ?
    """, (limit,))
    return APIResponse(data=rows)

