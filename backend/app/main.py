from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.observability import setup_observability
from app.api.routes import auth, upload, billing, sessions, download, aie

app = FastAPI(
    title="RAIN API",
    version=settings.RAIN_VERSION,
    docs_url="/docs" if settings.RAIN_ENV != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_observability(app)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(upload.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(download.router, prefix="/api/v1")
app.include_router(aie.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": settings.RAIN_VERSION, "env": settings.RAIN_ENV}
