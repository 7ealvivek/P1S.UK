"""P1 Warriors — Scans API routes."""

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.database import fetch_all, fetch_val
from app.models import APIResponse

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.get("")
async def list_scans(
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """List scan history with duration calculation."""
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


@router.get("/metrics")
async def scan_metrics(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get scan performance metrics."""
    # Average duration
    avg_duration = await fetch_val("""
        SELECT AVG((julianday(finished_at) - julianday(started_at)) * 86400)
        FROM scan_log
        WHERE finished_at IS NOT NULL
    """) or 0

    # Average new findings per scan
    avg_new = await fetch_val("""
        SELECT AVG(new_count) FROM scan_log WHERE new_count > 0
    """) or 0

    # Total scans
    total_scans = await fetch_val("SELECT COUNT(*) FROM scan_log") or 0

    # Rate trend — daily scan counts for last 30 days
    rate_trend = await fetch_all("""
        SELECT strftime('%Y-%m-%d', started_at) as date,
               COUNT(*) as scans,
               SUM(new_count) as new_found
        FROM scan_log
        WHERE started_at >= datetime('now', '-30 days')
        GROUP BY date
        ORDER BY date
    """)

    return APIResponse(data={
        "avg_duration": round(avg_duration, 1),
        "avg_new": round(avg_new, 1),
        "total_scans": total_scans,
        "rate_trend": rate_trend,
    })
