"""P1 Warriors — Main FastAPI application."""

import os
import time
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db, fetch_one, fetch_val, get_db, execute
from app.auth import (
    get_current_user, has_any_user, hash_password, verify_password,
    create_token, set_auth_cookie,
)
from app.models import (
    APIResponse, LoginRequest, RegisterRequest, ChangePasswordRequest, AuthResponse, UserResponse,
    HealthResponse,
)
from app.websocket import websocket_endpoint
from app.routers import dashboard, subdomains, domains, ports, tech, screenshots, scans, system
from app.routers import leakix as leakix_router
from app.routers import ipscan as ipscan_router
from app.routers import findings as findings_router
from app.routers import nuclei as nuclei_router
from app.routers import js_analysis as js_router
from app.routers import recon as recon_router
from app.routers import settings as settings_router
from app.routers import elite as elite_router
from app.routers import intelligence as intel_router
from app.routers import dep_confusion as dep_confusion_router
from app.routers import programs as programs_router
from app.routers import ai_hunter as ai_hunter_router

START_TIME = time.time()
VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown."""
    # Ensure data directories exist
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    Path(settings.screenshot_dir).mkdir(parents=True, exist_ok=True)
    await init_db()
    yield


app = FastAPI(
    title="P1 Warriors API",
    version=VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Rate Limiting Middleware ---
_rate_store: dict[str, list[float]] = {}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        client_ip = request.headers.get("X-Real-IP") or request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
        now = time.time()
        window = 60.0

        if client_ip not in _rate_store:
            _rate_store[client_ip] = []

        # Clean old entries
        _rate_store[client_ip] = [t for t in _rate_store[client_ip] if now - t < window]

        if len(_rate_store[client_ip]) >= settings.rate_limit_per_minute:
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded", "data": None, "meta": None},
            )

        _rate_store[client_ip].append(now)

    response = await call_next(request)
    return response


# --- Auth Routes ---

@app.post("/api/auth/register", response_model=APIResponse)
async def register(body: RegisterRequest, response: Response):
    """Register first admin user (first-run only)."""
    if await has_any_user():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration disabled — user already exists",
        )

    hashed = hash_password(body.password)
    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (body.username, hashed),
        )
        await db.commit()
        user_id = cursor.lastrowid

    user = await fetch_one("SELECT id, username, created_at FROM users WHERE id = ?", (user_id,))
    token = create_token(user["id"], user["username"])
    set_auth_cookie(response, token)

    return APIResponse(data={
        "token": token,
        "user": user,
    })


@app.post("/api/auth/login", response_model=APIResponse)
async def login(body: LoginRequest, response: Response):
    """Login and get JWT token."""
    user = await fetch_one(
        "SELECT * FROM users WHERE username = ?", (body.username,)
    )
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_token(user["id"], user["username"])
    set_auth_cookie(response, token)

    return APIResponse(data={
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "created_at": user["created_at"],
        },
    })


@app.get("/api/auth/me", response_model=APIResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """Get current authenticated user."""
    return APIResponse(data=user)


@app.post("/api/auth/change-password", response_model=APIResponse)
async def change_password(body: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """Change the current user's password."""
    user = await fetch_one("SELECT * FROM users WHERE id = ?", (current_user["id"],))
    if not user or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    hashed = hash_password(body.new_password)
    await execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed, current_user["id"]))
    return APIResponse(data={"message": "Password changed successfully"})


# --- Health ---

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    db_size = 0
    try:
        db_size = os.path.getsize(settings.db_path)
    except OSError:
        pass

    return {
        "status": "ok",
        "uptime": round(time.time() - START_TIME, 1),
        "db_size": db_size,
        "version": VERSION,
    }


# --- WebSocket ---

@app.websocket("/api/ws/live-feed")
async def ws_live_feed(websocket):
    await websocket_endpoint(websocket)


# --- Include Routers ---

app.include_router(dashboard.router)
app.include_router(subdomains.router)
app.include_router(domains.router)
app.include_router(ports.router)
app.include_router(tech.router)
app.include_router(screenshots.router)
app.include_router(scans.router)
app.include_router(settings_router.router)
app.include_router(system.router)
app.include_router(leakix_router.router)
app.include_router(ipscan_router.router)
app.include_router(findings_router.router)
app.include_router(nuclei_router.router)
app.include_router(js_router.router)
app.include_router(recon_router.router)
app.include_router(elite_router.router)
app.include_router(intel_router.router)
app.include_router(dep_confusion_router.router)
app.include_router(programs_router.router)
app.include_router(ai_hunter_router.router)
