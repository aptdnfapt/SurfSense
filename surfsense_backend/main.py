import argparse
import logging

import uvicorn
from dotenv import load_dotenv

from app.config.uvicorn import load_uvicorn_config
from app.services.startup import check_and_download_models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

load_dotenv()

logger = logging.getLogger(__name__)

# Check and download models on startup
try:
    logger.info("Checking ML models...")
    check_and_download_models()
    logger.info("Model check complete")
except Exception as e:
    logger.error(f"Model check failed: {e}")
    logger.warning("Application will start but model-dependent features may not work")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the SurfSense application")
    parser.add_argument("--reload", action="store_true", help="Enable hot reloading")
    args = parser.parse_args()

    config_kwargs = load_uvicorn_config(args)
    config = uvicorn.Config(**config_kwargs)
    server = uvicorn.Server(config)

    server.run()
