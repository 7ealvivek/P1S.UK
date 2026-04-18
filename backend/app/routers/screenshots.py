"""P1 Warriors — Screenshots API routes."""

from pathlib import Path
from fastapi import APIRouter, Depends, Query, HTTPException, status
from fastapi.responses import FileResponse
from typing import Optional

from app.auth import get_current_user
from app.config import settings
from app.database import fetch_all, fetch_val, fetch_one
from app.models import APIResponse

router = APIRouter(prefix="/api/screenshots", tags=["screenshots"])


@router.get("")
async def list_screenshots(
    page: int = Query(1, ge=1),
    per_page: int = Query(40, ge=1, le=100),
    domain: Optional[str] = None,
    status_code: Optional[str] = None,
    tech: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = Query("first_seen", pattern="^(first_seen|status_code|subdomain)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """List subdomains that have screenshots."""
    conditions = ["screenshot_path IS NOT NULL AND screenshot_path != ''"]
    params: list = []

    if domain:
        conditions.append("root_domain = ?")
        params.append(domain)

    if status_code:
        codes = []
        for cr in status_code.split(","):
            cr = cr.strip()
            if cr == "2xx":
                codes.append("(status_code >= 200 AND status_code < 300)")
            elif cr == "3xx":
                codes.append("(status_code >= 300 AND status_code < 400)")
            elif cr == "4xx":
                codes.append("(status_code >= 400 AND status_code < 500)")
            elif cr == "5xx":
                codes.append("(status_code >= 500 AND status_code < 600)")
        if codes:
            conditions.append(f"({' OR '.join(codes)})")

    if tech:
        conditions.append("tech_stack LIKE ?")
        params.append(f"%{tech}%")

    if search:
        conditions.append("(subdomain LIKE ? OR title LIKE ? OR root_domain LIKE ? OR web_server LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

    where = " AND ".join(conditions)

    total = await fetch_val(f"SELECT COUNT(*) FROM subdomains WHERE {where}", tuple(params)) or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page

    rows = await fetch_all(
        f"""SELECT id, subdomain, root_domain, status_code, title, tech_stack,
                   screenshot_path, first_seen, web_server
            FROM subdomains WHERE {where}
            ORDER BY {sort} {order} LIMIT ? OFFSET ?""",
        tuple(params + [per_page, offset]),
    )

    return APIResponse(
        data=rows,
        meta={"total": total, "page": page, "pages": pages},
    )


@router.get("/{screenshot_id}/image")
async def get_screenshot_image(
    screenshot_id: int,
):
    """Serve a screenshot image file."""
    row = await fetch_one(
        "SELECT screenshot_path FROM subdomains WHERE id = ?", (screenshot_id,)
    )
    if not row or not row.get("screenshot_path"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot not found")

    screenshot_path = row["screenshot_path"]

    # Normalize host paths to container paths
    # Scanner runs on host and saves to /root/p1warriors-deploy/data/screenshots/
    # Backend runs in Docker where that volume is mounted at /data/
    HOST_DATA_PREFIX = "/root/p1warriors-deploy/data/"
    CONTAINER_DATA_PREFIX = "/data/"
    if screenshot_path.startswith(HOST_DATA_PREFIX):
        screenshot_path = CONTAINER_DATA_PREFIX + screenshot_path[len(HOST_DATA_PREFIX):]

    # Handle both absolute and relative paths
    if not Path(screenshot_path).is_absolute():
        screenshot_path = str(settings.screenshot_path / screenshot_path)

    path = Path(screenshot_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot file not found")

    # Determine media type
    suffix = path.suffix.lower()
    media_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
    media_type = media_types.get(suffix, "image/png")

    return FileResponse(path, media_type=media_type)
