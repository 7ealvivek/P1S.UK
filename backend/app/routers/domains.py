"""P1 Warriors — Domains API routes."""

import json as _json
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import get_current_user
from app.database import fetch_all, fetch_val, get_db
from app.models import APIResponse, AddDomainRequest, BulkAddDomainsRequest, PatchDomainRequest

router = APIRouter(prefix="/api/domains", tags=["domains"])


@router.get("")
async def list_domains(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str = Query("", alias="search"),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """List root domains with stats — paginated."""

    offset = (page - 1) * per_page
    search_clause = ""
    search_params: tuple = ()
    if search:
        search_clause = "WHERE domain LIKE ?"
        search_params = (f"%{search}%",)

    total_domains = await fetch_val(
        f"SELECT COUNT(*) FROM monitored_domains {search_clause}", search_params
    ) or 0

    domains = await fetch_all(
        f"SELECT domain, auto_sweep, deep_scan FROM monitored_domains {search_clause} ORDER BY domain LIMIT ? OFFSET ?",
        search_params + (per_page, offset),
    )

    if not domains:
        return APIResponse(data={
            "items": [],
            "total": total_domains,
            "page": page,
            "per_page": per_page,
            "pages": 0,
        })

    domain_list = [d["domain"] for d in domains]

    # ── Aggregate subdomain counts in ONE query ──────────────────────────────
    placeholders = ",".join("?" * len(domain_list))

    sub_counts = await fetch_all(f"""
        SELECT
            root_domain,
            COUNT(*)                                                   AS total,
            SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END)               AS new_count,
            SUM(CASE WHEN ports IS NOT NULL AND ports != '' THEN 1 ELSE 0 END) AS with_ports,
            SUM(CASE WHEN tech_stack IS NOT NULL AND tech_stack != '' THEN 1 ELSE 0 END) AS with_tech
        FROM subdomains
        WHERE root_domain IN ({placeholders})
        GROUP BY root_domain
    """, domain_list)

    counts_map = {r["root_domain"]: r for r in sub_counts}

    # ── Top tech per domain in ONE query ──────────────────────────────────────
    tech_rows = await fetch_all(f"""
        SELECT root_domain, tech_stack
        FROM subdomains
        WHERE root_domain IN ({placeholders})
          AND tech_stack IS NOT NULL AND tech_stack != ''
    """, domain_list)

    tech_map: dict[str, dict[str, int]] = {}
    for tr in tech_rows:
        rd = tr["root_domain"]
        if rd not in tech_map:
            tech_map[rd] = {}
        for t in tr["tech_stack"].split(","):
            t = t.strip()
            if t:
                tech_map[rd][t] = tech_map[rd].get(t, 0) + 1

    # ── Last scan per domain in ONE query ────────────────────────────────────
    last_scan_rows = await fetch_all(f"""
        SELECT target, MAX(finished_at) AS last_scan
        FROM scan_log
        WHERE target IN ({placeholders}) AND finished_at IS NOT NULL
        GROUP BY target
    """, domain_list)
    last_scan_map = {r["target"]: r["last_scan"] for r in last_scan_rows}

    # ── Active scans in ONE query ─────────────────────────────────────────────
    active_rows = await fetch_all(f"""
        SELECT DISTINCT target FROM scan_log
        WHERE target IN ({placeholders}) AND finished_at IS NULL
    """, domain_list)
    active_set = {r["target"] for r in active_rows}

    # ── Scan progress keys ────────────────────────────────────────────────────
    progress_keys = [f"scan_progress_{d}" for d in domain_list]
    prog_ph = ",".join("?" * len(progress_keys))
    progress_rows = await fetch_all(
        f"SELECT key, value FROM app_settings WHERE key IN ({prog_ph})",
        progress_keys,
    )
    progress_map = {}
    for pr in progress_rows:
        domain_key = pr["key"].replace("scan_progress_", "", 1)
        try:
            progress_map[domain_key] = _json.loads(pr["value"])
        except Exception:
            pass

    # ── Sparkline — last 30 days per domain, ONE query ───────────────────────
    sparkline_rows = await fetch_all(f"""
        SELECT root_domain, strftime('%Y-%m-%d', first_seen) AS day, COUNT(*) AS cnt
        FROM subdomains
        WHERE root_domain IN ({placeholders})
          AND first_seen >= datetime('now', '-30 days')
        GROUP BY root_domain, day
        ORDER BY root_domain, day
    """, domain_list)
    sparkline_map: dict[str, list[int]] = {}
    for sr in sparkline_rows:
        sparkline_map.setdefault(sr["root_domain"], []).append(sr["cnt"])

    # ── Build result ──────────────────────────────────────────────────────────
    result = []
    for d in domains:
        domain = d["domain"]
        c = counts_map.get(domain)
        progress = progress_map.get(domain)

        if domain in active_set:
            if progress and progress.get("phase") not in ("done", None):
                scan_status, scan_phase = "scanning", progress.get("phase", "running")
            else:
                scan_status, scan_phase = "queued", "queued"
        elif last_scan_map.get(domain):
            scan_status, scan_phase = "done", "done"
        else:
            scan_status, scan_phase = "pending", "pending"

        top_tech = [
            name for name, _ in sorted(
                tech_map.get(domain, {}).items(), key=lambda x: x[1], reverse=True
            )[:5]
        ]

        result.append({
            "domain":        domain,
            "total":         c["total"]      if c else 0,
            "new":           c["new_count"]  if c else 0,
            "with_ports":    c["with_ports"] if c else 0,
            "with_tech":     c["with_tech"]  if c else 0,
            "last_scan":     last_scan_map.get(domain),
            "top_tech":      top_tech,
            "sparkline_data": sparkline_map.get(domain, []),
            "scan_status":   scan_status,
            "scan_phase":    scan_phase,
            "scan_progress": progress,
            "auto_sweep":    bool(d.get("auto_sweep", 0)),
            "deep_scan":     bool(d.get("deep_scan", 0)),
        })

    return APIResponse(data={
        "items": result,
        "total": total_domains,
        "page": page,
        "per_page": per_page,
        "pages": (total_domains + per_page - 1) // per_page,
    })


@router.post("")
async def add_domain(
    body: AddDomainRequest,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Add a domain to monitoring."""
    domain = body.domain.lower().strip()

    if "." not in domain or len(domain) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid domain")

    async with get_db() as db:
        existing = await db.execute(
            "SELECT id FROM monitored_domains WHERE domain = ?", (domain,)
        )
        if await existing.fetchone():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Domain already monitored")

        await db.execute(
            "INSERT INTO monitored_domains (domain) VALUES (?)", (domain,)
        )
        await db.commit()

    return APIResponse(data={"domain": domain, "status": "added"})


@router.post("/bulk")
async def bulk_add_domains(
    body: BulkAddDomainsRequest,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Add multiple domains to monitoring at once."""
    added = []
    skipped = []

    async with get_db() as db:
        for raw in body.domains:
            domain = raw.lower().strip()
            if not domain or "." not in domain or len(domain) < 3:
                skipped.append(raw)
                continue
            existing = await db.execute(
                "SELECT id FROM monitored_domains WHERE domain = ?", (domain,)
            )
            if await existing.fetchone():
                skipped.append(domain)
                continue
            await db.execute(
                "INSERT INTO monitored_domains (domain) VALUES (?)", (domain,)
            )
            if body.scan_now:
                await db.execute(
                    "INSERT INTO scan_log (scan_type, target, started_at) VALUES ('auto_sweep', ?, datetime('now'))",
                    (domain,)
                )
            added.append(domain)
        await db.commit()

    return APIResponse(data={"added": added, "skipped": skipped})


@router.patch("/{domain}")
async def patch_domain(
    domain: str,
    body: PatchDomainRequest,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Toggle auto_sweep or deep_scan for a domain."""
    updates = []
    params: list = []
    if body.auto_sweep is not None:
        updates.append("auto_sweep = ?")
        params.append(1 if body.auto_sweep else 0)
    if body.deep_scan is not None:
        updates.append("deep_scan = ?")
        params.append(1 if body.deep_scan else 0)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")
    params.append(domain)
    async with get_db() as db:
        await db.execute(
            f"UPDATE monitored_domains SET {', '.join(updates)} WHERE domain = ?", params
        )
        await db.commit()
    return APIResponse(data={"domain": domain, "updated": True})


@router.delete("/{domain}")
async def remove_domain(
    domain: str,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Remove a domain from monitoring."""
    async with get_db() as db:
        cursor = await db.execute(
            "DELETE FROM monitored_domains WHERE domain = ?", (domain,)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    return APIResponse(data={"deleted": domain})


@router.post("/{domain}/sweep")
async def trigger_sweep(
    domain: str,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Trigger a sweep scan for a domain."""
    async with get_db() as db:
        cursor = await db.execute("""
            INSERT INTO scan_log (scan_type, target, started_at)
            VALUES ('manual_sweep', ?, datetime('now'))
        """, (domain,))
        await db.commit()
        scan_id = cursor.lastrowid

    return APIResponse(data={"status": "started", "scan_id": scan_id})
