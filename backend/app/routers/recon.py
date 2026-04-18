"""P1 Warriors — Recon: Admin Panels, GraphQL, Favicons, S3, GitHub."""
from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from typing import Optional, List
from pydantic import BaseModel
from app.auth import get_current_user
from app.database import fetch_all, fetch_val, get_db
from app.models import APIResponse
import json, subprocess, os, tempfile
from datetime import datetime, timezone

router = APIRouter(prefix="/api/recon", tags=["recon"])

def now(): return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

# Titles that are 100% FPs — SSO redirects, WAF challenges, catch-all pages
_FP_TITLES = (
    "sign in to your account", "robot or human?", "loading",
    "just a moment...", "302 found", "redirecting...", "redirect",
    "please wait...", "access denied", "403 forbidden", "404 not found",
    "attention required!", "cloudflare", "please enable javascript",
    "you need to enable javascript", "sso login", "please turn javascript on",
)

_FP_TITLE_SQL = " AND ".join(
    f"LOWER(COALESCE(title,'')) NOT LIKE '%{t}%'" for t in _FP_TITLES
)

@router.get("/admin-panels")
async def list_admin_panels(
    domain: Optional[str]=None, panel_type: Optional[str]=None,
    search: Optional[str]=None,
    page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1", "status_code IN (200,401)", _FP_TITLE_SQL]
    params=[]
    if domain: conds.append("root_domain=?"); params.append(domain)
    if panel_type: conds.append("panel_type=?"); params.append(panel_type)
    if search: conds.append("(url LIKE ? OR root_domain LIKE ? OR title LIKE ?)"); params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM admin_panels WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(
        f"""SELECT * FROM admin_panels WHERE {where}
        ORDER BY
            CASE panel_type
                WHEN 'env-exposure'    THEN 1
                WHEN 'git-exposure'    THEN 2
                WHEN 'backup-exposure' THEN 3
                WHEN 'spring-actuator' THEN 4
                WHEN 'k8s-api'         THEN 5
                WHEN 'elasticsearch'   THEN 6
                WHEN 'jenkins'         THEN 7
                WHEN 'grafana'         THEN 8
                WHEN 'portainer'       THEN 9
                ELSE 10
            END,
            first_seen DESC
        LIMIT ? OFFSET ?""",
        tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.get("/graphql")
async def list_graphql(
    domain: Optional[str]=None, introspection: Optional[bool]=None,
    page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1"]; params=[]
    if domain: conds.append("root_domain=?"); params.append(domain)
    if introspection is not None: conds.append("introspection_enabled=?"); params.append(1 if introspection else 0)
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM graphql_endpoints WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(f"SELECT id,subdomain,root_domain,url,introspection_enabled,query_count,first_seen,last_seen FROM graphql_endpoints WHERE {where} ORDER BY introspection_enabled DESC, first_seen DESC LIMIT ? OFFSET ?",
        tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.get("/favicon")
async def list_favicons(
    domain: Optional[str]=None, page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1"]; params=[]
    if domain: conds.append("root_domain=?"); params.append(domain)
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM favicon_hashes WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(f"SELECT id,subdomain,root_domain,favicon_url,mmh3_hash,shodan_count,shodan_results,first_seen FROM favicon_hashes WHERE {where} ORDER BY shodan_count DESC LIMIT ? OFFSET ?",
        tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.get("/s3")
async def list_s3(
    domain: Optional[str]=None, page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1"]; params=[]
    if domain: conds.append("root_domain=?"); params.append(domain)
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM s3_findings WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(f"SELECT * FROM s3_findings WHERE {where} ORDER BY is_public DESC, is_listable DESC, first_seen DESC LIMIT ? OFFSET ?",
        tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.get("/github-secrets")
async def list_github_secrets(
    domain: Optional[str]=None,
    verified_only: bool=Query(True, description="Only show verified secrets"),
    page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1"]; params=[]
    if domain: conds.append("root_domain=?"); params.append(domain)
    if verified_only: conds.append("verified=1")
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM github_secrets WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(f"SELECT * FROM github_secrets WHERE {where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?",
        tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.get("/stats")
async def recon_stats(user: dict=Depends(get_current_user)) -> APIResponse:
    # Exclude FP titles from admin panel counts
    admin_total=await fetch_val(f"SELECT COUNT(*) FROM admin_panels WHERE status_code IN (200,401) AND {_FP_TITLE_SQL}") or 0
    git_exposed=await fetch_val(f"SELECT COUNT(*) FROM admin_panels WHERE panel_type='git-exposure' AND {_FP_TITLE_SQL}") or 0
    env_exposed=await fetch_val(f"SELECT COUNT(*) FROM admin_panels WHERE panel_type='env-exposure' AND {_FP_TITLE_SQL}") or 0
    graphql_total=await fetch_val("SELECT COUNT(*) FROM graphql_endpoints") or 0
    graphql_intro=await fetch_val("SELECT COUNT(*) FROM graphql_endpoints WHERE introspection_enabled=1") or 0
    s3_total=await fetch_val("SELECT COUNT(*) FROM s3_findings") or 0
    s3_public=await fetch_val("SELECT COUNT(*) FROM s3_findings WHERE is_public=1") or 0
    github_verified=await fetch_val("SELECT COUNT(*) FROM github_secrets WHERE verified=1") or 0
    by_panel_type=await fetch_all(
        f"SELECT panel_type,COUNT(*) as count FROM admin_panels WHERE {_FP_TITLE_SQL} GROUP BY panel_type ORDER BY count DESC LIMIT 15"
    )
    return APIResponse(data={
        "admin_panels":admin_total,"git_exposed":git_exposed,"env_exposed":env_exposed,
        "graphql_total":graphql_total,"graphql_introspection":graphql_intro,
        "s3_total":s3_total,"s3_public":s3_public,
        "github_secrets":github_verified,
        "by_panel_type":by_panel_type,
    })

class S3ScanRequest(BaseModel):
    domains: Optional[List[str]] = None

@router.post("/s3/scan")
async def trigger_s3_scan(body: S3ScanRequest, background_tasks: BackgroundTasks, user: dict=Depends(get_current_user)) -> APIResponse:
    async with get_db() as db:
        if body.domains:
            domains = body.domains
        else:
            rows = await db.execute("SELECT domain FROM monitored_domains WHERE is_active=1")
            rows = await rows.fetchall()
            domains = [r[0] for r in rows]
    background_tasks.add_task(_run_s3_scan, domains)
    return APIResponse(data={"status":"S3 scan started","domains":len(domains)})

async def _run_s3_scan(domains):
    import requests as _req, asyncio
    db_path = "/data/p1warriors.db"
    import sqlite3 as _sq
    db = _sq.connect(db_path, timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    ts = now()
    for domain in domains:
        base = domain.replace("www.","").split(".")[0]
        permutations = [
            base, f"{base}-dev", f"{base}-prod", f"{base}-staging", f"{base}-backup",
            f"{base}-assets", f"{base}-logs", f"{base}-data", f"{base}-uploads",
            f"{base}-static", f"{base}-media", f"{base}-files", f"dev-{base}",
            f"prod-{base}", f"staging-{base}", f"{base}-s3", f"{base}-bucket",
            f"{base}-public", f"{base}-private", f"{base}-content", f"{base}-images",
        ]
        for bucket in permutations:
            try:
                url = f"https://{bucket}.s3.amazonaws.com"
                r = _req.head(url, timeout=5, allow_redirects=True)
                if r.status_code == 404:
                    continue
                is_public = 1 if r.status_code == 200 else 0
                is_listable = 0
                status = "public" if r.status_code == 200 else ("auth_required" if r.status_code == 403 else "unknown")
                interesting = None
                if is_public:
                    try:
                        gr = _req.get(url, timeout=5)
                        import xml.etree.ElementTree as ET
                        tree = ET.fromstring(gr.text)
                        ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
                        keys = [k.text for k in tree.findall(".//s3:Key", ns)][:10]
                        if keys:
                            is_listable = 1
                            interesting = str(keys)
                    except Exception:
                        pass
                db.execute("""INSERT INTO s3_findings
                    (bucket_name,root_domain,is_public,is_listable,status,interesting_files,first_seen,last_seen)
                    VALUES (?,?,?,?,?,?,?,?)
                    ON CONFLICT(bucket_name) DO UPDATE SET last_seen=?,status=?,is_public=?,is_listable=?""",
                    (bucket, domain, is_public, is_listable, status, interesting, ts, ts, ts, status, is_public, is_listable))
                db.commit()
            except Exception:
                pass
    db.close()

class GithubScanRequest(BaseModel):
    domains: Optional[List[str]] = None
    tokens: Optional[List[str]] = None  # GitHub PATs for scanning

@router.post("/github/scan")
async def trigger_github_scan(body: GithubScanRequest, background_tasks: BackgroundTasks, user: dict=Depends(get_current_user)) -> APIResponse:
    async with get_db() as db:
        token_row = await db.execute("SELECT value FROM app_settings WHERE key='github_token'")
        token_row = await token_row.fetchone()
        github_token = token_row[0] if token_row else None
        # Use provided tokens or fall back to settings
        tokens = body.tokens or ([github_token] if github_token else [])
        if body.domains:
            domains = body.domains
        else:
            rows = await db.execute("SELECT domain FROM monitored_domains WHERE is_active=1 LIMIT 50")
            rows = await rows.fetchall()
            domains = [r[0] for r in rows]
    background_tasks.add_task(_run_github_scan, domains, tokens)
    return APIResponse(data={"status":"GitHub scan started","domains":len(domains),"tokens":len(tokens)})

async def _run_github_scan(domains, tokens):
    """Run trufflehog with --only-verified to get real secrets only."""
    import subprocess as _sp, json as _j, time as _t, sqlite3 as _sq
    db = _sq.connect("/data/p1warriors.db", timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    ts = now()
    token = tokens[0] if tokens else None
    for domain in domains:
        try:
            base = domain.replace("www.","").split(".")[0]
            env = {**os.environ}
            if token:
                env["GITHUB_TOKEN"] = token
            # Use --only-verified so we get 100% real secrets
            cmd = ["trufflehog", "github", "--org", base,
                   "--json", "--no-update", "--only-verified",
                   "--concurrency", "3"]
            proc = _sp.run(cmd, capture_output=True, text=True, timeout=600, env=env)
            for line in proc.stdout.splitlines():
                try:
                    r = _j.loads(line)
                    stype = r.get("DetectorName", "generic")
                    raw = r.get("Raw", "")[:200]
                    redacted = raw[:6] + "***" + raw[-4:] if len(raw) > 10 else raw
                    repo = r.get("SourceMetadata", {}).get("Data", {}).get("Github", {}).get("repository", "")
                    fpath = r.get("SourceMetadata", {}).get("Data", {}).get("Github", {}).get("file", "")
                    raw_url = r.get("SourceMetadata", {}).get("Data", {}).get("Github", {}).get("link", "")
                    line_no = r.get("SourceMetadata", {}).get("Data", {}).get("Github", {}).get("line", None)
                    db.execute("""INSERT OR IGNORE INTO github_secrets
                        (root_domain,repo_url,file_path,line_number,secret_type,secret_value,raw_url,verified,discovered_at)
                        VALUES (?,?,?,?,?,?,?,1,?)""",
                        (domain, repo, fpath, line_no, stype, redacted, raw_url, ts))
                    db.commit()
                except Exception:
                    pass
            _t.sleep(3)
        except Exception:
            pass
    db.close()
