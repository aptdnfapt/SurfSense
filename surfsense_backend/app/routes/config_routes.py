"""
Configuration endpoint for runtime configuration.
Returns safe, non-sensitive configuration values for frontend consumption.
"""

import os
from fastapi import APIRouter

router = APIRouter()


@router.get("/config")
async def get_frontend_config():
    """
    Returns safe frontend configuration that can be loaded at runtime.

    SECURITY: Only non-sensitive values are returned.
    - Never expose: API keys, OAuth secrets, database URLs, etc.
    - Only expose: UI configuration, feature flags, safe metadata
    """
    # Read environment variables directly for true runtime configuration
    auth_type = os.getenv("AUTH_TYPE") or "GOOGLE"
    etl_service = os.getenv("ETL_SERVICE") or "UNSTRUCTURED"

    return {
        # Core configuration (safe to expose)
        "authType": auth_type,
        "etlService": etl_service,
        "backendUrl": "http://localhost:8000",  # This will be overridden by frontend
        
        # Feature flags (safe configuration)
        "features": {
            "googleAuthEnabled": auth_type == "GOOGLE",
            "localAuthEnabled": auth_type == "LOCAL",
        },
    }
