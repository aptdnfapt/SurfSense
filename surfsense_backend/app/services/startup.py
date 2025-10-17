"""
Startup service for downloading ML models on first run.
Models are stored in persistent volumes, not baked into Docker images.
"""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def check_and_download_models():
    """
    Check if models are needed and download them if missing.
    This runs once during application startup.
    """
    etl_service = os.getenv("ETL_SERVICE", "UNSTRUCTURED")
    model_path = Path(os.getenv("MODEL_PATH", "/app/models"))
    model_path.mkdir(parents=True, exist_ok=True)

    logger.info(f"Model check: ETL_SERVICE={etl_service}")

    # Cloud services don't need local models
    if etl_service == "LLAMACLOUD":
        logger.info("ETL_SERVICE=LLAMACLOUD: No local models needed")
        return

    # Check and download based on service
    if etl_service == "DOCLING":
        _check_docling_models(model_path)
    elif etl_service == "UNSTRUCTURED":
        _check_unstructured_models(model_path)
    else:
        logger.warning(f"Unknown ETL_SERVICE: {etl_service}")


def _check_docling_models(model_path: Path):
    """Check and download Docling models if needed."""
    # Docling stores models in HuggingFace cache, not in our custom path
    # But we'll still check if initialization works without download
    import os
    from pathlib import Path as P
    
    hf_cache_path = P.home() / ".cache" / "huggingface" / "hub"
    
    logger.info("Checking Docling models (stored in HuggingFace cache)...")
    
    try:
        # Import and initialize to trigger model download if needed
        from docling.document_converter import DocumentConverter
        
        # This will download models if they're not already cached
        _ = DocumentConverter()
        
        logger.info("✅ Docling models ready (cached in HuggingFace cache)")
    except Exception as e:
        logger.error(f"❌ Failed to prepare Docling models: {e}")
        raise


def _check_unstructured_models(model_path: Path):
    """Check and download EasyOCR models if needed."""
    easyocr_path = model_path / "easyocr"
    
    if easyocr_path.exists() and any(easyocr_path.iterdir()):
        logger.info("✓ EasyOCR models already cached")
        return

    logger.info("Downloading EasyOCR models (first run)...")
    try:
        import easyocr
        
        # Initialize reader (triggers model download)
        _ = easyocr.Reader(['en'], model_storage_directory=str(easyocr_path))
        
        logger.info("✅ EasyOCR models downloaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to download EasyOCR models: {e}")
        raise
