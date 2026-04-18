"""P1 Warriors — Settings API routes."""

import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.database import get_db, fetch_all
from app.models import APIResponse, SettingsUpdate, TestAlertRequest
from typing import Optional as _Opt
from pydantic import BaseModel as _BM

class _TestAlertBody(_BM):
    channel: str
    webhook: _Opt[str] = None  # optional: caller can pass current value directly

router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_SETTINGS = {
    "sweep_interval": "3600",
    "tools.hunterseye": "true",
    "tools.subfinder": "true",
    "tools.findomain": "true",
    "tools.amass": "true",
    "ct_stream_enabled": "true",
    "masscan_mode": "top",
    "masscan_rate": "1000",
    "telegram_api_key": "",
    "telegram_chat_id": "",
    "discord_webhook": "",
    "slack_webhook": "",
    "alerts_paused": "false",
    "leakix_api_key": "",
    "leakix_poll_interval": "86400",
    "github_token": "",
    "shodan_api_key": "",
    "anthropic_api_key": "",
}


async def _get_setting(db, key: str) -> str:
    cursor = await db.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
    row = await cursor.fetchone()
    if row:
        return row[0]
    return DEFAULT_SETTINGS.get(key, "")


async def _set_setting(db, key: str, value: str) -> None:
    await db.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
        (key, value),
    )


@router.get("")
async def get_settings(user: dict = Depends(get_current_user)) -> APIResponse:
    """Get all settings."""
    async with get_db() as db:
        result = {}
        for key in DEFAULT_SETTINGS:
            val = await _get_setting(db, key)
            # Convert types
            if key in ("sweep_interval", "masscan_rate"):
                result[key] = int(val) if val else int(DEFAULT_SETTINGS[key])
            elif key in ("ct_stream_enabled", "alerts_paused") or key.startswith("tools."):
                result[key] = val.lower() == "true"
            else:
                result[key] = val

        # Restructure tools
        result["tools"] = {
            "hunterseye": result.pop("tools.hunterseye", True),
            "subfinder": result.pop("tools.subfinder", True),
            "findomain": result.pop("tools.findomain", True),
            "amass": result.pop("tools.amass", True),
        }

    return APIResponse(data=result)


@router.put("")
async def update_settings(
    body: SettingsUpdate,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Update settings."""
    async with get_db() as db:
        if body.sweep_interval is not None:
            await _set_setting(db, "sweep_interval", str(body.sweep_interval))
        if body.tools is not None:
            for tool_name, enabled in body.tools.items():
                await _set_setting(db, f"tools.{tool_name}", str(enabled).lower())
        if body.ct_stream_enabled is not None:
            await _set_setting(db, "ct_stream_enabled", str(body.ct_stream_enabled).lower())
        if body.masscan_mode is not None:
            await _set_setting(db, "masscan_mode", body.masscan_mode)
        if body.masscan_rate is not None:
            await _set_setting(db, "masscan_rate", str(body.masscan_rate))
        if body.telegram_api_key is not None:
            await _set_setting(db, "telegram_api_key", body.telegram_api_key)
        if body.telegram_chat_id is not None:
            await _set_setting(db, "telegram_chat_id", body.telegram_chat_id)
        if body.discord_webhook is not None:
            await _set_setting(db, "discord_webhook", body.discord_webhook)
        if body.slack_webhook is not None:
            await _set_setting(db, "slack_webhook", body.slack_webhook)
        if body.alerts_paused is not None:
            await _set_setting(db, "alerts_paused", str(body.alerts_paused).lower())
        if body.github_token is not None:
            await _set_setting(db, "github_token", body.github_token)
        if body.shodan_api_key is not None:
            await _set_setting(db, "shodan_api_key", body.shodan_api_key)
        if body.anthropic_api_key is not None:
            await _set_setting(db, "anthropic_api_key", body.anthropic_api_key)
        await db.commit()

    return APIResponse(data={"status": "updated"})


@router.post("/test-alert")
async def test_alert(
    body: _TestAlertBody,
    user: dict = Depends(get_current_user),
) -> APIResponse:
    """Send a test alert to a channel. Accepts optional inline webhook/key values
    so the frontend can test unsaved values without saving first."""
    test_message = "🛡️ P1 Warriors — Test alert! Your integration is working."

    async with get_db() as db:
        try:
            if body.channel == "telegram":
                api_key = await _get_setting(db, "telegram_api_key")
                chat_id = await _get_setting(db, "telegram_chat_id")
                if not api_key or not chat_id:
                    raise HTTPException(status_code=400, detail="Telegram not configured — save API key and chat ID first")
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(
                        f"https://api.telegram.org/bot{api_key}/sendMessage",
                        json={"chat_id": chat_id, "text": test_message},
                    )
                    if resp.status_code != 200:
                        raise HTTPException(status_code=400, detail=f"Telegram error: {resp.text}")

            elif body.channel == "discord":
                webhook = body.webhook or await _get_setting(db, "discord_webhook")
                if not webhook:
                    raise HTTPException(status_code=400, detail="Discord webhook not configured — save it first")
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(webhook, json={"content": test_message})
                    if resp.status_code not in (200, 204):
                        raise HTTPException(status_code=400, detail=f"Discord error {resp.status_code}: {resp.text}")

            elif body.channel == "slack":
                webhook = body.webhook or await _get_setting(db, "slack_webhook")
                if not webhook:
                    raise HTTPException(status_code=400, detail="Slack webhook not configured — save it first")
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(webhook, json={"text": test_message})
                    if resp.status_code != 200 or resp.text not in ("ok", ""):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Slack error {resp.status_code}: {resp.text}"
                        )

            else:
                raise HTTPException(status_code=400, detail=f"Unknown channel: {body.channel}")

        except httpx.RequestError as e:
            raise HTTPException(status_code=400, detail=f"Network error reaching {body.channel}: {str(e)}")

    return APIResponse(data={"success": True, "channel": body.channel})
