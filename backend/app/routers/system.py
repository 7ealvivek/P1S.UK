"""P1 Warriors — System status and enrichment API."""

import os
import subprocess
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, BackgroundTasks
from typing import Optional

from app.auth import get_current_user
from app.database import fetch_all, fetch_one, fetch_val, get_db
from app.models import APIResponse

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
async def get_system_status(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get system status: engine running, last scan, coverage stats."""
    # Check if scanner worker is running
    try:
        result = subprocess.run(
            ["pgrep", "-f", "worker.py"], capture_output=True, text=True, timeout=5
        )
        scanner_running = result.returncode == 0
    except Exception:
        scanner_running = False

    # Last scan info
    last_scan = await fetch_one(
        "SELECT * FROM scan_log ORDER BY started_at DESC LIMIT 1"
    )

    # Coverage stats
    total = await fetch_val("SELECT COUNT(*) FROM subdomains") or 0
    live = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE status_code IS NOT NULL") or 0
    with_tech = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE tech_stack IS NOT NULL AND tech_stack != ''") or 0
    with_ports = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE ports IS NOT NULL AND ports != ''") or 0
    with_screenshots = await fetch_val("SELECT COUNT(*) FROM subdomains WHERE screenshot_path IS NOT NULL AND screenshot_path != ''") or 0

    # Get current config from app_settings
    config_row = await fetch_one("SELECT value FROM app_settings WHERE key = 'scanner_config'")
    config = json.loads(config_row["value"]) if config_row else {}

    return APIResponse(data={
        "scanner_running": scanner_running,
        "last_scan": dict(last_scan) if last_scan else None,
        "coverage": {
            "total": total,
            "live": live,
            "live_pct": round(live / total * 100, 1) if total > 0 else 0,
            "tech": with_tech,
            "tech_pct": round(with_tech / total * 100, 1) if total > 0 else 0,
            "ports": with_ports,
            "ports_pct": round(with_ports / total * 100, 1) if total > 0 else 0,
            "screenshots": with_screenshots,
            "screenshots_pct": round(with_screenshots / total * 100, 1) if total > 0 else 0,
        },
        "config": config,
    })


@router.post("/enrichment/run")
async def trigger_enrichment(
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Trigger re-enrichment of all subdomains missing data."""
    # Count how many need enrichment
    missing_httpx = await fetch_val(
        "SELECT COUNT(*) FROM subdomains WHERE status_code IS NULL"
    ) or 0
    missing_tech = await fetch_val(
        "SELECT COUNT(*) FROM subdomains WHERE (tech_stack IS NULL OR tech_stack = '') AND status_code IS NOT NULL"
    ) or 0
    missing_ports = await fetch_val(
        "SELECT COUNT(*) FROM subdomains WHERE (ports IS NULL OR ports = '')"
    ) or 0

    return APIResponse(data={
        "message": "Enrichment queued. Check system status for progress.",
        "missing": {
            "httpx": missing_httpx,
            "tech": missing_tech,
            "ports": missing_ports,
        }
    })


@router.post("/scan/force")
async def force_scan(
    domain: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Force an immediate scan. If domain specified, scan that domain only."""
    try:
        if domain:
            # Write scan request to app_settings for the worker to pick up
            async with get_db() as db:
                await db.execute(
                    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
                    ("force_scan", json.dumps({"domain": domain, "requested_at": datetime.now(timezone.utc).isoformat()}))
                )
                await db.commit()
        else:
            async with get_db() as db:
                await db.execute(
                    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
                    ("force_scan", json.dumps({"domain": "all", "requested_at": datetime.now(timezone.utc).isoformat()}))
                )
                await db.commit()

        return APIResponse(data={"message": f"Scan queued for {'all domains' if not domain else domain}"})
    except Exception as e:
        return APIResponse(data={"error": str(e)})
