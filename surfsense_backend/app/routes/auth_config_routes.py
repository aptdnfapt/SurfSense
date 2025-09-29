from fastapi import APIRouter, Request

from app.config import config


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config")
async def get_auth_config(request: Request):
    auth_type = (config.AUTH_TYPE or "GOOGLE").upper()
    etl_service = (config.ETL_SERVICE or "UNSTRUCTURED").upper()

    base_url = str(request.base_url).rstrip("/")

    return {
        "authType": auth_type,
        "etlService": etl_service,
        "backendBaseUrl": base_url,
    }
