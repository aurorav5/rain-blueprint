"""RAIN Prometheus custom metrics. Import and use in task/route handlers."""
from prometheus_client import Counter, Histogram, Gauge

# Session creation rate by tier and platform
SESSIONS_CREATED = Counter(
    "rain_sessions_created_total",
    "Total sessions created",
    ["tier", "platform"],
)

# Render duration by params source (heuristic / rainnet / heuristic_cold_start)
RENDER_DURATION = Histogram(
    "rain_render_duration_seconds",
    "Render pipeline duration in seconds",
    ["source"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

# LUFS deviation from target (absolute value, in LU)
RENDER_LUFS_ERROR = Histogram(
    "rain_render_lufs_error_lu",
    "Absolute LUFS deviation from target",
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0],
)

# Currently processing sessions
ACTIVE_SESSIONS = Gauge(
    "rain_active_sessions",
    "Number of sessions currently in processing state",
)

# RAIN_NORMALIZATION_VALIDATED gate status (1=true, 0=false)
NORMALIZATION_GATE = Gauge(
    "rain_normalization_gate",
    "RAIN_NORMALIZATION_VALIDATED setting (1=enabled, 0=blocked)",
)
