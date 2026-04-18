"""P1 Warriors — Custom Dep Confusion Scan API"""

import subprocess
import threading
import time
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.auth import get_current_user
from app.database import fetch_all

router = APIRouter(prefix="/api/dep-confusion", tags=["dep-confusion"])

SCANNER_PATH = "/scanner/har_dep_confusion.py"
DB_PATH = os.getenv("DB_PATH", "/root/p1warriors-deploy/data/p1warriors.db")

_running_scans: dict = {}
_lock = threading.Lock()


class CustomScanRequest(BaseModel):
    domain: str
    subs: Optional[List[str]] = []


class DomainScanRequest(BaseModel):
    domain: str


def _run_scan(domain: str, subs: List[str]):
    with _lock:
        _running_scans[domain] = {"status": "running", "started": time.strftime("%Y-%m-%d %H:%M:%S"), "log": []}
    try:
        cmd = ["python3", SCANNER_PATH, domain] + subs
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, env={**os.environ, "DB_PATH": DB_PATH})
        logs = []
        for line in proc.stdout:
            line = line.strip()
            if line:
                logs.append(line)
                with _lock:
                    _running_scans[domain]["log"] = logs[-50:]
        proc.wait()
        with _lock:
            _running_scans[domain]["status"] = "done"
            _running_scans[domain]["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        with _lock:
            _running_scans[domain]["status"] = "error"
            _running_scans[domain]["error"] = str(e)


def _get_subs_for_domain(domain: str) -> List[str]:
    import sqlite3, re
    def _valid(s):
        if not s: return False
        if "*" in s or "@" in s or s.startswith("."): return False
        return bool(re.match(r"^[a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]$", s))
    try:
        con = sqlite3.connect(DB_PATH)
        rows = con.execute(
            "SELECT subdomain FROM subdomains WHERE root_domain=? ORDER BY subdomain", (domain,)
        ).fetchall()
        con.close()
        return [r[0] for r in rows if _valid(r[0])]
    except Exception:
        return []


def _get_all_domains() -> List[str]:
    import sqlite3
    try:
        con = sqlite3.connect(DB_PATH)
        rows = con.execute("SELECT domain FROM monitored_domains WHERE is_active=1 ORDER BY domain").fetchall()
        con.close()
        return [r[0] for r in rows]
    except Exception:
        return []


def _run_scan_all():
    domains = _get_all_domains()
    for domain in domains:
        with _lock:
            if _running_scans.get(domain, {}).get("status") == "running":
                continue
        subs = _get_subs_for_domain(domain)
        _run_scan(domain, subs)
        time.sleep(5)


@router.post("/custom-scan")
async def custom_scan(req: CustomScanRequest, user: dict = Depends(get_current_user)):
    domain = req.domain.strip().lower().replace("https://", "").replace("http://", "").rstrip("/")
    if not domain:
        raise HTTPException(status_code=400, detail="Domain required")
    with _lock:
        if _running_scans.get(domain, {}).get("status") == "running":
            return {"status": "already_running", "domain": domain}
    t = threading.Thread(target=_run_scan, args=(domain, req.subs or []), daemon=True)
    t.start()
    return {"status": "started", "domain": domain}


@router.get("/custom-scan/status")
async def scan_status(user: dict = Depends(get_current_user)):
    with _lock:
        return {"scans": dict(_running_scans)}


@router.get("/custom-scan/results")
async def scan_results(domain: str, user: dict = Depends(get_current_user)):
    rows = await fetch_all(
        "SELECT * FROM intel_findings WHERE category='dep_confusion' AND root_domain=? ORDER BY discovered_at DESC LIMIT 50",
        (domain,),
    )
    return {"domain": domain, "results": rows}


@router.post("/scan-domain")
async def scan_domain(req: DomainScanRequest, user: dict = Depends(get_current_user)):
    """Scan a specific domain — auto-fetches all subdomains from DB."""
    domain = req.domain.strip().lower().replace("https://", "").replace("http://", "").rstrip("/")
    if not domain:
        raise HTTPException(status_code=400, detail="Domain required")
    with _lock:
        if _running_scans.get(domain, {}).get("status") == "running":
            return {"status": "already_running", "domain": domain}
    subs = _get_subs_for_domain(domain)
    t = threading.Thread(target=_run_scan, args=(domain, subs), daemon=True)
    t.start()
    return {"status": "started", "domain": domain, "subs_count": len(subs)}


@router.post("/scan-all")
async def scan_all(user: dict = Depends(get_current_user)):
    """Sequentially scan ALL monitored domains with their subdomains."""
    domains = _get_all_domains()
    if not domains:
        return {"status": "no_domains"}
    already_running = []
    with _lock:
        for d in domains:
            if _running_scans.get(d, {}).get("status") == "running":
                already_running.append(d)
    t = threading.Thread(target=_run_scan_all, daemon=True)
    t.start()
    return {"status": "started", "domains_queued": domains, "already_running": already_running}


@router.get("/programs")
async def get_programs(user: dict = Depends(get_current_user)):
    """Get all programs with dep confusion stats."""
    import sqlite3
    try:
        con = sqlite3.connect(DB_PATH)
        findings_rows = con.execute("""
            SELECT root_domain, severity, COUNT(*) as cnt
            FROM intel_findings WHERE category='dep_confusion'
            GROUP BY root_domain, severity
        """).fetchall()
        programs: dict = {}
        for root_domain, severity, cnt in findings_rows:
            d = programs.setdefault(root_domain, {
                "domain": root_domain, "total_findings": 0,
                "critical": 0, "high": 0, "medium": 0,
                "unclaimed_packages": 0, "claimed_packages": 0, "callbacks": 0,
            })
            d["total_findings"] += cnt
            sev = (severity or "medium").lower()
            if sev == "critical":
                d["critical"] += cnt
                d["unclaimed_packages"] += cnt
            elif sev == "high":
                d["high"] += cnt
                d["unclaimed_packages"] += cnt
            else:
                d["medium"] += cnt
        claimed_rows = con.execute("""
            SELECT root_domain, COUNT(*) as cnt FROM intel_findings
            WHERE category='dep_confusion' AND (title LIKE '%Claimed%' OR title LIKE '%claimed%')
            GROUP BY root_domain
        """).fetchall()
        for root_domain, cnt in claimed_rows:
            if root_domain in programs:
                programs[root_domain]["claimed_packages"] = cnt
        con.close()
        cb_db = "/root/dep-confusion-server/callbacks.db"
        if os.path.exists(cb_db):
            try:
                con2 = sqlite3.connect(cb_db)
                cb_rows = con2.execute(
                    "SELECT package, COUNT(*) as cnt FROM dep_confusion_callbacks WHERE is_scanner=0 GROUP BY package"
                ).fetchall()
                con2.close()
                for pkg, cnt in cb_rows:
                    for domain, prog in programs.items():
                        if domain.split(".")[0].lower() in pkg.lower():
                            prog["callbacks"] += cnt
                            break
            except Exception:
                pass
        result = sorted(programs.values(), key=lambda x: (x["critical"], x["total_findings"]), reverse=True)
        return {"programs": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/all-findings")
async def all_findings(user: dict = Depends(get_current_user)):
    """Get all dep confusion findings sorted by severity."""
    rows = await fetch_all(
        "SELECT * FROM intel_findings WHERE category='dep_confusion' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, discovered_at DESC LIMIT 500",
        (),
    )
    return {"findings": rows}


@router.get("/scan-status")
async def get_scan_status(user: dict = Depends(get_current_user)):
    with _lock:
        return {"scans": dict(_running_scans)}




# ── Publish Approval Gate ────────────────────────────────────────────────────

PENDING_FILE = os.path.join(os.getenv("DATA_PATH", "/root/p1warriors-deploy/data"), "pending_publish.json")
SCANNER_DIR = "/root/p1warriors-deploy/scanner"

import sys
sys.path.insert(0, SCANNER_DIR)


def _load_pending():
    try:
        if os.path.exists(PENDING_FILE):
            return json.loads(open(PENDING_FILE).read())
    except Exception:
        pass
    return []


def _save_pending(pending):
    try:
        os.makedirs(os.path.dirname(PENDING_FILE), exist_ok=True)
        with open(PENDING_FILE, "w") as f:
            json.dump(pending, f, indent=2)
    except Exception:
        pass


@router.get("/pending")
async def get_pending(user: dict = Depends(get_current_user)):
    """Get all packages pending publish approval."""
    pending = _load_pending()
    pending_only = [p for p in pending if p.get("status") == "pending"]
    approved = [p for p in pending if p.get("status") == "approved"]
    published = [p for p in pending if p.get("status") == "published"]
    failed = [p for p in pending if p.get("status") == "failed"]
    return {
        "pending": pending_only,
        "approved": approved,
        "published": published,
        "failed": failed,
        "total_pending": len(pending_only),
    }


class ApproveRequest(BaseModel):
    packages: List[str]  # list of package names to approve
    approve_all: Optional[bool] = False


@router.post("/approve")
async def approve_publish(req: ApproveRequest, user: dict = Depends(get_current_user)):
    """Approve packages for publishing. Triggers actual npm publish."""
    pending = _load_pending()
    approved_pkgs = []

    for p in pending:
        if p.get("status") != "pending":
            continue
        if req.approve_all or p["name"] in req.packages:
            p["status"] = "approved"
            p["approved_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            approved_pkgs.append(p)

    _save_pending(pending)

    # Trigger publish in background for approved packages
    if approved_pkgs:
        t = threading.Thread(target=_publish_approved, args=(approved_pkgs,), daemon=True)
        t.start()

    return {"approved": len(approved_pkgs), "packages": [p["name"] for p in approved_pkgs]}


class RejectRequest(BaseModel):
    packages: List[str]


@router.post("/reject")
async def reject_publish(req: RejectRequest, user: dict = Depends(get_current_user)):
    """Reject and remove packages from pending queue."""
    pending = _load_pending()
    removed = 0
    pending_new = []
    for p in pending:
        if p["name"] in req.packages and p.get("status") == "pending":
            removed += 1
        else:
            pending_new.append(p)
    _save_pending(pending_new)
    return {"rejected": removed}


def _publish_approved(packages):
    """Background: actually publish approved packages to npm."""
    try:
        from har_dep_confusion import auto_publish_npm, _log
    except ImportError:
        # Direct import failed, do it manually
        sys.path.insert(0, SCANNER_DIR)
        from har_dep_confusion import auto_publish_npm, _log

    pending = _load_pending()
    for pkg_info in packages:
        name = pkg_info["name"]
        target = pkg_info.get("target", "unknown")
        registry = pkg_info.get("registry", "npm")

        if registry != "npm":
            # Mark as failed for non-npm (PyPI not supported in auto-publish yet)
            for p in pending:
                if p["name"] == name:
                    p["status"] = "failed"
                    p["error"] = "Only npm auto-publish supported"
            _save_pending(pending)
            continue

        try:
            success = auto_publish_npm(name, target)
            for p in pending:
                if p["name"] == name:
                    if success:
                        p["status"] = "published"
                        p["published_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    else:
                        p["status"] = "failed"
                        p["error"] = "publish returned False"
            _save_pending(pending)
        except Exception as e:
            for p in pending:
                if p["name"] == name:
                    p["status"] = "failed"
                    p["error"] = str(e)[:200]
            _save_pending(pending)


@router.get("/domains")
async def get_domains(user: dict = Depends(get_current_user)):
    """Get all monitored domains for scanning."""
    import sqlite3
    try:
        con = sqlite3.connect(DB_PATH)
        rows = con.execute("SELECT domain FROM monitored_domains WHERE is_active=1 ORDER BY domain").fetchall()
        con.close()
        return {"domains": [r[0] for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
