"""P1 Warriors — JS Analysis Findings."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_current_user
from app.database import fetch_all, fetch_val
from app.models import APIResponse

router = APIRouter(prefix="/api/js-analysis", tags=["js_analysis"])

# Types that are actual security findings (not just URL extractions)
_SECRET_TYPES = ("secret", "api_key", "token", "credential")

@router.get("/findings")
async def list_findings(
    domain: Optional[str]=None,
    finding_type: Optional[str]=None,
    severity: Optional[str]=None,
    search: Optional[str]=None,
    secrets_only: bool=Query(True, description="Default: show only secrets (not raw URL/endpoint extractions)"),
    page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1"]; params=[]
    if domain: conds.append("root_domain=?"); params.append(domain)
    if finding_type:
        conds.append("finding_type=?"); params.append(finding_type)
    elif secrets_only:
        # Exclude pure URL/endpoint extractions — they're not security findings
        conds.append("finding_type NOT IN ('api_endpoint','url','endpoint')")
    if severity: conds.append("severity=?"); params.append(severity)
    if search:
        conds.append("(key_name LIKE ? OR value LIKE ? OR subdomain LIKE ? OR js_url LIKE ?)")
        params.extend([f"%{search}%"]*4)
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM js_findings WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(
        f"""SELECT *, value AS value_preview, discovered_at AS found_at
        FROM js_findings WHERE {where}
        ORDER BY
            CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
            CASE finding_type WHEN 'secret' THEN 1 WHEN 'api_key' THEN 2 WHEN 'token' THEN 3 ELSE 4 END,
            discovered_at DESC
        LIMIT ? OFFSET ?""",
        tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.get("/stats")
async def js_stats(user: dict=Depends(get_current_user)) -> APIResponse:
    total=await fetch_val("SELECT COUNT(*) FROM js_findings") or 0
    secrets=await fetch_val("SELECT COUNT(*) FROM js_findings WHERE finding_type NOT IN ('api_endpoint','url','endpoint')") or 0
    endpoints=await fetch_val("SELECT COUNT(*) FROM js_findings WHERE finding_type='api_endpoint'") or 0
    by_type=await fetch_all("SELECT finding_type,COUNT(*) as count FROM js_findings GROUP BY finding_type ORDER BY count DESC")
    by_severity=await fetch_all("SELECT severity,COUNT(*) as count FROM js_findings WHERE finding_type NOT IN ('api_endpoint','url','endpoint') GROUP BY severity ORDER BY count DESC")
    top_keys=await fetch_all("SELECT key_name,COUNT(*) as count FROM js_findings WHERE finding_type NOT IN ('api_endpoint','url','endpoint') GROUP BY key_name ORDER BY count DESC LIMIT 15")
    return APIResponse(data={"total":total,"secrets":secrets,"endpoints":endpoints,"by_type":by_type,"by_severity":by_severity,"top_keys":top_keys})
