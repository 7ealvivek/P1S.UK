"""P1 Warriors — Manual Findings Tracker."""
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional
from pydantic import BaseModel
from app.auth import get_current_user
from app.database import fetch_all, fetch_val, get_db
from app.models import APIResponse
from datetime import datetime, timezone

router = APIRouter(prefix="/api/findings", tags=["findings"])

def now(): return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

class FindingBody(BaseModel):
    title: str; target: str; program: Optional[str]=None
    bug_type: str; severity: str="P1"; status: str="new"
    cvss: Optional[float]=None; bounty: Optional[float]=None
    notes: Optional[str]=None; poc: Optional[str]=None
    reported_at: Optional[str]=None

@router.get("")
async def list_findings(
    severity: Optional[str]=None, status: Optional[str]=None,
    page: int=Query(1,ge=1), per_page: int=Query(50,ge=10,le=200),
    user: dict=Depends(get_current_user)
) -> APIResponse:
    conds=["1=1"]; params=[]
    if severity: conds.append("severity=?"); params.append(severity)
    if status: conds.append("status=?"); params.append(status)
    where=" AND ".join(conds)
    total=await fetch_val(f"SELECT COUNT(*) FROM findings WHERE {where}",tuple(params)) or 0
    pages=max(1,(total+per_page-1)//per_page)
    rows=await fetch_all(f"SELECT * FROM findings WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",tuple(params+[per_page,(page-1)*per_page]))
    return APIResponse(data=rows,meta={"total":total,"page":page,"pages":pages,"per_page":per_page})

@router.post("")
async def create_finding(body: FindingBody, user: dict=Depends(get_current_user)) -> APIResponse:
    ts=now()
    async with get_db() as db:
        cur=await db.execute("""INSERT INTO findings (title,target,program,bug_type,severity,status,cvss,bounty,notes,poc,reported_at,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (body.title,body.target,body.program,body.bug_type,body.severity,body.status,body.cvss,body.bounty,body.notes,body.poc,body.reported_at,ts,ts))
        await db.commit()
        return APIResponse(data={"id":cur.lastrowid})

@router.patch("/{fid}")
async def update_finding(fid: int, body: FindingBody, user: dict=Depends(get_current_user)) -> APIResponse:
    ts=now()
    async with get_db() as db:
        await db.execute("""UPDATE findings SET title=?,target=?,program=?,bug_type=?,severity=?,status=?,cvss=?,bounty=?,notes=?,poc=?,reported_at=?,updated_at=? WHERE id=?""",
            (body.title,body.target,body.program,body.bug_type,body.severity,body.status,body.cvss,body.bounty,body.notes,body.poc,body.reported_at,ts,fid))
        await db.commit()
    return APIResponse(data={"status":"updated"})

@router.delete("/{fid}")
async def delete_finding(fid: int, user: dict=Depends(get_current_user)) -> APIResponse:
    async with get_db() as db:
        await db.execute("DELETE FROM findings WHERE id=?", (fid,))
        await db.commit()
    return APIResponse(data={"status":"deleted"})

@router.get("/stats")
async def finding_stats(user: dict=Depends(get_current_user)) -> APIResponse:
    total=await fetch_val("SELECT COUNT(*) FROM findings") or 0
    by_sev=await fetch_all("SELECT severity,COUNT(*) as count FROM findings GROUP BY severity ORDER BY severity")
    by_status=await fetch_all("SELECT status,COUNT(*) as count FROM findings GROUP BY status ORDER BY count DESC")
    total_bounty=await fetch_val("SELECT COALESCE(SUM(bounty),0) FROM findings WHERE status='paid'") or 0
    return APIResponse(data={"total":total,"by_severity":by_sev,"by_status":by_status,"total_bounty":total_bounty})
