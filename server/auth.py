# server/auth.py
import os
from fastapi import Header, HTTPException, status

# Toggle based on env var
DEV_MODE = os.getenv("DEV_MODE", "false").lower() in ("1", "true", "yes")

# Your expected API key (set via env var or default "changeme")
EXPECTED_API_KEY = os.getenv("API_KEY", "changeme")


async def get_api_key(x_api_key: str | None = Header(default=None)):
    """
    Dependency that checks the X-API-Key header.
    In strict mode: requires the correct key.
    In dev mode: skips validation if header is missing.
    """
    if DEV_MODE:
        # Allow missing key in dev mode
        if x_api_key is None:
            return "dev-mode"
        return x_api_key

    # Strict mode (default)
    if x_api_key != EXPECTED_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key",
        )

    return x_api_key
