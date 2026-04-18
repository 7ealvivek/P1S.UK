"""P1 Warriors — Intelligence Findings API routes."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_current_user
from app.database import fetch_all, fetch_val
from app.models import APIResponse

router = APIRouter(prefix="/api/intel", tags=["intelligence"])

CATEGORY_LABELS = {
    "email_security": "Email Security",
    "ssl": "SSL/TLS",
    "cors": "CORS",
    "bypass_403": "403 Bypass",
    "open_redirect": "Open Redirect",
    "sensitive_file": "Sensitive File",
    "exposed_service": "Exposed Service",
    "default_creds": "Default Credentials",
    "ipv6_exposure": "IPv6 Exposure",
    "dep_confusion": "Dependency Confusion",
    "historical_endpoint": "Historical Endpoint",
}

@router.get("")
async def list_intel(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=1000),
    category: Optional[str] = None,
    severity: Optional[str] = None,
    domain: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = Query("discovered_at", pattern="^(discovered_at|severity|category|subdomain)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    conditions = ["1=1"]
    params: list = []

    if category:
        conditions.append("category = ?")
        params.append(category)
    if severity:
        sevs = [s.strip() for s in severity.split(",")]
        placeholders = ",".join("?" * len(sevs))
        conditions.append(f"severity IN ({placeholders})")
        params.extend(sevs)
    if domain:
        conditions.append("root_domain = ?")
        params.append(domain)
    if search:
        conditions.append("(title LIKE ? OR subdomain LIKE ? OR url LIKE ?)")
        params.extend([f"%{search}%"] * 3)

    where = " AND ".join(conditions)
    sev_order = "CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END"
    order_clause = sev_order if sort == "severity" else f"{sort} {order}"

    total = await fetch_val(f"SELECT COUNT(*) FROM intel_findings WHERE {where}", tuple(params)) or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page

    rows = await fetch_all(
        f"""SELECT id, category, severity, subdomain, root_domain, title, url, detail,
                   confirmed, discovered_at, last_seen
            FROM intel_findings WHERE {where}
            ORDER BY {order_clause} LIMIT ? OFFSET ?""",
        tuple(params + [per_page, offset]),
    )
    return APIResponse(data=rows, meta={"total": total, "page": page, "pages": pages})


@router.get("/stats")
async def intel_stats(
    domain: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    params: list = []
    where = "1=1"
    if domain:
        where = "root_domain = ?"
        params.append(domain)

    total = await fetch_val(f"SELECT COUNT(*) FROM intel_findings WHERE {where}", tuple(params)) or 0
    by_category = await fetch_all(
        f"SELECT category, COUNT(*) as count FROM intel_findings WHERE {where} GROUP BY category ORDER BY count DESC",
        tuple(params)
    )
    by_severity = await fetch_all(
        f"SELECT severity, COUNT(*) as count FROM intel_findings WHERE {where} GROUP BY severity ORDER BY count DESC",
        tuple(params)
    )
    by_domain = await fetch_all(
        f"SELECT root_domain, COUNT(*) as count FROM intel_findings WHERE {where} GROUP BY root_domain ORDER BY count DESC LIMIT 20",
        tuple(params)
    )
    critical_high = await fetch_val(
        f"SELECT COUNT(*) FROM intel_findings WHERE {where} AND severity IN ('critical','high')",
        tuple(params)
    ) or 0

    return APIResponse(data={
        "total": total,
        "critical_high": critical_high,
        "by_category": by_category,
        "by_severity": by_severity,
        "by_domain": by_domain,
        "category_labels": CATEGORY_LABELS,
    })


@router.delete("/{finding_id}")
async def delete_intel(
    finding_id: int,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    import sqlite3, os, asyncio
    db_path = os.getenv("DB_PATH", "/root/p1warriors-deploy/data/p1warriors.db")
    loop = asyncio.get_event_loop()
    def _del():
        conn = sqlite3.connect(db_path, timeout=30)
        conn.execute("DELETE FROM intel_findings WHERE id=?", (finding_id,))
        conn.commit()
        conn.close()
    await loop.run_in_executor(None, _del)
    return APIResponse(data={"deleted": finding_id})
