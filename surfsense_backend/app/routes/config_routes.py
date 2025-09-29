from fastapi import APIRouter

from app.config import config


router = APIRouter(prefix="/config", tags=["config"])


@router.get("/auth-type")
async def get_auth_type():
    return {"auth_type": config.AUTH_TYPE}
