"""P1 Warriors — Nuclei Findings."""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_current_user
from app.database import fetch_all, fetch_val
from app.models import APIResponse

router = APIRouter(prefix="/api/nuclei", tags=["nuclei"])

@router.get("/findings")
async def list_findings(
    domain: Optional[str]=None, severity: Optional[str]=None,
    page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1"]; params=[]
    if domain: conds.append("root_domain=?"); params.append(domain)
    if severity: conds.append("severity=?"); params.append(severity)
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM nuclei_findings WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(f"SELECT * FROM nuclei_findings WHERE {where} ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, first_seen DESC LIMIT ? OFFSET ?",
        tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.get("/stats")
async def nuclei_stats(user: dict=Depends(get_current_user)) -> APIResponse:
    total=await fetch_val("SELECT COUNT(*) FROM nuclei_findings") or 0
    new_today=await fetch_val("SELECT COUNT(*) FROM nuclei_findings WHERE first_seen>=datetime('now','-24 hours')") or 0
    by_sev=await fetch_all("SELECT severity,COUNT(*) as count FROM nuclei_findings GROUP BY severity ORDER BY count DESC")
    by_domain=await fetch_all("SELECT root_domain,COUNT(*) as count FROM nuclei_findings GROUP BY root_domain ORDER BY count DESC LIMIT 10")
    top_templates=await fetch_all("SELECT template_id,template_name,severity,COUNT(*) as count FROM nuclei_findings GROUP BY template_id ORDER BY count DESC LIMIT 20")
    return APIResponse(data={"total":total,"new_today":new_today,"by_severity":by_sev,"by_domain":by_domain,"top_templates":top_templates})
