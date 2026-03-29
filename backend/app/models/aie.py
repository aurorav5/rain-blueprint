"""AIE (Artist Identity Engine) profile model."""
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID as PGUUID, ARRAY, REAL
from sqlalchemy.sql import func
import uuid
from app.core.database import Base
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from datetime import datetime


class AIEProfile(Base):
    __tablename__ = "aie_profiles"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    voice_vector: Mapped[Optional[list]] = mapped_column(ARRAY(REAL), nullable=True)
    session_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
