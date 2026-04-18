"""P1 Warriors — Programs API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional

from app.auth import get_current_user
from app.database import fetch_all, fetch_val, get_db
from app.models import APIResponse

router = APIRouter(prefix="/api/programs", tags=["programs"])


class PatchProgramRequest(BaseModel):
    auto_sweep: Optional[bool] = None
    deep_scan: Optional[bool] = None


@router.get("")
async def list_programs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    platform: str = Query("", alias="platform"),
    search: str = Query("", alias="search"),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """List all programs with domain/subdomain counts."""

    where_parts = []
    where_params: list = []

    if platform:
        where_parts.append("p.platform = ?")
        where_params.append(platform)
    if search:
        where_parts.append("p.name LIKE ?")
        where_params.append(f"%{search}%")

    where_clause = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    offset = (page - 1) * per_page

    total = await fetch_val(
        f"SELECT COUNT(*) FROM programs p {where_clause}", where_params
    ) or 0

    rows = await fetch_all(f"""
        SELECT
            p.id, p.name, p.handle, p.platform, p.url,
            p.min_bounty, p.max_bounty, p.bounty_currency,
            p.program_type, p.status, p.added_at,
            COUNT(md.domain) AS domain_count,
            -- auto_sweep ON count
            SUM(CASE WHEN md.auto_sweep = 1 THEN 1 ELSE 0 END) AS auto_sweep_count,
            -- deep_scan ON count
            SUM(CASE WHEN md.deep_scan = 1 THEN 1 ELSE 0 END) AS deep_scan_count
        FROM programs p
        LEFT JOIN monitored_domains md ON md.program_id = p.id
        {where_clause}
        GROUP BY p.id
        ORDER BY domain_count DESC, p.name
        LIMIT ? OFFSET ?
    """, where_params + [per_page, offset])

    if not rows:
        return APIResponse(data={
            "items": [], "total": total, "page": page,
            "per_page": per_page, "pages": 0,
        })

    prog_ids = [r["id"] for r in rows]
    placeholders = ",".join("?" * len(prog_ids))

    # Subdomain counts per program in one query
    sub_counts = await fetch_all(f"""
        SELECT md.program_id, COUNT(s.id) AS sub_count,
               SUM(CASE WHEN s.status_code BETWEEN 200 AND 499 THEN 1 ELSE 0 END) AS live_count
        FROM monitored_domains md
        LEFT JOIN subdomains s ON s.root_domain = md.domain
        WHERE md.program_id IN ({placeholders})
        GROUP BY md.program_id
    """, prog_ids)
    sub_map = {r["program_id"]: r for r in sub_counts}

    # Nuclei findings per program
    finding_counts = await fetch_all(f"""
        SELECT md.program_id,
               COUNT(nf.id) AS finding_count,
               SUM(CASE WHEN nf.severity IN ('critical','high') THEN 1 ELSE 0 END) AS critical_high
        FROM monitored_domains md
        LEFT JOIN nuclei_findings nf ON nf.root_domain = md.domain
        WHERE md.program_id IN ({placeholders})
        GROUP BY md.program_id
    """, prog_ids)
    finding_map = {r["program_id"]: r for r in finding_counts}

    result = []
    for r in rows:
        pid = r["id"]
        sc = sub_map.get(pid)
        fc = finding_map.get(pid)
        dc = r["domain_count"] or 0

        # Determine aggregate sweep state
        auto_sweep_all  = dc > 0 and (r["auto_sweep_count"] or 0) == dc
        deep_scan_all   = dc > 0 and (r["deep_scan_count"]  or 0) == dc
        auto_sweep_some = not auto_sweep_all and (r["auto_sweep_count"] or 0) > 0
        deep_scan_some  = not deep_scan_all  and (r["deep_scan_count"]  or 0) > 0

        result.append({
            "id":             pid,
            "name":           r["name"],
            "handle":         r["handle"],
            "platform":       r["platform"],
            "url":            r["url"],
            "min_bounty":     r["min_bounty"],
            "max_bounty":     r["max_bounty"],
            "currency":       r["bounty_currency"],
            "type":           r["program_type"],
            "status":         r["status"],
            "added_at":       r["added_at"],
            "domain_count":   dc,
            "sub_count":      sc["sub_count"]    if sc else 0,
            "live_count":     sc["live_count"]   if sc else 0,
            "finding_count":  fc["finding_count"] if fc else 0,
            "critical_high":  fc["critical_high"] if fc else 0,
            "auto_sweep":     auto_sweep_all,
            "auto_sweep_partial": auto_sweep_some,
            "deep_scan":      deep_scan_all,
            "deep_scan_partial": deep_scan_some,
        })

    return APIResponse(data={
        "items": result,
        "total": total,
        "page":  page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@router.get("/{program_id}/domains")
async def get_program_domains(
    program_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get all domains for a program with subdomain counts."""

    prog = await fetch_all(
        "SELECT * FROM programs WHERE id = ?", (program_id,)
    )
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")

    offset = (page - 1) * per_page
    total = await fetch_val(
        "SELECT COUNT(*) FROM monitored_domains WHERE program_id = ?",
        (program_id,)
    ) or 0

    domains = await fetch_all("""
        SELECT md.domain, md.auto_sweep, md.deep_scan,
               COUNT(s.id) AS sub_count,
               SUM(CASE WHEN s.status_code BETWEEN 200 AND 499 THEN 1 ELSE 0 END) AS live_count
        FROM monitored_domains md
        LEFT JOIN subdomains s ON s.root_domain = md.domain
        WHERE md.program_id = ?
        GROUP BY md.domain
        ORDER BY sub_count DESC, md.domain
        LIMIT ? OFFSET ?
    """, (program_id, per_page, offset))

    return APIResponse(data={
        "program": dict(prog[0]),
        "items": [dict(d) for d in domains],
        "total": total,
        "page":  page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    })


@router.patch("/{program_id}")
async def patch_program(
    program_id: int,
    body: PatchProgramRequest,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Toggle auto_sweep or deep_scan for ALL domains in a program."""

    updates = []
    params: list = []
    if body.auto_sweep is not None:
        updates.append("auto_sweep = ?")
        params.append(1 if body.auto_sweep else 0)
    if body.deep_scan is not None:
        updates.append("deep_scan = ?")
        params.append(1 if body.deep_scan else 0)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    params.append(program_id)
    async with get_db() as db:
        cur = await db.execute(
            f"UPDATE monitored_domains SET {', '.join(updates)} WHERE program_id = ?",
            params
        )
        await db.commit()
        affected = cur.rowcount

    return APIResponse(data={
        "program_id": program_id,
        "updated":    True,
        "domains_affected": affected,
    })


@router.get("/stats/platforms")
async def platform_stats(
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Summary stats per platform."""
    rows = await fetch_all("""
        SELECT
            p.platform,
            COUNT(DISTINCT p.id) AS program_count,
            COUNT(DISTINCT md.domain) AS domain_count,
            COUNT(DISTINCT s.subdomain) AS sub_count
        FROM programs p
        LEFT JOIN monitored_domains md ON md.program_id = p.id
        LEFT JOIN subdomains s ON s.root_domain = md.domain
        GROUP BY p.platform
        ORDER BY program_count DESC
    """)

    # Unmatched domains (no program)
    unmatched = await fetch_val(
        "SELECT COUNT(*) FROM monitored_domains WHERE program_id IS NULL"
    ) or 0

    return APIResponse(data={
        "platforms": [dict(r) for r in rows],
        "unmatched_domains": unmatched,
    })
