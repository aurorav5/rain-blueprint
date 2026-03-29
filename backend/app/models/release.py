"""Release model for distribution pipeline."""
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.core.database import Base
from sqlalchemy.orm import mapped_column, Mapped
from typing import Optional
from datetime import datetime


class Release(Base):
    __tablename__ = "releases"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    artist_name: Mapped[str] = mapped_column(String, nullable=False)
    isrc: Mapped[str] = mapped_column(String, nullable=False)
    upc: Mapped[str] = mapped_column(String, nullable=False)
    genre: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    release_date: Mapped[str] = mapped_column(String, nullable=False)
    territory: Mapped[str] = mapped_column(String, nullable=False, default="Worldwide")
    label_name: Mapped[str] = mapped_column(String, nullable=False, default="ARCOVEL RAIN Distribution")
    explicit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ddex_xml: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    labelgrid_release_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    labelgrid_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
