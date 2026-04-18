"""P1 Warriors — IP Scan (Shodan pipeline) routes."""

import os
import subprocess
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from typing import Optional, List
from pydantic import BaseModel
import io, csv, json

from app.auth import get_current_user
from app.database import fetch_all, fetch_val, get_db
from app.models import APIResponse
from app.config import settings

router = APIRouter(prefix="/api/ipscan", tags=["ipscan"])

RISK_ORDER = "CASE risk WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'standard' THEN 4 ELSE 5 END"


class ScanRequest(BaseModel):
    scope: str = "all"          # "all" | "domain" | "custom"
    domain: Optional[str] = None          # when scope="domain"
    custom_domains: Optional[List[str]] = None  # when scope="custom"
    masscan_rate: Optional[int] = None    # override rate for this scan


class IPScanSettings(BaseModel):
    masscan_rate: Optional[int] = None
    masscan_mode: Optional[str] = None
    exclude_ports: Optional[str] = None  # comma-separated ports to skip, e.g. "80,443,8080"


@router.get("/results")
async def list_results(
    domain: Optional[str] = None,
    risk: Optional[str] = None,
    port: Optional[int] = None,
    is_new: Optional[bool] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    conditions = ["1=1"]
    params: list = []
    if domain:
        conditions.append("root_domain = ?")
        params.append(domain)
    if risk:
        risks = [r.strip() for r in risk.split(",")]
        conditions.append(f"risk IN ({','.join('?'*len(risks))})")
        params.extend(risks)
    if port:
        conditions.append("port = ?")
        params.append(port)
    if is_new is not None:
        conditions.append("is_new = ?")
        params.append(1 if is_new else 0)
    where = " AND ".join(conditions)
    total = await fetch_val(f"SELECT COUNT(*) FROM ip_scan_results WHERE {where}", tuple(params)) or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"SELECT * FROM ip_scan_results WHERE {where} ORDER BY {RISK_ORDER}, last_seen DESC LIMIT ? OFFSET ?",
        tuple(params + [per_page, offset])
    )
    return APIResponse(data=rows, meta={"total": total, "page": page, "pages": pages, "per_page": per_page})


@router.get("/stats")
async def ip_stats(user: dict = Depends(get_current_user)) -> APIResponse:
    total = await fetch_val("SELECT COUNT(*) FROM ip_scan_results") or 0
    new_today = await fetch_val("SELECT COUNT(*) FROM ip_scan_results WHERE first_seen >= datetime('now','-24 hours')") or 0
    by_risk = await fetch_all("SELECT risk, COUNT(*) as count FROM ip_scan_results GROUP BY risk ORDER BY count DESC")
    by_port = await fetch_all("SELECT port, COUNT(*) as count, MAX(reason) as reason FROM ip_scan_results GROUP BY port ORDER BY count DESC LIMIT 20")
    unique_ips = await fetch_val("SELECT COUNT(DISTINCT ip) FROM ip_scan_results") or 0
    domains = await fetch_all("SELECT domain FROM monitored_domains WHERE is_active=1 ORDER BY domain")
    return APIResponse(data={
        "total": total, "new_today": new_today, "unique_ips": unique_ips,
        "by_risk": by_risk, "by_port": by_port,
        "monitored_domains": [d["domain"] for d in domains],
    })


@router.get("/settings")
async def get_ipscan_settings(user: dict = Depends(get_current_user)) -> APIResponse:
    async with get_db() as db:
        rate_row = await db.execute("SELECT value FROM app_settings WHERE key='ipscan_masscan_rate'")
        rate_row = await rate_row.fetchone()
        mode_row = await db.execute("SELECT value FROM app_settings WHERE key='ipscan_masscan_mode'")
        mode_row = await mode_row.fetchone()
        excl_row = await db.execute("SELECT value FROM app_settings WHERE key='ipscan_exclude_ports'")
        excl_row = await excl_row.fetchone()
    return APIResponse(data={
        "masscan_rate": int(rate_row[0]) if rate_row else 1000,
        "masscan_mode": mode_row[0] if mode_row else "top",
        "exclude_ports": excl_row[0] if excl_row else "80,443,22,21,25,53",
    })


@router.put("/settings")
async def save_ipscan_settings(body: IPScanSettings, user: dict = Depends(get_current_user)) -> APIResponse:
    async with get_db() as db:
        if body.masscan_rate is not None:
            await db.execute(
                "INSERT OR REPLACE INTO app_settings (key,value) VALUES ('ipscan_masscan_rate',?)",
                (str(body.masscan_rate),)
            )
        if body.masscan_mode is not None:
            await db.execute(
                "INSERT OR REPLACE INTO app_settings (key,value) VALUES ('ipscan_masscan_mode',?)",
                (body.masscan_mode,)
            )
        if body.exclude_ports is not None:
            await db.execute(
                "INSERT OR REPLACE INTO app_settings (key,value) VALUES ('ipscan_exclude_ports',?)",
                (body.exclude_ports,)
            )
        await db.commit()
    return APIResponse(data={"status": "saved"})


@router.get("/progress")
async def get_progress(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get current ipscan progress."""
    async with get_db() as db:
        row = await db.execute("SELECT value FROM app_settings WHERE key='ipscan_progress'")
        row = await row.fetchone()
    import json as _json
    if row and row[0]:
        try:
            return APIResponse(data=_json.loads(row[0]))
        except Exception:
            pass
    return APIResponse(data={"phase": "idle", "detail": "No scan running", "done": True})


@router.post("/stop")
async def stop_scan(user: dict = Depends(get_current_user)) -> APIResponse:
    """Signal the ipscan pipeline to stop. Worker polls DB flag and kills its own child processes."""
    async with get_db() as db:
        await db.execute("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('ipscan_stop','1')")
        await db.commit()
    return APIResponse(data={"status": "stop signal sent"})


@router.post("/scan")
async def trigger_scan(body: ScanRequest = ScanRequest(), user: dict = Depends(get_current_user)) -> APIResponse:
    """Queue a scan request in DB — the worker picks it up within 30 seconds."""
    scope = body.scope
    domain = body.domain
    custom_domains = body.custom_domains or []
    masscan_rate = body.masscan_rate

    # Resolve domains list
    if scope == "domain" and domain:
        domains = [domain]
    elif scope == "custom" and custom_domains:
        domains = custom_domains
    else:
        domains = []  # empty = all active domains (worker resolves)

    req = json.dumps({"domains": domains if domains else None, "rate": masscan_rate})

    # Clear stop flag and write scan request — worker polls this every 30s
    async with get_db() as db:
        await db.execute("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('ipscan_stop','0')")
        await db.execute("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('ipscan_scan_request',?)", (req,))
        await db.commit()

    return APIResponse(data={"status": "scan queued", "scope": scope, "domains": domains or "all"})


@router.get("/export")
async def export_results(
    fmt: str = Query("csv", pattern="^(csv|json)$"),
    user: dict = Depends(get_current_user),
):
    rows = await fetch_all(
        "SELECT ip, port, hostname, root_domain, title, tech_stack, web_server, status_code, cdn, reason, risk, first_seen, last_seen FROM ip_scan_results ORDER BY risk, port",
        ()
    )
    if fmt == "json":
        content = json.dumps(rows, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=ipscan_export.json"}
        )
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ipscan_export.csv"}
    )


@router.get("/screenshot/{filename}")
async def get_ipscan_screenshot(filename: str, user: dict = Depends(get_current_user)):
    """Serve an IP scan screenshot file."""
    # Sanitize filename — no path traversal
    filename = os.path.basename(filename)
    path = os.path.join(settings.screenshot_dir, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Screenshot not found")
    ext = os.path.splitext(filename)[1].lower()
    media_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
    return FileResponse(path, media_type=media_types.get(ext, "image/jpeg"))


@router.get("/daily-domains")
async def get_daily_domains(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get all domains with their ipscan_daily flag."""
    async with get_db() as db:
        rows = await db.execute(
            "SELECT domain, ipscan_daily FROM monitored_domains WHERE is_active=1 ORDER BY domain"
        )
        rows = await rows.fetchall()
    return APIResponse(data=[{"domain": r[0], "ipscan_daily": bool(r[1])} for r in rows])


@router.put("/daily-domains")
async def set_daily_domains(
    body: dict,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Set ipscan_daily flag for domains. Body: {"domains": ["a.com", "b.com"]} = enabled list."""
    enabled = set(body.get("domains", []))
    async with get_db() as db:
        all_rows = await db.execute("SELECT domain FROM monitored_domains WHERE is_active=1")
        all_rows = await all_rows.fetchall()
        for row in all_rows:
            domain = row[0]
            flag = 1 if domain in enabled else 0
            await db.execute(
                "UPDATE monitored_domains SET ipscan_daily=? WHERE domain=?", (flag, domain)
            )
        await db.commit()
    return APIResponse(data={"status": "updated", "enabled_count": len(enabled)})



@router.get("/domain-stats")
async def get_domain_stats(user: dict = Depends(get_current_user)) -> APIResponse:
    """Per-domain breakdown: total ports, critical, high counts."""
    rows = await fetch_all("""
        SELECT
            root_domain as domain,
            COUNT(*) as total,
            SUM(CASE WHEN risk='critical' THEN 1 ELSE 0 END) as critical,
            SUM(CASE WHEN risk='high' THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN risk='medium' THEN 1 ELSE 0 END) as medium,
            COUNT(DISTINCT ip) as unique_ips
        FROM ip_scan_results
        WHERE root_domain IS NOT NULL AND root_domain != ''
        GROUP BY root_domain
        ORDER BY critical DESC, high DESC, total DESC
    """)
    return APIResponse(data=rows)
