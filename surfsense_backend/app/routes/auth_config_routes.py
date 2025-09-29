from fastapi import APIRouter

from app.config import config


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config")
async def get_auth_config():
    auth_type = config.AUTH_TYPE or "GOOGLE"
    return {"authType": auth_type.upper()}
