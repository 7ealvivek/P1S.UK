"""P1 Warriors — Subdomains API routes."""

import csv
import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from typing import Optional

from app.auth import get_current_user
from app.database import fetch_all, fetch_one, fetch_val, get_db
from app.models import APIResponse, BulkActionRequest

router = APIRouter(prefix="/api/subdomains", tags=["subdomains"])


def _build_where(
    search: Optional[str] = None,
    domain: Optional[str] = None,
    status_code: Optional[str] = None,
    source: Optional[str] = None,
    has_ports: Optional[bool] = None,
    has_tech: Optional[bool] = None,
    has_screenshot: Optional[bool] = None,
    is_new: Optional[bool] = None,
    tech: Optional[str] = None,
    port: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    live_only: bool = True,
) -> tuple[str, list]:
    """Build WHERE clause from filter parameters."""
    conditions: list[str] = []
    params: list = []

    if live_only:
        conditions.append("1=1")

    if search:
        conditions.append("(subdomain LIKE ? OR title LIKE ? OR ip LIKE ? OR tech_stack LIKE ?)")
        s = f"%{search}%"
        params.extend([s, s, s, s])

    if domain:
        domains = [d.strip() for d in domain.split(",") if d.strip()]
        placeholders = ",".join("?" * len(domains))
        conditions.append(f"root_domain IN ({placeholders})")
        params.extend(domains)

    if status_code:
        codes = []
        for code_range in status_code.split(","):
            code_range = code_range.strip()
            if code_range == "2xx":
                codes.append("(status_code >= 200 AND status_code < 300)")
            elif code_range == "3xx":
                codes.append("(status_code >= 300 AND status_code < 400)")
            elif code_range == "4xx":
                codes.append("(status_code >= 400 AND status_code < 500)")
            elif code_range == "5xx":
                codes.append("(status_code >= 500 AND status_code < 600)")
            elif code_range == "none":
                codes.append("status_code IS NULL")
        if codes:
            conditions.append(f"({' OR '.join(codes)})")

    if source:
        sources = [s.strip() for s in source.split(",") if s.strip()]
        placeholders = ",".join("?" * len(sources))
        conditions.append(f"source IN ({placeholders})")
        params.extend(sources)

    if has_ports is True:
        conditions.append("ports IS NOT NULL AND ports != ''")
    elif has_ports is False:
        conditions.append("(ports IS NULL OR ports = '')")

    if has_tech is True:
        conditions.append("tech_stack IS NOT NULL AND tech_stack != ''")
    elif has_tech is False:
        conditions.append("(tech_stack IS NULL OR tech_stack = '')")

    if has_screenshot is True:
        conditions.append("screenshot_path IS NOT NULL AND screenshot_path != ''")
    elif has_screenshot is False:
        conditions.append("(screenshot_path IS NULL OR screenshot_path = '')")

    if is_new is True:
        conditions.append("is_new = 1")
    elif is_new is False:
        conditions.append("is_new = 0")

    if tech:
        tech_terms = [t.strip() for t in tech.split(",") if t.strip()]
        for t in tech_terms:
            conditions.append("tech_stack LIKE ?")
            params.append(f"%{t}%")

    if port:
        port_terms = [p.strip() for p in port.split(",") if p.strip()]
        port_conditions = []
        for p in port_terms:
            port_conditions.append("(ports LIKE ? OR ports LIKE ? OR ports LIKE ? OR ports = ?)")
            params.extend([f"{p},%", f"%,{p},%", f"%,{p}", p])
        if port_conditions:
            conditions.append(f"({' OR '.join(port_conditions)})")

    if date_from:
        conditions.append("first_seen >= ?")
        params.append(date_from)

    if date_to:
        conditions.append("first_seen <= ?")
        params.append(date_to)

    where = " AND ".join(conditions) if conditions else "1=1"
    return where, params


@router.get("")
async def list_subdomains(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=250),
    sort: str = Query("first_seen"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    search: Optional[str] = None,
    domain: Optional[str] = None,
    status_code: Optional[str] = None,
    source: Optional[str] = None,
    has_ports: Optional[bool] = None,
    has_tech: Optional[bool] = None,
    has_screenshot: Optional[bool] = None,
    is_new: Optional[bool] = None,
    tech: Optional[str] = None,
    port: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    live_only: bool = Query(True, description="Only show live subdomains (with status code)"),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """List subdomains with pagination, sorting, and filtering."""
    # Whitelist sortable columns
    allowed_sorts = {
        "id", "subdomain", "root_domain", "source", "first_seen", "last_seen",
        "ip", "status_code", "title", "web_server", "cdn", "asn", "content_length",
    }
    if sort not in allowed_sorts:
        sort = "first_seen"

    where, params = _build_where(
        search=search, domain=domain, status_code=status_code, source=source,
        has_ports=has_ports, has_tech=has_tech, has_screenshot=has_screenshot,
        is_new=is_new, tech=tech, port=port, date_from=date_from, date_to=date_to,
        live_only=live_only,
    )

    total = await fetch_val(f"SELECT COUNT(*) FROM subdomains WHERE {where}", tuple(params))
    total = total or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page

    rows = await fetch_all(
        f"SELECT * FROM subdomains WHERE {where} ORDER BY {sort} {order} LIMIT ? OFFSET ?",
        tuple(params + [per_page, offset]),
    )

    return APIResponse(
        data=rows,
        meta={"total": total, "page": page, "pages": pages, "per_page": per_page},
    )


@router.get("/search")
async def search_subdomains(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Full-text search across subdomain, title, tech, IP."""
    s = f"%{q}%"
    rows = await fetch_all("""
        SELECT * FROM subdomains
        WHERE subdomain LIKE ? OR title LIKE ? OR tech_stack LIKE ? OR ip LIKE ?
        ORDER BY first_seen DESC
        LIMIT ?
    """, (s, s, s, s, limit))
    return APIResponse(data=rows)


@router.get("/export")
async def export_subdomains(
    format: str = Query("json", pattern="^(json|csv|txt)$"),
    search: Optional[str] = None,
    domain: Optional[str] = None,
    status_code: Optional[str] = None,
    source: Optional[str] = None,
    has_ports: Optional[bool] = None,
    has_tech: Optional[bool] = None,
    has_screenshot: Optional[bool] = None,
    is_new: Optional[bool] = None,
    tech: Optional[str] = None,
    port: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    live_only: bool = Query(True),
    user: dict = Depends(get_current_user),
):
    """Export filtered subdomains as JSON, CSV, or TXT."""
    where, params = _build_where(
        search=search, domain=domain, status_code=status_code, source=source,
        has_ports=has_ports, has_tech=has_tech, has_screenshot=has_screenshot,
        is_new=is_new, tech=tech, port=port, date_from=date_from, date_to=date_to,
        live_only=live_only,
    )

    rows = await fetch_all(f"SELECT * FROM subdomains WHERE {where} ORDER BY first_seen DESC", tuple(params))

    if format == "json":
        content = json.dumps(rows, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=subdomains.json"},
        )
    elif format == "csv":
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=subdomains.csv"},
        )
    else:  # txt
        lines = [row["subdomain"] for row in rows]
        content = "\n".join(lines)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=subdomains.txt"},
        )


@router.get("/{subdomain_id}")
async def get_subdomain(
    subdomain_id: int,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get a single subdomain by ID."""
    row = await fetch_one("SELECT * FROM subdomains WHERE id = ?", (subdomain_id,))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subdomain not found")
    return APIResponse(data=row)


@router.patch("/bulk")
async def bulk_action(
    body: BulkActionRequest,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Perform bulk actions on subdomains."""
    if not body.ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No IDs provided")

    placeholders = ",".join("?" * len(body.ids))

    async with get_db() as db:
        if body.action == "reviewed":
            await db.execute(
                f"UPDATE subdomains SET is_new = 0 WHERE id IN ({placeholders})",
                tuple(body.ids),
            )
        elif body.action == "delete":
            await db.execute(
                f"DELETE FROM subdomains WHERE id IN ({placeholders})",
                tuple(body.ids),
            )
        await db.commit()

    return APIResponse(data={"updated": len(body.ids)})


@router.post("/import")
async def import_subdomains(
    user: dict = Depends(get_current_user),
    file: Optional[UploadFile] = File(None),
    data: Optional[str] = Form(None),
    source: str = Form("import"),
    domain: Optional[str] = Form(None),
) -> APIResponse:
    """Bulk import subdomains from file or JSON data.
    
    Accepts:
    - TXT file: one subdomain per line
    - JSON file/data: array of objects with at least 'subdomain' field
      Optional fields: ip, status_code, title, tech_stack, web_server, cdn, ports,
                       content_length, redirect_url, cname, source
    - httpx JSON output: array of httpx JSON lines
    
    Usage:
      curl -X POST /api/subdomains/import -H "Authorization: Bearer TOKEN" \
           -F "file=@subs.txt" -F "source=subfinder" -F "domain=example.com"
      
      # Or pipe httpx JSON:
      cat httpx-output.json | curl -X POST /api/subdomains/import \
           -H "Authorization: Bearer TOKEN" -F "data=@-" -F "source=httpx"
    """
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    
    # Parse input
    entries = []
    
    if file:
        content = (await file.read()).decode("utf-8", errors="ignore")
    elif data:
        content = data
    else:
        raise HTTPException(status_code=400, detail="Provide 'file' or 'data'")
    
    # Try JSON first
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, str):
                    entries.append({"subdomain": item.strip().lower()})
                elif isinstance(item, dict):
                    # Support both our format and httpx JSON output
                    sub = item.get("subdomain") or item.get("input", "").lower().strip()
                    if not sub:
                        url = item.get("url", "")
                        sub = url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0].lower()
                    if sub:
                        tech = item.get("tech_stack") or item.get("tech", [])
                        if isinstance(tech, list):
                            tech = ", ".join(tech) if tech else None
                        
                        cdn = item.get("cdn") or item.get("cdn_name", [])
                        if isinstance(cdn, list):
                            cdn = ", ".join(cdn) if cdn else None
                        
                        cnames = item.get("cname") or item.get("cnames", [])
                        if isinstance(cnames, list):
                            cnames = ", ".join(cnames) if cnames else None
                        
                        entries.append({
                            "subdomain": sub,
                            "ip": item.get("ip") or item.get("host"),
                            "status_code": item.get("status_code"),
                            "title": item.get("title"),
                            "tech_stack": tech,
                            "web_server": item.get("web_server") or item.get("webserver"),
                            "cdn": cdn,
                            "ports": item.get("ports") or (str(item["port"]) if item.get("port") else None),
                            "content_length": item.get("content_length"),
                            "redirect_url": item.get("redirect_url") or item.get("location") or item.get("final_url"),
                            "cname": cnames,
                            "source": item.get("source", source),
                        })
    except (json.JSONDecodeError, ValueError):
        # Try JSONL (one JSON object per line — httpx output format)
        jsonl_parsed = False
        for line in content.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                sub = item.get("input", "").lower().strip()
                if not sub:
                    continue
                tech = item.get("tech", [])
                cdn = item.get("cdn_name") or item.get("cdn", [])
                cnames = item.get("cnames") or item.get("cname", [])
                entries.append({
                    "subdomain": sub,
                    "ip": item.get("host"),
                    "status_code": item.get("status_code"),
                    "title": item.get("title"),
                    "tech_stack": ", ".join(tech) if isinstance(tech, list) and tech else None,
                    "web_server": item.get("webserver"),
                    "cdn": ", ".join(cdn) if isinstance(cdn, list) and cdn else (cdn or None),
                    "ports": str(item["port"]) if item.get("port") else None,
                    "content_length": item.get("content_length"),
                    "redirect_url": item.get("final_url") or item.get("location"),
                    "cname": ", ".join(cnames) if isinstance(cnames, list) and cnames else (cnames or None),
                    "source": source,
                })
                jsonl_parsed = True
            except json.JSONDecodeError:
                # Plain text line = subdomain
                if "." in line and not line.startswith("#"):
                    entries.append({"subdomain": line.lower()})
        
        if not jsonl_parsed and not entries:
            # Pure TXT format
            for line in content.strip().split("\n"):
                line = line.strip().lower()
                if line and "." in line and not line.startswith("#"):
                    entries.append({"subdomain": line})
    
    if not entries:
        raise HTTPException(status_code=400, detail="No valid subdomains found in input")
    
    # Insert/update
    imported = 0
    updated = 0
    async with get_db() as db:
        for entry in entries:
            sub = entry["subdomain"]
            # Determine root domain
            root = domain
            if not root:
                parts = sub.split(".")
                root = ".".join(parts[-2:]) if len(parts) >= 2 else sub
            
            # Check if exists
            existing = await db.execute("SELECT id FROM subdomains WHERE subdomain = ?", (sub,))
            row = await existing.fetchone()
            
            if row:
                # Update with new data
                updates = ["last_seen = ?"]
                params = [now_str]
                for field in ["ip", "status_code", "title", "tech_stack", "web_server", 
                              "cdn", "ports", "content_length", "redirect_url", "cname"]:
                    val = entry.get(field)
                    if val is not None:
                        updates.append(f"{field} = ?")
                        params.append(val)
                params.append(sub)
                await db.execute(f"UPDATE subdomains SET {', '.join(updates)} WHERE subdomain = ?", params)
                updated += 1
            else:
                await db.execute("""
                    INSERT INTO subdomains
                    (subdomain, root_domain, source, first_seen, last_seen, is_new,
                     ip, status_code, title, tech_stack, web_server, cdn, ports,
                     content_length, redirect_url, cname)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sub, root, entry.get("source", source), now_str, now_str,
                    entry.get("ip"), entry.get("status_code"), entry.get("title"),
                    entry.get("tech_stack"), entry.get("web_server"), entry.get("cdn"),
                    entry.get("ports"), entry.get("content_length"),
                    entry.get("redirect_url"), entry.get("cname"),
                ))
                imported += 1
        
        await db.commit()
    
    return APIResponse(data={
        "imported": imported,
        "updated": updated,
        "total": imported + updated,
    })
