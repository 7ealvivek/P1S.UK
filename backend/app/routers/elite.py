"""P1 Warriors — Elite Features API routes."""

import json
import uuid
import subprocess as _subprocess
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_db
from app.models import APIResponse

router = APIRouter(prefix="/api/elite", tags=["elite"])


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# ─── Alerts ──────────────────────────────────────────────────────────────────

@router.get("/alerts")
async def get_alerts(
    limit: int = 50,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get alert log."""
    async with get_db() as db:
        try:
            cursor = await db.execute(
                "SELECT * FROM alert_log ORDER BY sent_at DESC LIMIT ?", (limit,)
            )
            rows = await cursor.fetchall()
            data = [dict(r) for r in rows]
        except Exception:
            data = []
    return APIResponse(data=data)


@router.post("/alerts/test")
async def test_alert(user: dict = Depends(get_current_user)) -> APIResponse:
    """Send a test alert to Slack (and Telegram if configured)."""
    import httpx

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT key, value FROM app_settings WHERE key IN ('slack_webhook','telegram_bot_token','telegram_chat_id')")
        rows = await cursor.fetchall()
        cfg = {r[0]: r[1] for r in rows}

    slack_webhook = (cfg.get("slack_webhook") or "").strip()
    telegram_token = (cfg.get("telegram_bot_token") or "").strip()
    telegram_chat = (cfg.get("telegram_chat_id") or "").strip()

    if not slack_webhook and not (telegram_token and telegram_chat):
        raise HTTPException(status_code=400, detail="No alert channel configured — set Slack webhook in settings")

    sent = []
    async with httpx.AsyncClient(timeout=10) as client:
        if slack_webhook:
            resp = await client.post(slack_webhook, json={"text": "🔔 *P1 Warriors* — Slack alert test successful! Your recon alerts are live."})
            if resp.status_code == 200:
                sent.append("slack")
        if telegram_token and telegram_chat:
            resp = await client.post(
                f"https://api.telegram.org/bot{telegram_token}/sendMessage",
                json={"chat_id": telegram_chat, "text": "🔔 P1 Warriors test alert! Telegram connected.", "parse_mode": "HTML"}
            )
            if resp.status_code == 200:
                sent.append("telegram")

    if not sent:
        raise HTTPException(status_code=400, detail="Failed to send — check webhook URL")

    async with get_db() as db:
        await db.execute("INSERT INTO alert_log (message, channel, sent_at) VALUES (?,?,?)",
                         ("Test alert", "+".join(sent), _now()))
        await db.commit()

    return APIResponse(data={"success": True, "channels": sent})

@router.get("/takeovers")
async def get_takeovers(
    domain: Optional[str] = None,
    confidence: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get subdomain takeover candidates."""
    async with get_db() as db:
        try:
            conditions = []
            params = []
            if domain:
                conditions.append("root_domain = ?")
                params.append(domain)
            if confidence:
                conditions.append("confidence = ?")
                params.append(confidence)
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            cursor = await db.execute(
                f"SELECT * FROM takeover_candidates {where} ORDER BY found_at DESC LIMIT 500",
                params
            )
            rows = await cursor.fetchall()
            data = [dict(r) for r in rows]
        except Exception:
            data = []
    return APIResponse(data=data)


# ─── CVEs ────────────────────────────────────────────────────────────────────

@router.get("/cves")
async def get_cves(
    domain: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get CVE matches — from confirmed nuclei findings + tech-inference matches."""
    import re as _re
    CVE_PATTERN = _re.compile(r"CVE-\d{4}-\d+", _re.IGNORECASE)
    async with get_db() as db:
        data = []
        seen = set()
        try:
            # ── 1. Nuclei-confirmed CVEs (highest confidence) ──────────────
            n_conds = ["(template_id LIKE '%CVE-%' OR template_id LIKE '%cve-%')"]
            n_params = []
            if domain:
                n_conds.append("root_domain = ?"); n_params.append(domain)
            if severity:
                n_conds.append("severity = ?"); n_params.append(severity)
            if search:
                n_conds.append("(template_id LIKE ? OR subdomain LIKE ?)")
                n_params.extend([f"%{search}%", f"%{search}%"])
            n_where = " AND ".join(n_conds)
            cursor = await db.execute(
                f"""SELECT template_id AS cve_id, severity, subdomain, root_domain,
                           name AS description, cvss_score AS cvss,
                           'nuclei' AS tech_detected, found_at, 1 AS confirmed
                    FROM nuclei_findings WHERE {n_where}
                    ORDER BY cvss_score DESC, found_at DESC LIMIT 500""",
                n_params
            )
            rows = await cursor.fetchall()
            for r in rows:
                d = dict(r)
                key = (d.get("subdomain",""), d.get("cve_id",""))
                if key not in seen:
                    seen.add(key)
                    data.append(d)
        except Exception:
            pass
        try:
            # ── 2. Tech-inference CVEs (lower confidence, show as "potential") ─
            conditions = []
            params = []
            if domain:
                conditions.append("root_domain = ?"); params.append(domain)
            if severity:
                conditions.append("severity = ?"); params.append(severity)
            if search:
                conditions.append("(cve_id LIKE ? OR description LIKE ? OR subdomain LIKE ?)")
                params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            cursor = await db.execute(
                f"SELECT *, 0 AS confirmed FROM cve_matches {where} ORDER BY cvss DESC, found_at DESC LIMIT 500",
                params
            )
            rows = await cursor.fetchall()
            for r in rows:
                d = dict(r)
                key = (d.get("subdomain",""), d.get("cve_id",""))
                if key not in seen:
                    seen.add(key)
                    data.append(d)
        except Exception:
            pass
    return APIResponse(data=data)


# ─── Changes ─────────────────────────────────────────────────────────────────

@router.get("/changes")
async def get_changes(
    domain: Optional[str] = None,
    type: Optional[str] = None,
    page: int = 1,
    per_page: int = 100,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get asset changes (excluding unchanged) with pagination."""
    per_page = min(per_page, 500)
    offset = (max(page, 1) - 1) * per_page
    async with get_db() as db:
        try:
            conditions = ["change_type != 'unchanged'"]
            params: list = []
            if domain:
                conditions.append("root_domain = ?")
                params.append(domain)
            if type:
                conditions.append("change_type = ?")
                params.append(type)
            where = "WHERE " + " AND ".join(conditions)
            count_cursor = await db.execute(f"SELECT COUNT(*) FROM asset_changes {where}", params)
            total = (await count_cursor.fetchone())[0]
            cursor = await db.execute(
                f"SELECT * FROM asset_changes {where} ORDER BY detected_at DESC LIMIT ? OFFSET ?",
                params + [per_page, offset]
            )
            rows = await cursor.fetchall()
            data = [dict(r) for r in rows]
        except Exception:
            data = []
            total = 0
    pages = (total + per_page - 1) // per_page if total else 1
    return APIResponse(data=data, meta={"page": page, "per_page": per_page, "total": total, "pages": pages})


# ─── Risk Scores ──────────────────────────────────────────────────────────────

@router.get("/risk-scores")
async def get_risk_scores(
    domain: Optional[str] = None,
    min_score: Optional[int] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get risk scores."""
    async with get_db() as db:
        try:
            conditions = []
            params = []
            if domain:
                conditions.append("root_domain = ?")
                params.append(domain)
            if min_score is not None:
                conditions.append("score >= ?")
                params.append(min_score)
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            cursor = await db.execute(
                f"SELECT * FROM risk_scores {where} ORDER BY score DESC LIMIT 1000",
                params
            )
            rows = await cursor.fetchall()
            data = [dict(r) for r in rows]
        except Exception:
            data = []
    return APIResponse(data=data)


# ─── WAF ─────────────────────────────────────────────────────────────────────

@router.get("/waf")
async def get_waf(
    domain: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get WAF detection results."""
    async with get_db() as db:
        try:
            conditions = []
            params = []
            if domain:
                conditions.append("root_domain = ?")
                params.append(domain)
            where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            cursor = await db.execute(
                f"SELECT * FROM waf_detection {where} ORDER BY detected_at DESC LIMIT 500",
                params
            )
            rows = await cursor.fetchall()
            data = [dict(r) for r in rows]
        except Exception:
            data = []
    return APIResponse(data=data)


# ─── Program Matches ──────────────────────────────────────────────────────────

@router.get("/program-matches")
async def get_program_matches(
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get bug bounty program matches."""
    async with get_db() as db:
        try:
            cursor = await db.execute(
                "SELECT * FROM program_matches ORDER BY matched_at DESC LIMIT 200"
            )
            rows = await cursor.fetchall()
            data = [dict(r) for r in rows]
        except Exception:
            data = []
    return APIResponse(data=data)


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_elite_stats(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get elite feature statistics."""

    async def safe_count(db, query, params=()):
        try:
            cursor = await db.execute(query, params)
            row = await cursor.fetchone()
            return row[0] if row else 0
        except Exception:
            return 0

    async with get_db() as db:
        today = _now()[:10]
        takeovers = await safe_count(db, "SELECT COUNT(*) FROM takeover_candidates")
        cves_critical = await safe_count(db, "SELECT COUNT(*) FROM cve_matches WHERE cvss >= 9.0")
        cves_total = await safe_count(db, "SELECT COUNT(*) FROM cve_matches")
        changes_today = await safe_count(db, "SELECT COUNT(*) FROM asset_changes WHERE detected_at >= ? AND change_type != 'unchanged'", (today,))
        high_risk = await safe_count(db, "SELECT COUNT(*) FROM risk_scores WHERE score >= 61")
        github_secrets = await safe_count(db, "SELECT COUNT(*) FROM github_secrets")
        programs = await safe_count(db, "SELECT COUNT(DISTINCT root_domain) FROM program_matches")

    return APIResponse(data={
        "takeovers": takeovers,
        "cves_critical": cves_critical,
        "cves_total": cves_total,
        "changes_today": changes_today,
        "high_risk_assets": high_risk,
        "github_secrets": github_secrets,
        "programs_matched": programs,
    })


# ─── Report Generator ─────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    subdomain: Optional[str] = None
    vuln_type: str = "Other"
    severity: str = "P2"
    description: str = ""
    poc: str = ""
    program: Optional[str] = None


@router.post("/report/generate")
async def generate_report(
    body: ReportRequest,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Generate a formatted bug report."""
    severity_map = {
        "P1": ("Critical", "9.0-10.0"),
        "P2": ("High", "7.0-8.9"),
        "P3": ("Medium", "4.0-6.9"),
        "P4": ("Low", "0.1-3.9"),
    }
    sev_label, cvss_range = severity_map.get(body.severity, ("Medium", "4.0-6.9"))

    vuln_refs = {
        "XSS": ["https://owasp.org/www-community/attacks/xss/", "https://portswigger.net/web-security/cross-site-scripting"],
        "SQLi": ["https://owasp.org/www-community/attacks/SQL_Injection", "https://portswigger.net/web-security/sql-injection"],
        "SSRF": ["https://owasp.org/www-community/attacks/Server_Side_Request_Forgery", "https://portswigger.net/web-security/ssrf"],
        "IDOR": ["https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References", "https://portswigger.net/web-security/access-control/idor"],
        "RCE": ["https://owasp.org/www-community/attacks/Command_Injection", "https://portswigger.net/web-security/os-command-injection"],
        "Auth Bypass": ["https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/04-Authentication_Testing/", "https://portswigger.net/web-security/authentication"],
        "Info Disclosure": ["https://owasp.org/www-project-web-security-testing-guide/stable/4-Web_Application_Security_Testing/01-Information_Gathering/"],
    }
    refs = vuln_refs.get(body.vuln_type, ["https://owasp.org/www-project-top-ten/"])
    refs_text = "\n".join(f"- {r}" for r in refs)

    target = body.subdomain or "Target"
    program = body.program or "Target Program"
    poc_steps = body.poc or "1. Navigate to target\n2. Observe the vulnerability"

    report = f"""# {body.vuln_type} Vulnerability in {target}

## Summary
A **{sev_label} severity** {body.vuln_type} vulnerability was identified on `{target}` affecting the `{program}` program.

{body.description}

## Vulnerability Details
- **Type:** {body.vuln_type}
- **Severity:** {body.severity} ({sev_label})
- **CVSS Score:** {cvss_range}
- **Target:** `{target}`
- **Program:** {program}

## Steps to Reproduce
{poc_steps}

## Impact
This vulnerability could allow an attacker to:
- Compromise the confidentiality, integrity, or availability of the affected system
- Escalate privileges or gain unauthorized access
- Potentially pivot to internal systems depending on the deployment environment

## Proof of Concept
```
{poc_steps}
```

## Remediation
- Implement proper input validation and output encoding
- Follow OWASP security guidelines for {body.vuln_type}
- Apply the principle of least privilege
- Conduct a thorough security review of affected components

## References
{refs_text}

---
*Report generated by P1 Warriors on {_now()}*
"""

    return APIResponse(data={"report": report, "severity": body.severity, "vuln_type": body.vuln_type})

# ─── Custom JS Scan ───────────────────────────────────────────────────────────

class JSScanRequest(BaseModel):
    domain: str
    subdomains: List[str]


async def _ensure_js_scans_table(db) -> None:
    await db.execute("""
        CREATE TABLE IF NOT EXISTS custom_js_scans (
            id TEXT PRIMARY KEY,
            domain TEXT,
            subdomains TEXT,
            status TEXT DEFAULT 'pending',
            total INTEGER DEFAULT 0,
            done INTEGER DEFAULT 0,
            findings INTEGER DEFAULT 0,
            started_at TEXT,
            finished_at TEXT,
            created_at TEXT
        )
    """)
    await db.commit()


@router.post("/js-scan")
async def trigger_js_scan(
    body: JSScanRequest,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Trigger JS analysis on a custom list of subdomains."""
    subs = [s.strip() for s in body.subdomains if s.strip()]
    if not subs:
        raise HTTPException(status_code=400, detail="No subdomains provided")
    if len(subs) > 50:
        raise HTTPException(status_code=400, detail="Max 50 subdomains per scan")

    job_id = str(uuid.uuid4())

    async with get_db() as db:
        await _ensure_js_scans_table(db)
        await db.execute(
            "INSERT INTO custom_js_scans (id, domain, subdomains, status, total, created_at) VALUES (?,?,?,?,?,?)",
            (job_id, body.domain, json.dumps(subs), "pending", len(subs), _now()),
        )
        await db.commit()

    scanner_dir = "/root/p1warriors-deploy/scanner"
    log_path = f"/tmp/js_scan_{job_id}.log"
    _subprocess.Popen(
        ["python3", f"{scanner_dir}/run_js_scan.py", job_id, body.domain, json.dumps(subs)],
        cwd=scanner_dir,
        stdout=open(log_path, "w"),
        stderr=_subprocess.STDOUT,
    )

    return APIResponse(data={"job_id": job_id, "subdomains": len(subs)})


@router.get("/js-scan")
async def list_js_scans(user: dict = Depends(get_current_user)) -> APIResponse:
    """List recent custom JS scan jobs."""
    async with get_db() as db:
        try:
            await _ensure_js_scans_table(db)
            cursor = await db.execute(
                "SELECT * FROM custom_js_scans ORDER BY created_at DESC LIMIT 20"
            )
            rows = await cursor.fetchall()
            data = [dict(r) for r in rows]
        except Exception:
            data = []
    return APIResponse(data=data)


@router.get("/js-scan/{job_id}")
async def get_js_scan_status(
    job_id: str,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Get JS scan job status and its findings."""
    async with get_db() as db:
        try:
            await _ensure_js_scans_table(db)
            cursor = await db.execute("SELECT * FROM custom_js_scans WHERE id=?", (job_id,))
            row = await cursor.fetchone()
        except Exception:
            row = None

        if not row:
            raise HTTPException(status_code=404, detail="Job not found")

        job = dict(row)
        findings: list = []

        if job.get("started_at"):
            subs = json.loads(job.get("subdomains", "[]"))
            if subs:
                placeholders = ",".join("?" * len(subs))
                try:
                    cursor = await db.execute(
                        f"SELECT * FROM js_findings WHERE domain=? AND subdomain IN ({placeholders}) AND found_at >= ? ORDER BY found_at DESC LIMIT 200",
                        [job["domain"]] + subs + [job["started_at"]],
                    )
                    findings = [dict(r) for r in await cursor.fetchall()]
                except Exception:
                    pass

    return APIResponse(data={"job": job, "findings": findings})
