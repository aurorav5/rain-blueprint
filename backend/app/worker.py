from celery import Celery, shared_task
from app.core.config import settings

celery_app = Celery(
    "rain_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.analysis",
        "app.tasks.render",
        "app.tasks.demucs",
        "app.tasks.certification",
        "app.tasks.distribution",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_routes={
        "app.tasks.demucs.*": {"queue": "demucs"},
        "app.tasks.distribution.*": {"queue": "distribution"},
        "app.tasks.certification.*": {"queue": "certification"},
        "*": {"queue": "default"},
    },
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@shared_task(name="app.tasks.analysis.analyze_session", bind=True, max_retries=3)
def analyze_session(self, session_id: str, user_id: str) -> None:  # type: ignore[override]
    """Stub — implemented in PART-6."""


@shared_task(name="app.tasks.render.render_session", bind=True, max_retries=2)
def render_session(self, session_id: str, user_id: str, params: dict) -> None:  # type: ignore[override]
    """Stub — implemented in PART-6."""
