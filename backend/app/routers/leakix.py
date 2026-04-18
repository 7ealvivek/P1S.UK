"""P1 Warriors — LeakIX integration routes."""

import httpx
from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.auth import get_current_user
from app.database import fetch_all, fetch_val, get_db
from app.models import APIResponse

router = APIRouter(prefix="/api/leakix", tags=["leakix"])

PLUGIN_LABELS = {
    "GitConfigHttpPlugin": "Git Config Exposed",
    "ApacheStatusPlugin": "Apache Status Exposed",
    "PhpInfoHttpPlugin": "PHP Info Exposed",
    "WpUserEnumHttp": "WordPress User Enumeration",
    "EnvFileHttpPlugin": "Environment File Exposed (.env)",
    "DsStoreHttpPlugin": ".DS_Store Exposed",
    "ElasticSearchOpenPlugin": "Elasticsearch Open",
    "MongoOpenPlugin": "MongoDB Open (No Auth)",
    "RedisOpenPlugin": "Redis Open (No Auth)",
    "GitHubActionsExposedSecretPlugin": "GitHub Actions Secret Exposed",
    "DockerRegistryPlugin": "Docker Registry Open",
    "SwaggerPlugin": "Swagger UI Exposed",
    "KubernetesApiPlugin": "Kubernetes API Exposed",
    "JenkinsPlugin": "Jenkins Exposed",
    "GrafanaPlugin": "Grafana Exposed",
}


@router.get("/leaks")
async def list_leaks(
    domain: Optional[str] = None,
    severity: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """List all stored LeakIX findings."""
    conditions = ["1=1"]
    params: list = []
    if domain:
        conditions.append("root_domain = ?")
        params.append(domain)
    if severity:
        sevs = [s.strip() for s in severity.split(",")]
        conditions.append(f"severity IN ({','.join('?'*len(sevs))})")
        params.extend(sevs)
    where = " AND ".join(conditions)
    total = await fetch_val(f"SELECT COUNT(*) FROM leakix_leaks WHERE {where}", tuple(params)) or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"SELECT * FROM leakix_leaks WHERE {where} ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, discovered_at DESC LIMIT ? OFFSET ?",
        tuple(params + [per_page, offset])
    )
    # Enrich plugin labels
    for row in rows:
        row["plugin_label"] = PLUGIN_LABELS.get(row.get("event_source", ""), row.get("event_source", "Unknown"))
    return APIResponse(data=rows, meta={"total": total, "page": page, "pages": pages, "per_page": per_page})


@router.get("/stats")
async def leak_stats(user: dict = Depends(get_current_user)) -> APIResponse:
    """Counts by severity and domain."""
    by_sev = await fetch_all("SELECT severity, COUNT(*) as count FROM leakix_leaks GROUP BY severity ORDER BY count DESC")
    by_domain = await fetch_all("SELECT root_domain, COUNT(*) as count FROM leakix_leaks GROUP BY root_domain ORDER BY count DESC")
    total = await fetch_val("SELECT COUNT(*) FROM leakix_leaks") or 0
    new_today = await fetch_val("SELECT COUNT(*) FROM leakix_leaks WHERE discovered_at >= datetime('now', '-24 hours')") or 0
    return APIResponse(data={"total": total, "new_today": new_today, "by_severity": by_sev, "by_domain": by_domain})


@router.post("/scan")
async def trigger_scan(
    domain: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Trigger an immediate LeakIX scan for one or all domains."""
    async with get_db() as db:
        key_row = await db.execute("SELECT value FROM app_settings WHERE key='leakix_api_key'")
        key_row = await key_row.fetchone()
        api_key = key_row[0] if key_row else ""
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="LeakIX API key not configured — save it in Settings first")

    if domain:
        domains_to_scan = [domain]
    else:
        rows = await fetch_all("SELECT domain FROM monitored_domains WHERE is_active=1")
        domains_to_scan = [r["domain"] for r in rows]

    results = {}
    async with httpx.AsyncClient(timeout=30) as client:
        for d in domains_to_scan:
            try:
                new_count = await _fetch_and_store(client, d, api_key)
                results[d] = new_count
            except Exception as e:
                results[d] = f"error: {str(e)}"

    return APIResponse(data={"scanned": len(domains_to_scan), "new_findings": results})


async def _fetch_and_store(client: httpx.AsyncClient, domain: str, api_key: str) -> int:
    """Fetch LeakIX data for a domain and store new findings. Returns count of new items."""
    resp = await client.get(
        f"https://leakix.net/domain/{domain}",
        headers={"api-key": api_key, "Accept": "application/json"},
        timeout=30,
    )
    if resp.status_code != 200:
        return 0

    data = resp.json()
    leaks = data.get("Leaks") or []
    new_count = 0

    async with get_db() as db:
        for leak_group in leaks:
            for event in leak_group.get("events", []):
                fingerprint = event.get("event_fingerprint", "")
                if not fingerprint:
                    continue
                severity = (event.get("leak") or {}).get("severity", "info")
                host = event.get("host", "")
                ip = event.get("ip", "")
                port = event.get("port", "")
                event_source = event.get("event_source", "")
                summary = (event.get("summary") or "")[:2000]
                found_at = event.get("time", "")[:19].replace("T", " ")

                try:
                    cursor = await db.execute(
                        """INSERT OR IGNORE INTO leakix_leaks
                        (root_domain, host, ip, port, event_source, event_fingerprint, severity, summary, found_at)
                        VALUES (?,?,?,?,?,?,?,?,?)""",
                        (domain, host, ip, port, event_source, fingerprint, severity, summary, found_at)
                    )
                    if cursor.rowcount > 0:
                        new_count += 1
                except Exception:
                    continue
        await db.commit()

    # Slack notification for new findings
    if new_count > 0:
        await _notify_slack(domain, new_count)

    return new_count


async def _notify_slack(domain: str, new_count: int):
    """Send Slack notification for new LeakIX findings."""
    try:
        async with get_db() as db:
            row = await db.execute("SELECT value FROM app_settings WHERE key='slack_webhook'")
            row = await row.fetchone()
            webhook = row[0] if row else ""
            paused_row = await db.execute("SELECT value FROM app_settings WHERE key='alerts_paused'")
            paused_row = await paused_row.fetchone()
            paused = (paused_row[0] if paused_row else "false") == "true"

        if not webhook or paused:
            return

        # Get new findings details
        new_findings = await fetch_all(
            """SELECT host, ip, port, event_source, severity, found_at
               FROM leakix_leaks WHERE root_domain=? AND notified=0
               ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END
               LIMIT 10""",
            (domain,)
        )

        sev_emoji = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🔵", "info": "⚪"}
        lines = [f"🚨 *{new_count} new LeakIX finding{'s' if new_count > 1 else ''}* — `{domain}`\n"]
        for f in new_findings:
            em = sev_emoji.get(f.get("severity", "info"), "⚪")
            label = PLUGIN_LABELS.get(f.get("event_source", ""), f.get("event_source", "Unknown"))
            lines.append(f"{em} *{f.get('severity','').upper()}* | {label} | `{f.get('host','')}:{f.get('port','')}` | {f.get('found_at','')[:10]}")
        if new_count > 10:
            lines.append(f"_...and {new_count - 10} more_")

        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(webhook, json={"text": "\n".join(lines)})

        # Mark as notified
        async with get_db() as db:
            await db.execute("UPDATE leakix_leaks SET notified=1 WHERE root_domain=? AND notified=0", (domain,))
            await db.commit()
    except Exception:
        pass
