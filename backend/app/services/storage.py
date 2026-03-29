import boto3
import hashlib
from botocore.exceptions import ClientError
from app.core.config import settings
import structlog

logger = structlog.get_logger()
_s3_client = None


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
    return _s3_client


def s3_key(user_id: str, session_id: str, file_hash: str, ext: str) -> str:
    """Canonical S3 key format. IMMUTABLE: users/{user_id}/{session_id}/{file_hash}.{ext}"""
    return f"users/{user_id}/{session_id}/{file_hash}.{ext}"


async def upload_to_s3(
    data: bytes,
    user_id: str,
    session_id: str,
    filename: str,
    content_type: str = "audio/wav",
) -> tuple[str, str]:
    """Upload file to S3. Returns (s3_key, sha256_hash)."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "wav"
    file_hash = hashlib.sha256(data).hexdigest()
    key = s3_key(user_id, session_id, file_hash, ext)
    client = get_s3_client()
    try:
        client.put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
            Metadata={"sha256": file_hash, "user_id": user_id},
        )
        logger.info("s3_upload_success", key=key, size=len(data))
        return key, file_hash
    except ClientError as e:
        logger.error("s3_upload_failed", key=key, error=str(e))
        raise


def generate_presigned_url(key: str, expires_seconds: int = 3600) -> str:
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires_seconds,
    )
