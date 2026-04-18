"""P1 Warriors — Ports API routes."""

from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.auth import get_current_user
from app.database import fetch_all
from app.models import APIResponse
from app.routers.dashboard import classify_port, get_service_name, CRITICAL_PORTS, HIGH_PORTS, MEDIUM_PORTS

router = APIRouter(prefix="/api/ports", tags=["ports"])


def _parse_all_ports(rows: list[dict]) -> dict[int, int]:
    """Parse ports from all rows and return port -> count mapping."""
    port_counts: dict[int, int] = {}
    for row in rows:
        ports_str = row.get("ports", "")
        if not ports_str:
            continue
        for p in ports_str.split(","):
            p = p.strip()
            if p.isdigit():
                port_num = int(p)
                port_counts[port_num] = port_counts.get(port_num, 0) + 1
    return port_counts


@router.get("/summary")
async def port_summary(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get port summary with counts and risk levels."""
    rows = await fetch_all("""
        SELECT ports FROM subdomains
        WHERE ports IS NOT NULL AND ports != ''
    """)

    port_counts = _parse_all_ports(rows)
    total_subs_with_ports = len(rows)

    result = []
    for port, count in sorted(port_counts.items(), key=lambda x: x[1], reverse=True):
        result.append({
            "port": port,
            "service": get_service_name(port),
            "count": count,
            "risk": classify_port(port),
            "percentage": round((count / total_subs_with_ports * 100) if total_subs_with_ports > 0 else 0, 1),
        })

    # Sort by risk level first (critical > high > medium > standard), then count
    risk_order = {"critical": 0, "high": 1, "medium": 2, "standard": 3}
    result.sort(key=lambda x: (risk_order.get(x["risk"], 4), -x["count"]))

    return APIResponse(data=result)


@router.get("/risk-overview")
async def risk_overview(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get port risk overview counts."""
    rows = await fetch_all("""
        SELECT ports FROM subdomains
        WHERE ports IS NOT NULL AND ports != ''
    """)

    # Count unique subdomain:port pairs per risk
    critical = set()
    high = set()
    medium = set()
    standard = set()

    for row in rows:
        ports_str = row.get("ports", "")
        if not ports_str:
            continue
        for p in ports_str.split(","):
            p = p.strip()
            if p.isdigit():
                port_num = int(p)
                if port_num in CRITICAL_PORTS:
                    critical.add(port_num)
                elif port_num in HIGH_PORTS:
                    high.add(port_num)
                elif port_num in MEDIUM_PORTS:
                    medium.add(port_num)
                else:
                    standard.add(port_num)

    # Actually count subdomain:port pairs
    critical_count = 0
    high_count = 0
    medium_count = 0
    standard_count = 0

    for row in rows:
        ports_str = row.get("ports", "")
        if not ports_str:
            continue
        for p in ports_str.split(","):
            p = p.strip()
            if p.isdigit():
                port_num = int(p)
                risk = classify_port(port_num)
                if risk == "critical":
                    critical_count += 1
                elif risk == "high":
                    high_count += 1
                elif risk == "medium":
                    medium_count += 1
                else:
                    standard_count += 1

    return APIResponse(data={
        "critical": critical_count,
        "high": high_count,
        "medium": medium_count,
        "standard": standard_count,
    })


@router.get("/{port}/subdomains")
async def port_subdomains(
    port: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=250),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get subdomains that have a specific port open."""
    # Match port in comma-separated list
    rows = await fetch_all("""
        SELECT * FROM subdomains
        WHERE ports LIKE ? OR ports LIKE ? OR ports LIKE ? OR ports = ?
        ORDER BY first_seen DESC
    """, (f"{port},%", f"%,{port},%", f"%,{port}", str(port)))

    total = len(rows)
    offset = (page - 1) * per_page
    paged = rows[offset:offset + per_page]
    pages = max(1, (total + per_page - 1) // per_page)

    return APIResponse(
        data=paged,
        meta={"total": total, "page": page, "pages": pages},
    )
