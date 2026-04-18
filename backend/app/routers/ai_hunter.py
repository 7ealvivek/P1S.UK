"""P1 Warriors — AI Hunter API routes."""

import subprocess
import signal
import os
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional

from app.auth import get_current_user
from app.database import fetch_all, fetch_val, execute, get_db
from app.models import APIResponse

router = APIRouter(prefix="/api/ai-hunter", tags=["ai-hunter"])


@router.get("/stats")
async def hunter_stats(user: dict = Depends(get_current_user)) -> APIResponse:
    total_hunts = await fetch_val("SELECT COUNT(*) FROM ai_hunts WHERE hypotheses_tested > 0") or 0
    total_findings = await fetch_val("SELECT COUNT(*) FROM ai_findings") or 0
    total_chains = await fetch_val("SELECT COUNT(*) FROM ai_chains") or 0
    by_severity = await fetch_all(
        "SELECT severity, COUNT(*) as count FROM ai_findings GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END"
    )
    by_type = await fetch_all(
        "SELECT finding_type, COUNT(*) as count FROM ai_findings GROUP BY finding_type ORDER BY count DESC"
    )
    recent_hunts = await fetch_all(
        "SELECT * FROM ai_hunts WHERE hypotheses_tested > 0 ORDER BY id DESC LIMIT 10"
    )
    paused = await fetch_val("SELECT value FROM app_settings WHERE key='ai_hunter_paused'")
    skipped = await fetch_all("SELECT domain FROM ai_hunter_skips ORDER BY created_at DESC")
    return APIResponse(data={
        "total_hunts": total_hunts,
        "total_findings": total_findings,
        "total_chains": total_chains,
        "by_severity": by_severity,
        "by_type": by_type,
        "recent_hunts": recent_hunts,
        "paused": paused == '1' if paused else False,
        "skipped_domains": [r["domain"] for r in skipped] if skipped else [],
    })


@router.get("/findings")
async def list_findings(
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=10, le=100),
    severity: Optional[str] = None,
    domain: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    conditions = ["1=1"]
    params: list = []
    if severity:
        conditions.append("severity = ?")
        params.append(severity)
    if domain:
        conditions.append("domain = ?")
        params.append(domain)
    where = " AND ".join(conditions)
    total = await fetch_val(f"SELECT COUNT(*) FROM ai_findings WHERE {where}", tuple(params)) or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"""SELECT * FROM ai_findings WHERE {where}
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC
        LIMIT ? OFFSET ?""",
        tuple(params + [per_page, offset])
    )
    return APIResponse(data=rows, meta={"total": total, "page": page, "pages": pages, "per_page": per_page})


@router.get("/chains")
async def list_chains(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=5, le=50),
    domain: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    conditions = ["1=1"]
    params: list = []
    if domain:
        conditions.append("domain = ?")
        params.append(domain)
    where = " AND ".join(conditions)
    total = await fetch_val(f"SELECT COUNT(*) FROM ai_chains WHERE {where}", tuple(params)) or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"""SELECT * FROM ai_chains WHERE {where}
        ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, created_at DESC
        LIMIT ? OFFSET ?""",
        tuple(params + [per_page, offset])
    )
    return APIResponse(data=rows, meta={"total": total, "page": page, "pages": pages, "per_page": per_page})


@router.get("/hunts")
async def list_hunts(
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    rows = await fetch_all(
        "SELECT * FROM ai_hunts WHERE hypotheses_tested > 0 ORDER BY id DESC LIMIT ?", (limit,)
    )
    return APIResponse(data=rows)


@router.post("/launch")
async def launch_hunt(
    body: dict,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    domain = body.get("domain", "").strip()
    if not domain:
        raise HTTPException(status_code=400, detail="domain is required")

    # Stop any running/pending hunts first
    await execute(
        "UPDATE ai_hunts SET status='stop_requested' WHERE status='running'"
    )
    await execute(
        "DELETE FROM ai_hunts WHERE status='pending'"
    )

    await execute(
        "INSERT INTO ai_hunts (domain, status) VALUES (?, 'pending')", (domain,)
    )
    return APIResponse(data={"status": "launched", "domain": domain})


@router.post("/stop")
async def stop_current_hunt(user: dict = Depends(get_current_user)) -> APIResponse:
    """Stop the currently running hunt. Sets status to 'stop_requested' — daemon handles the kill."""
    rows = await fetch_all("SELECT id, domain FROM ai_hunts WHERE status IN ('running','pending') ORDER BY id DESC LIMIT 1")
    if not rows:
        raise HTTPException(status_code=400, detail="No hunt is currently running")

    hunt_id = rows[0]["id"]
    domain = rows[0]["domain"]

    await execute(
        "UPDATE ai_hunts SET status='stop_requested' WHERE id=?", (hunt_id,)
    )
    return APIResponse(data={"stopped": True, "hunt_id": hunt_id, "domain": domain})


@router.post("/pause")
async def toggle_pause(user: dict = Depends(get_current_user)) -> APIResponse:
    """Toggle pause/resume the AI hunter daemon."""
    current = await fetch_val("SELECT value FROM app_settings WHERE key='ai_hunter_paused'")
    new_val = '0' if current == '1' else '1'
    await execute(
        "INSERT INTO app_settings (key, value) VALUES ('ai_hunter_paused', ?) ON CONFLICT(key) DO UPDATE SET value=?",
        (new_val, new_val)
    )
    return APIResponse(data={"paused": new_val == '1'})


@router.post("/skip")
async def skip_domain(body: dict, user: dict = Depends(get_current_user)) -> APIResponse:
    """Add a domain to the skip list."""
    domain = body.get("domain", "").strip()
    if not domain:
        raise HTTPException(status_code=400, detail="domain is required")
    await execute(
        "INSERT OR IGNORE INTO ai_hunter_skips (domain) VALUES (?)", (domain,)
    )
    # Also kill any running hunt for this domain
    await execute(
        "UPDATE ai_hunts SET status='skipped' WHERE domain=? AND status='running'", (domain,)
    )
    return APIResponse(data={"skipped": domain})


@router.post("/unskip")
async def unskip_domain(body: dict, user: dict = Depends(get_current_user)) -> APIResponse:
    """Remove a domain from the skip list."""
    domain = body.get("domain", "").strip()
    if not domain:
        raise HTTPException(status_code=400, detail="domain is required")
    await execute("DELETE FROM ai_hunter_skips WHERE domain=?", (domain,))
    return APIResponse(data={"unskipped": domain})


@router.get("/live")
async def live_activity(
    lines: int = Query(50, ge=10, le=200),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Return last N lines of the AI hunter log + running status."""
    log_lines = []
    try:
        with open("/data/ai_hunter_last.log") as f:
            all_lines = f.readlines()
            log_lines = [l.rstrip() for l in all_lines[-lines:]]
    except FileNotFoundError:
        pass

    running = await fetch_val("SELECT COUNT(*) FROM ai_hunts WHERE status='running'") or 0
    current_hunt = None
    if running > 0:
        rows = await fetch_all("SELECT * FROM ai_hunts WHERE status='running' ORDER BY id DESC LIMIT 1")
        if rows:
            current_hunt = rows[0]

    paused = await fetch_val("SELECT value FROM app_settings WHERE key='ai_hunter_paused'")

    return APIResponse(data={
        "log": log_lines,
        "running": running > 0,
        "current_hunt": current_hunt,
        "paused": paused == '1' if paused else False,
    })



@router.get("/alert-hunter")
async def alert_hunter_status(
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Live status of the Alert Hunter (Changes/Ports/Tech watchers)."""
    import subprocess as _sp

    # 1. Service status — check if live log was updated in last 2 min
    import os, time as _time
    service_active = False
    try:
        log_path = "/data/alert_hunter_live.log"
        if os.path.exists(log_path):
            mtime = os.path.getmtime(log_path)
            service_active = (_time.time() - mtime) < 120
    except Exception:
        pass

    # 2. Recent alert-triggered hunts from DB
    alert_hunts = await fetch_all(
        "SELECT id, domain, status, started_at, finished_at, hypotheses_tested, findings_count, summary "
        "FROM ai_hunts WHERE summary LIKE '[%' ORDER BY id DESC LIMIT 20"
    )

    # 3. Alert hunter live log from shared data dir
    log_lines = []
    try:
        import os
        log_path = "/data/alert_hunter_live.log"
        if os.path.exists(log_path):
            with open(log_path) as f:
                all_lines = f.read().strip().split("\n")
            log_lines = [l.strip() for l in all_lines[-30:] if l.strip()]
    except Exception:
        pass

    # 4. Per-type log files (last Claude output)
    type_logs = {}
    for hunt_type in ["changes", "ports", "tech"]:
        try:
            with open(f"/data/alert_hunter_{hunt_type}.log") as f:
                content = f.read().strip()
                if content:
                    type_logs[hunt_type] = content[-3000:]
        except FileNotFoundError:
            pass

    # 5. Recent asset changes (what triggers hunts)
    recent_changes = await fetch_all(
        "SELECT root_domain, change_type, COUNT(*) as cnt "
        "FROM asset_changes WHERE detected_at > datetime('now', '-3 hours') "
        "GROUP BY root_domain, change_type ORDER BY cnt DESC LIMIT 15"
    )

    # 6. Currently active alert hunts
    active = await fetch_all(
        "SELECT id, domain, summary FROM ai_hunts WHERE status='running' AND summary LIKE '[%'"
    )

    # 7. Findings from alert-triggered hunts
    alert_findings = await fetch_all(
        "SELECT f.id, f.hunt_id, f.domain, f.subdomain, f.finding_type, f.severity, "
        "f.title, f.description, f.poc, f.created_at "
        "FROM ai_findings f JOIN ai_hunts h ON f.hunt_id = h.id "
        "WHERE h.summary LIKE '[%' ORDER BY f.id DESC LIMIT 50"
    )

    return APIResponse(data={
        "service_active": service_active,
        "alert_hunts": alert_hunts,
        "log_lines": log_lines[-30:],
        "type_logs": type_logs,
        "recent_changes": recent_changes,
        "active_hunts": active,
        "findings": alert_findings,
    })
