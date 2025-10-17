# Docker Runtime Configuration Migration Plan
**Version:** 1.0  
**Date:** January 2025  
**Project:** SurfSense  
**Goal:** Fix build-time configuration issues and create proper dev/prod Docker setups

---

## 🎯 Overview

**Problems We're Solving:**
1. ❌ Frontend uses `NEXT_PUBLIC_*` variables (baked at build time)
2. ❌ Models baked into Docker images (huge 3-5GB images)
3. ❌ No dev/prod Docker separation (only dev mode with hot reload)
4. ❌ Users can't change config without rebuilding images

**Solutions:**
1. ✅ Backend `/api/v1/config` endpoint (runtime config)
2. ✅ Frontend fetches config at runtime (no more `NEXT_PUBLIC_*`)
3. ✅ Models download on first run (stored in volumes)
4. ✅ Separate dev/prod Dockerfiles

---

## 📋 Prerequisites for AI Agents

**Available Tools:**
- ✅ Bash/shell commands
- ✅ curl for API testing
- ✅ Docker CLI commands
- ✅ File creation/editing tools

**Project Info:**
- Backend: Python/FastAPI (no existing tests)
- Frontend: Next.js/React (no existing tests)
- Testing approach: Manual testing with curl + visual browser checks

**Testing Strategy:**
- Use curl to test API endpoints
- Use docker logs to verify behavior
- Manual browser testing for UI changes
- Create temporary test scripts if needed (delete after validation)

---

## 🚀 Phase 1: Docker Development Environment Setup

### Goal
Create dev Dockerfiles with hot reload so we can develop and test everything in Docker without installing dependencies on host.

### Files to Create

#### 1.1: `surfsense_backend/Dockerfile.dev`
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Update certificates
RUN update-ca-certificates
RUN pip install --upgrade certifi pip-system-certs

# Copy requirements
COPY pyproject.toml uv.lock ./

# Install Python dependencies
RUN pip install --no-cache-dir uv && \
    uv pip install --system --no-cache-dir -e .

# Set SSL environment variables
ENV SSL_CERT_FILE=/usr/local/lib/python3.12/site-packages/certifi/cacert.pem
ENV REQUESTS_CA_BUNDLE=/usr/local/lib/python3.12/site-packages/certifi/cacert.pem
ENV PYTHONPATH=/app
ENV UVICORN_LOOP=asyncio

# Volume mount will override this during development
COPY . .

EXPOSE 8000

# Development server with hot reload
CMD ["python", "main.py", "--reload"]
```

#### 1.2: `surfsense_web/Dockerfile.dev`
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy config file to avoid fumadocs-mdx postinstall error
COPY source.config.ts ./
COPY content ./content

# Install dependencies
RUN pnpm install --ignore-scripts
RUN pnpm fumadocs-mdx

# Volume mount will override this during development
COPY . .

EXPOSE 3000

# Development mode with hot reload
CMD ["pnpm", "dev"]
```

#### 1.3: `docker-compose.dev.yml`
```yaml
version: '3.8'

services:
  db:
    image: ankane/pgvector:latest
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-surfsense}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./surfsense_backend
      dockerfile: Dockerfile.dev
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    volumes:
      # Mount source code for hot reload
      - ./surfsense_backend:/app
      # Create volume for models (so they persist)
      - backend_models:/app/models
    depends_on:
      db:
        condition: service_healthy
    env_file:
      - ./surfsense_backend/.env
    environment:
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-surfsense}
      - PYTHONPATH=/app
      - UVICORN_LOOP=asyncio

  frontend:
    build:
      context: ./surfsense_web
      dockerfile: Dockerfile.dev
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    volumes:
      # Mount source code for hot reload
      - ./surfsense_web:/app
      # Exclude node_modules (use container's version)
      - /app/node_modules
      - /app/.next
    depends_on:
      - backend
    env_file:
      - ./surfsense_web/.env
    environment:
      - NODE_ENV=development

  pgadmin:
    image: dpage/pgadmin4
    ports:
      - "${PGADMIN_PORT:-5050}:80"
    environment:
      - PGADMIN_DEFAULT_EMAIL=${PGADMIN_DEFAULT_EMAIL:-admin@surfsense.com}
      - PGADMIN_DEFAULT_PASSWORD=${PGADMIN_DEFAULT_PASSWORD:-surfsense}
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    depends_on:
      - db

volumes:
  postgres_data:
  pgadmin_data:
  backend_models:
```

### Testing & Validation

#### Test 1: Build and Start Dev Environment
```bash
# Build dev images
docker-compose -f docker-compose.dev.yml build

# Start services
docker-compose -f docker-compose.dev.yml up -d

# Check all services are running
docker-compose -f docker-compose.dev.yml ps

# Expected: All services should show "Up" status
```

#### Test 2: Verify Hot Reload (Backend)
```bash
# Make a test change to backend
echo "# Test change" >> surfsense_backend/app/config/__init__.py

# Check backend logs (should show reload)
docker-compose -f docker-compose.dev.yml logs backend | tail -20

# Expected: Should see "Detected changes, reloading..." message

# Revert the test change
git checkout surfsense_backend/app/config/__init__.py
```

#### Test 3: Verify Hot Reload (Frontend)
```bash
# Make a test change to frontend
echo "// Test change" >> surfsense_web/app/layout.tsx

# Check frontend logs (should show fast refresh)
docker-compose -f docker-compose.dev.yml logs frontend | tail -20

# Expected: Should see compilation messages

# Revert the test change
git checkout surfsense_web/app/layout.tsx
```

#### Test 4: Verify API is Accessible
```bash
# Test backend health
curl -s http://localhost:8000/docs

# Expected: Should return HTML (FastAPI docs page)

# Test frontend
curl -s http://localhost:3000

# Expected: Should return HTML (Next.js page)
```

### Success Criteria
- ✅ All services start without errors
- ✅ Backend code changes trigger auto-reload
- ✅ Frontend code changes trigger fast refresh
- ✅ APIs are accessible on localhost
- ✅ Database is healthy and accessible

### Troubleshooting
```bash
# View all logs
docker-compose -f docker-compose.dev.yml logs -f

# Restart specific service
docker-compose -f docker-compose.dev.yml restart backend

# Rebuild if dependencies changed
docker-compose -f docker-compose.dev.yml build --no-cache backend

# Check service health
docker-compose -f docker-compose.dev.yml exec backend curl -f http://localhost:8000/docs || echo "Backend not ready"
```

---

## 🔌 Phase 2: Backend Config Endpoint

### Goal
Create `/api/v1/config` endpoint that returns safe runtime configuration (no secrets).

### Files to Create

#### 2.1: `surfsense_backend/app/routes/config_routes.py`
```python
"""
Configuration endpoint for runtime configuration.
Returns safe, non-sensitive configuration values for frontend consumption.
"""

from fastapi import APIRouter
from app.config import config

router = APIRouter()


@router.get("/api/v1/config")
async def get_frontend_config():
    """
    Returns safe frontend configuration that can be loaded at runtime.

    SECURITY: Only non-sensitive values are returned.
    - Never expose: API keys, OAuth secrets, database URLs, etc.
    - Only expose: UI configuration, feature flags, safe metadata
    """
    auth_type = config.AUTH_TYPE or "GOOGLE"
    etl_service = config.ETL_SERVICE or "UNSTRUCTURED"

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
```

### Files to Modify

#### 2.2: `surfsense_backend/app/routes/__init__.py`
**Action:** Add config router import and include it

**Find this section:**
```python
from .llm_config_routes import router as llm_config_router
from .logs_routes import router as logs_router
```

**Add after it:**
```python
from .config_routes import router as config_router
```

**Find this section:**
```python
router.include_router(llm_config_router)
router.include_router(logs_router)
```

**Add after it:**
```python
router.include_router(config_router)
```

#### 2.3: `surfsense_backend/main.py`
**No changes needed** - The config router is automatically included via `app/routes/__init__.py`

### Testing & Validation

#### Test 1: Endpoint Exists
```bash
# Test config endpoint
curl -s http://localhost:8000/api/v1/config | python3 -m json.tool

# Expected output:
# {
#     "authType": "GOOGLE",
#     "etlService": "UNSTRUCTURED",
#     "backendUrl": "http://localhost:8000",
#     "features": {
#         "googleAuthEnabled": true,
#         "localAuthEnabled": false
#     }
# }
```

#### Test 2: Config Changes at Runtime
```bash
# Change AUTH_TYPE in backend .env file
sed -i 's/AUTH_TYPE=GOOGLE/AUTH_TYPE=LOCAL/' surfsense_backend/.env

# Restart backend (hot reload should pick it up, but restart to be sure)
docker-compose -f docker-compose.dev.yml restart backend

# Wait for backend to start
sleep 5

# Test again
curl -s http://localhost:8000/api/v1/config | python3 -m json.tool

# Expected: Should show localAuthEnabled: true, googleAuthEnabled: false

# Revert change
sed -i 's/AUTH_TYPE=LOCAL/AUTH_TYPE=GOOGLE/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend
```

#### Test 3: No Secrets Exposed
```bash
# Check that secrets are NOT in response
curl -s http://localhost:8000/api/v1/config | grep -i "secret\|password\|api_key"

# Expected: No output (grep should find nothing)
```

#### Test 4: API Documentation
```bash
# Check Swagger docs include new endpoint
curl -s http://localhost:8000/docs | grep -i "config"

# Expected: Should find "/api/v1/config" in the docs

# Or visit in browser: http://localhost:8000/docs
# Look for GET /api/v1/config endpoint
```

### Success Criteria
- ✅ `/api/v1/config` endpoint returns JSON
- ✅ Response includes authType, etlService, features
- ✅ No secrets (API keys, passwords, tokens) in response
- ✅ Config changes when backend .env changes
- ✅ Endpoint appears in Swagger docs

### Troubleshooting
```bash
# Check backend logs for errors
docker-compose -f docker-compose.dev.yml logs backend | grep -i error

# Test if backend is responding at all
curl -v http://localhost:8000/docs

# Check if routes are registered
docker-compose -f docker-compose.dev.yml exec backend python -c "
from app.routes import router
print([route.path for route in router.routes])
"
```

---

## 🎨 Phase 3: Frontend Simple Config System

### Goal
Create a simple config manager that fetches from backend at runtime, replacing all `NEXT_PUBLIC_*` usage.

### Files to Create

#### 3.1: `surfsense_web/lib/config.ts`
```typescript
/**
 * Simple runtime configuration manager
 * Fetches config from backend at runtime instead of using build-time NEXT_PUBLIC_* variables
 */

export interface AppConfig {
  authType: "GOOGLE" | "LOCAL";
  etlService: "UNSTRUCTURED" | "LLAMACLOUD" | "DOCLING";
  backendUrl: string;
  features: {
    googleAuthEnabled: boolean;
    localAuthEnabled: boolean;
  };
}

let cachedConfig: AppConfig | null = null;
let configPromise: Promise<AppConfig> | null = null;

/**
 * Fetch configuration from backend
 * Results are cached to avoid repeated API calls
 */
export async function fetchConfig(): Promise<AppConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // If fetch is in progress, return existing promise
  if (configPromise) {
    return configPromise;
  }

  // Start new fetch
  configPromise = (async () => {
    try {
      // First try to get backend URL from env (for server-side)
      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || 'http://localhost:8000';
      
      const response = await fetch(`${backendUrl}/api/v1/config`, {
        cache: 'no-store', // Always fetch fresh config
      });

      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`);
      }

      const config = await response.json();
      
      // Override backendUrl with the one we used to fetch
      config.backendUrl = backendUrl;
      
      cachedConfig = config;
      return config;
    } catch (error) {
      console.error('Failed to fetch config, using defaults:', error);
      
      // Fallback to safe defaults
      const fallbackConfig: AppConfig = {
        authType: 'GOOGLE',
        etlService: 'UNSTRUCTURED',
        backendUrl: process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || 'http://localhost:8000',
        features: {
          googleAuthEnabled: true,
          localAuthEnabled: false,
        },
      };
      
      cachedConfig = fallbackConfig;
      return fallbackConfig;
    }
  })();

  return configPromise;
}

/**
 * React hook for config
 * Use this in client components
 */
export function useConfig() {
  const [config, setConfig] = React.useState<AppConfig | null>(null);

  React.useEffect(() => {
    fetchConfig().then(setConfig);
  }, []);

  return config;
}

// For direct access (use sparingly)
export function getConfig(): AppConfig | null {
  return cachedConfig;
}

// Import React for hook
import React from 'react';
```

### Files to Modify (High Priority - Core Functionality)

#### 3.2: `surfsense_web/lib/api.ts`
**Action:** Replace hardcoded backend URL with runtime config

**Find this:**
```typescript
const baseUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL;

if (!baseUrl) {
  console.error("NEXT_PUBLIC_FASTAPI_BACKEND_URL is not defined");
  throw new Error("Backend URL is not configured");
}
```

**Replace with:**
```typescript
import { getConfig } from './config';

function getBackendUrl(): string {
  // Try cached config first
  const config = getConfig();
  if (config) {
    return config.backendUrl;
  }
  
  // Fallback to env variable during initial load
  const baseUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || 'http://localhost:8000';
  return baseUrl;
}

const baseUrl = getBackendUrl();
```

#### 3.3: `surfsense_web/app/(home)/login/page.tsx`
**Action:** Use runtime authType

**Find this:**
```typescript
setAuthType(process.env.NEXT_PUBLIC_FASTAPI_BACKEND_AUTH_TYPE || "GOOGLE");
```

**Replace with:**
```typescript
import { fetchConfig } from '@/lib/config';

// Inside component's useEffect:
useEffect(() => {
  fetchConfig().then(config => {
    setAuthType(config.authType);
  });
}, []);
```

#### 3.4: `surfsense_web/app/(home)/login/LocalLoginForm.tsx`
**Action:** Same as above - use runtime authType

**Find this:**
```typescript
setAuthType(process.env.NEXT_PUBLIC_FASTAPI_BACKEND_AUTH_TYPE || "GOOGLE");
```

**Replace with:**
```typescript
import { fetchConfig } from '@/lib/config';

// Inside component's useEffect:
useEffect(() => {
  fetchConfig().then(config => {
    setAuthType(config.authType);
  });
}, []);
```

#### 3.5: `surfsense_web/app/(home)/register/page.tsx`
**Action:** Use runtime authType

**Find this:**
```typescript
const authType = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_AUTH_TYPE || "GOOGLE";
```

**Replace with:**
```typescript
import { fetchConfig } from '@/lib/config';

const [authType, setAuthType] = useState<string>("GOOGLE");

useEffect(() => {
  fetchConfig().then(config => {
    setAuthType(config.authType);
  });
}, []);
```

**Also find:**
```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL}/auth/register`, {
```

**Replace with:**
```typescript
import { getConfig } from '@/lib/config';

const config = getConfig();
const backendUrl = config?.backendUrl || process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || 'http://localhost:8000';
const response = await fetch(`${backendUrl}/auth/register`, {
```

#### 3.6: `surfsense_web/app/dashboard/[search_space_id]/documents/upload/page.tsx`
**Action:** Use runtime ETL service

**Find this:**
```typescript
const etlService = process.env.NEXT_PUBLIC_ETL_SERVICE;
```

**Replace with:**
```typescript
import { fetchConfig } from '@/lib/config';

const [etlService, setEtlService] = useState<string>("UNSTRUCTURED");

useEffect(() => {
  fetchConfig().then(config => {
    setEtlService(config.etlService);
  });
}, []);
```

### Testing & Validation

#### Test 1: Config Library Works
```bash
# Create a temporary test file
cat > surfsense_web/test_config.ts << 'EOF'
import { fetchConfig } from './lib/config';

async function test() {
  console.log('Fetching config...');
  const config = await fetchConfig();
  console.log('Config:', JSON.stringify(config, null, 2));
  
  // Test caching
  const config2 = await fetchConfig();
  console.log('Cached config (should be instant):', JSON.stringify(config2, null, 2));
}

test();
EOF

# Run the test (inside container)
docker-compose -f docker-compose.dev.yml exec frontend npx tsx test_config.ts

# Expected: Should print config twice (second should be cached)

# Clean up
rm surfsense_web/test_config.ts
```

#### Test 2: Login Page Uses Runtime Config
```bash
# Visit login page in browser
echo "Open browser to: http://localhost:3000/login"

# Check browser console for any errors
# Should not see "NEXT_PUBLIC_FASTAPI_BACKEND_AUTH_TYPE is not defined"

# Test changing auth type
sed -i 's/AUTH_TYPE=GOOGLE/AUTH_TYPE=LOCAL/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend

# Refresh browser - should see different login UI (local vs Google)

# Revert
sed -i 's/AUTH_TYPE=LOCAL/AUTH_TYPE=GOOGLE/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend
```

#### Test 3: Upload Page Uses Runtime ETL Service
```bash
# This requires manual browser testing
echo "1. Open browser to: http://localhost:3000/dashboard"
echo "2. Create/select a search space"
echo "3. Go to Documents > Upload"
echo "4. Check accepted file types match ETL_SERVICE from backend"

# Change ETL service
sed -i 's/ETL_SERVICE=UNSTRUCTURED/ETL_SERVICE=DOCLING/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend

echo "5. Refresh upload page"
echo "6. Accepted file types should change"

# Revert
sed -i 's/ETL_SERVICE=DOCLING/ETL_SERVICE=UNSTRUCTURED/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend
```

#### Test 4: No Build Required for Config Changes
```bash
# Change backend config
sed -i 's/AUTH_TYPE=GOOGLE/AUTH_TYPE=LOCAL/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend

# Wait a moment
sleep 3

# Test config endpoint
curl -s http://localhost:8000/api/v1/config | python3 -m json.tool

# Expected: Should show localAuthEnabled: true WITHOUT rebuilding frontend

# Visit frontend (no rebuild needed)
curl -s http://localhost:3000/login | grep -i "local"

# Revert
sed -i 's/AUTH_TYPE=LOCAL/AUTH_TYPE=GOOGLE/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend
```

### Success Criteria
- ✅ Config library successfully fetches from backend
- ✅ Login page shows correct auth UI based on runtime config
- ✅ Upload page shows correct file types based on runtime ETL service
- ✅ Config changes without frontend rebuild
- ✅ No errors in browser console

### Remaining Files to Update (Lower Priority)

These files also use `NEXT_PUBLIC_*` variables. Update them following the same pattern as above:

**API Call Files (~15 files):**
- `surfsense_web/app/dashboard/page.tsx`
- `surfsense_web/app/dashboard/searchspaces/page.tsx`
- `surfsense_web/app/dashboard/[search_space_id]/chats/chats-client.tsx`
- `surfsense_web/app/dashboard/[search_space_id]/researcher/[[...chat_id]]/page.tsx`
- `surfsense_web/app/dashboard/[search_space_id]/documents/youtube/page.tsx`
- `surfsense_web/app/dashboard/[search_space_id]/documents/webpage/page.tsx`
- `surfsense_web/app/dashboard/[search_space_id]/connectors/add/*.tsx` (4 files)
- `surfsense_web/hooks/use-*.ts` (11 files)

**Pattern to follow:**
```typescript
// OLD:
`${process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL}/api/v1/...`

// NEW:
import { getConfig } from '@/lib/config';
const config = getConfig();
const backendUrl = config?.backendUrl || 'http://localhost:8000';
`${backendUrl}/api/v1/...`
```

### Troubleshooting
```bash
# Check frontend build for errors
docker-compose -f docker-compose.dev.yml logs frontend | grep -i error

# Test if config fetch is working
docker-compose -f docker-compose.dev.yml exec frontend curl -s http://backend:8000/api/v1/config

# Check if files have syntax errors
docker-compose -f docker-compose.dev.yml exec frontend pnpm lint
```

---

## 🤖 Phase 4: Model Management

### Goal
Stop baking models into Docker images. Download models on first run and store them in Docker volumes.

### Files to Create

#### 4.1: `surfsense_backend/app/services/startup.py`
```python
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
    docling_path = model_path / "docling"
    
    if docling_path.exists() and any(docling_path.iterdir()):
        logger.info("✓ Docling models already cached")
        return

    logger.info("Downloading Docling models (first run)...")
    try:
        # Import triggers model download
        from docling.document_converter import DocumentConverter
        
        # Initialize to download models
        _ = DocumentConverter()
        
        logger.info("✅ Docling models downloaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to download Docling models: {e}")
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
```

### Files to Modify

#### 4.2: `surfsense_backend/main.py`
**Action:** Call model check during startup

**Find this section (near the top):**
```python
import uvicorn
from app.app import app
```

**Add after it:**
```python
from app.services.startup import check_and_download_models
import logging

logger = logging.getLogger(__name__)
```

**Find this section (near the bottom, before `if __name__ == "__main__":`):**
```python
if __name__ == "__main__":
    # ... existing code ...
```

**Add BEFORE the `if __name__ == "__main__":` block:**
```python
# Check and download models on startup
try:
    logger.info("Checking ML models...")
    check_and_download_models()
    logger.info("Model check complete")
except Exception as e:
    logger.error(f"Model check failed: {e}")
    logger.warning("Application will start but model-dependent features may not work")
```

### Testing & Validation

#### Test 1: Models Download on First Run
```bash
# Remove existing models
docker-compose -f docker-compose.dev.yml down -v
docker volume rm surfsense_backend_models 2>/dev/null || true

# Restart services
docker-compose -f docker-compose.dev.yml up -d backend

# Watch logs for model download
docker-compose -f docker-compose.dev.yml logs -f backend | grep -i "model"

# Expected: Should see "Downloading ... models (first run)" messages
# Wait for "✅ models downloaded successfully"

# Press Ctrl+C when done
```

#### Test 2: Models Persist Across Restarts
```bash
# Restart backend
docker-compose -f docker-compose.dev.yml restart backend

# Watch logs
docker-compose -f docker-compose.dev.yml logs backend | grep -i "model"

# Expected: Should see "✓ models already cached" (no download)
```

#### Test 3: Switching ETL Services
```bash
# Change to DOCLING
sed -i 's/ETL_SERVICE=UNSTRUCTURED/ETL_SERVICE=DOCLING/' surfsense_backend/.env

# Restart backend
docker-compose -f docker-compose.dev.yml restart backend

# Watch logs
docker-compose -f docker-compose.dev.yml logs -f backend | grep -i "model"

# Expected: Should download Docling models if not cached

# Change back
sed -i 's/ETL_SERVICE=DOCLING/ETL_SERVICE=UNSTRUCTURED/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend
```

#### Test 4: LLAMACLOUD Doesn't Download Models
```bash
# Change to LLAMACLOUD
sed -i 's/ETL_SERVICE=UNSTRUCTURED/ETL_SERVICE=LLAMACLOUD/' surfsense_backend/.env

# Restart backend
docker-compose -f docker-compose.dev.yml restart backend

# Watch logs
docker-compose -f docker-compose.dev.yml logs backend | grep -i "model"

# Expected: Should see "No local models needed"

# Change back
sed -i 's/ETL_SERVICE=LLAMACLOUD/ETL_SERVICE=UNSTRUCTURED/' surfsense_backend/.env
docker-compose -f docker-compose.dev.yml restart backend
```

### Success Criteria
- ✅ Models download automatically on first run
- ✅ Models persist in Docker volume across restarts
- ✅ Second startup uses cached models (instant)
- ✅ Different ETL services download appropriate models
- ✅ LLAMACLOUD mode doesn't download local models

### Troubleshooting
```bash
# Check volume contents
docker-compose -f docker-compose.dev.yml exec backend ls -la /app/models/

# Check if models directory is writable
docker-compose -f docker-compose.dev.yml exec backend touch /app/models/test.txt

# View full startup logs
docker-compose -f docker-compose.dev.yml logs backend | head -100

# Manually trigger model download
docker-compose -f docker-compose.dev.yml exec backend python -c "
from app.services.startup import check_and_download_models
check_and_download_models()
"
```

---

## 🚀 Phase 5: Production Dockerfiles

### Goal
Create optimized production Docker images that:
- Don't include development dependencies
- Are smaller in size
- Don't have hot reload
- Build optimized production code

### Files to Create

#### 5.1: `surfsense_backend/Dockerfile.prod`
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install essential system dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    ca-certificates \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Update certificates
RUN update-ca-certificates
RUN pip install --upgrade certifi pip-system-certs

# Copy requirements
COPY pyproject.toml uv.lock ./

# Install Python dependencies
RUN pip install --no-cache-dir uv && \
    uv pip install --system --no-cache-dir -e .

# Set SSL environment variables
ENV SSL_CERT_FILE=/usr/local/lib/python3.12/site-packages/certifi/cacert.pem
ENV REQUESTS_CA_BUNDLE=/usr/local/lib/python3.12/site-packages/certifi/cacert.pem
ENV PYTHONPATH=/app
ENV UVICORN_LOOP=asyncio
ENV MODEL_PATH=/app/models

# Copy source code
COPY . .

EXPOSE 8000

# Production server (NO --reload flag)
CMD ["python", "main.py"]
```

#### 5.2: `surfsense_web/Dockerfile.prod`
```dockerfile
# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

# Stage 1: Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# Stage 2: Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for production build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN corepack enable pnpm && pnpm build

# Stage 3: Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Copy built files (standalone mode)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

#### 5.3: Update `surfsense_web/next.config.ts`
**Action:** Enable standalone output for production

**Find this:**
```typescript
const config: NextConfig = {
  // ... existing config
};
```

**Add inside the config object:**
```typescript
const config: NextConfig = {
  // ... existing config
  
  // Enable standalone output for optimized production Docker images
  output: 'standalone',
};
```

#### 5.4: `docker-compose.prod.yml`
```yaml
version: '3.8'

services:
  db:
    image: ankane/pgvector:latest
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-surfsense}
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 30s
      timeout: 10s
      retries: 3

  backend:
    build:
      context: ./surfsense_backend
      dockerfile: Dockerfile.prod
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    depends_on:
      db:
        condition: service_healthy
    environment:
      # Core configuration
      - DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-surfsense}
      - PYTHONPATH=/app
      - UVICORN_LOOP=asyncio
      
      # Runtime configuration (users can change these)
      - AUTH_TYPE=${AUTH_TYPE:-GOOGLE}
      - ETL_SERVICE=${ETL_SERVICE:-UNSTRUCTURED}
      - SECRET_KEY=${SECRET_KEY}
      - NEXT_FRONTEND_URL=${NEXT_FRONTEND_URL:-http://frontend:3000}
      
      # Model management
      - MODEL_PATH=/app/models
      
      # Google OAuth (if AUTH_TYPE=GOOGLE)
      - GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}
      - GOOGLE_OAUTH_CLIENT_SECRET=${GOOGLE_OAUTH_CLIENT_SECRET}
      - GOOGLE_CALENDAR_REDIRECT_URI=${GOOGLE_CALENDAR_REDIRECT_URI}
      - GOOGLE_GMAIL_REDIRECT_URI=${GOOGLE_GMAIL_REDIRECT_URI}
      
      # API Keys
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - LLAMA_CLOUD_API_KEY=${LLAMA_CLOUD_API_KEY}
      - UNSTRUCTURED_API_KEY=${UNSTRUCTURED_API_KEY}
      
      # Embedding and reranking
      - EMBEDDING_MODEL=${EMBEDDING_MODEL:-mixedbread-ai/mxbai-embed-large-v1}
      - RERANKERS_MODEL_NAME=${RERANKERS_MODEL_NAME:-ms-marco-MiniLM-L-12-v2}
      - RERANKERS_MODEL_TYPE=${RERANKERS_MODEL_TYPE:-flashrank}
      
      # TTS/STT services
      - TTS_SERVICE=${TTS_SERVICE}
      - TTS_SERVICE_API_KEY=${TTS_SERVICE_API_KEY}
      - TTS_SERVICE_API_BASE=${TTS_SERVICE_API_BASE}
      - STT_SERVICE=${STT_SERVICE}
      - STT_SERVICE_API_KEY=${STT_SERVICE_API_KEY}
      - STT_SERVICE_API_BASE=${STT_SERVICE_API_BASE}
      
    volumes:
      # Persistent model storage
      - backend_models:/app/models
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/docs"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  frontend:
    build:
      context: ./surfsense_web
      dockerfile: Dockerfile.prod
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    depends_on:
      - backend
    environment:
      - NODE_ENV=production
      # Backend URL for server-side config fetching
      - NEXT_PUBLIC_FASTAPI_BACKEND_URL=http://backend:8000
    restart: unless-stopped

  pgadmin:
    image: dpage/pgadmin4
    ports:
      - "${PGADMIN_PORT:-5050}:80"
    environment:
      - PGADMIN_DEFAULT_EMAIL=${PGADMIN_DEFAULT_EMAIL:-admin@surfsense.com}
      - PGADMIN_DEFAULT_PASSWORD=${PGADMIN_DEFAULT_PASSWORD:-surfsense}
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    depends_on:
      - db
    restart: unless-stopped

volumes:
  postgres_data:
  pgadmin_data:
  backend_models:
```

#### 5.5: `.env.production` (template)
```bash
# Production Environment Template
# Copy this to .env and fill in your values

# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=surfsense
POSTGRES_PORT=5432

# Backend Configuration
BACKEND_PORT=8000
SECRET_KEY=your_super_secure_secret_key_here_at_least_32_characters

# Frontend Configuration
FRONTEND_PORT=3000
NEXT_FRONTEND_URL=http://localhost:3000

# Authentication Type: GOOGLE or LOCAL
AUTH_TYPE=GOOGLE

# Google OAuth (required if AUTH_TYPE=GOOGLE)
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALENDAR_REDIRECT_URI=http://yourdomain.com:8000/api/v1/auth/google/calendar/connector/callback
GOOGLE_GMAIL_REDIRECT_URI=http://yourdomain.com:8000/api/v1/auth/google/gmail/connector/callback

# ETL Service: UNSTRUCTURED, LLAMACLOUD, or DOCLING
ETL_SERVICE=UNSTRUCTURED

# API Keys
FIRECRAWL_API_KEY=your_firecrawl_api_key
LLAMA_CLOUD_API_KEY=your_llama_cloud_api_key
UNSTRUCTURED_API_KEY=your_unstructured_api_key

# Embedding Model
EMBEDDING_MODEL=mixedbread-ai/mxbai-embed-large-v1

# Reranker Configuration
RERANKERS_MODEL_NAME=ms-marco-MiniLM-L-12-v2
RERANKERS_MODEL_TYPE=flashrank

# TTS Service
TTS_SERVICE=openai/tts-1
TTS_SERVICE_API_KEY=your_tts_api_key
TTS_SERVICE_API_BASE=

# STT Service
STT_SERVICE=openai/whisper-1
STT_SERVICE_API_KEY=your_stt_api_key
STT_SERVICE_API_BASE=

# pgAdmin Configuration
PGADMIN_PORT=5050
PGADMIN_DEFAULT_EMAIL=admin@surfsense.com
PGADMIN_DEFAULT_PASSWORD=surfsense
```

### Testing & Validation

#### Test 1: Build Production Images
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Check image sizes
docker images | grep surfsense

# Expected: Images should be smaller than dev images
# Backend: ~2-3GB (without baked models)
# Frontend: ~200-500MB (optimized build)
```

#### Test 2: Run Production Setup
```bash
# Start production environment
docker-compose -f docker-compose.prod.yml up -d

# Check all services are running
docker-compose -f docker-compose.prod.yml ps

# Expected: All services show "Up" status
```

#### Test 3: Verify Production Behavior
```bash
# Test backend API
curl -s http://localhost:8000/api/v1/config | python3 -m json.tool

# Test frontend
curl -s http://localhost:3000

# Test that hot reload is disabled
# Make a code change (it should NOT auto-reload)
echo "# Test" >> surfsense_backend/app/config/__init__.py

# Check logs (should NOT show reload)
docker-compose -f docker-compose.prod.yml logs backend | grep -i reload

# Revert test change
git checkout surfsense_backend/app/config/__init__.py
```

#### Test 4: Verify Models Work in Production
```bash
# Models should download on first run (check logs)
docker-compose -f docker-compose.prod.yml logs backend | grep -i "model"

# Expected: Should see model download or cache hit messages

# Restart and verify models persist
docker-compose -f docker-compose.prod.yml restart backend
docker-compose -f docker-compose.prod.yml logs backend | grep -i "model"

# Expected: Should see "already cached" (no re-download)
```

#### Test 5: Config Changes Work Without Rebuild
```bash
# Create a test .env file
cp .env.production .env
sed -i 's/AUTH_TYPE=GOOGLE/AUTH_TYPE=LOCAL/' .env

# Restart only backend (no rebuild)
docker-compose -f docker-compose.prod.yml restart backend

# Test config
curl -s http://localhost:8000/api/v1/config | python3 -m json.tool

# Expected: Should show localAuthEnabled: true

# Clean up
rm .env
```

### Success Criteria
- ✅ Production images build successfully
- ✅ Images are smaller than dev images
- ✅ All services start and run
- ✅ No hot reload in production mode
- ✅ Models download and persist correctly
- ✅ Config changes work without rebuilding

### Troubleshooting
```bash
# View build logs if build fails
docker-compose -f docker-compose.prod.yml build --no-cache

# Check for errors in services
docker-compose -f docker-compose.prod.yml logs

# Compare dev vs prod image sizes
docker images | grep surfsense

# Test health checks
docker-compose -f docker-compose.prod.yml exec backend curl -f http://localhost:8000/docs
docker-compose -f docker-compose.prod.yml exec frontend curl -f http://localhost:3000
```

---

## 📝 Phase 6: Cleanup & Documentation

### Goal
Remove old build-time variables, update documentation, and clean up old files.

### Files to Modify

#### 6.1: `.env.example` (root)
**Action:** Add note about new system

**Add at the top:**
```bash
# SurfSense Environment Configuration
# This file contains Docker-level configuration only
# Application configuration is in surfsense_backend/.env and surfsense_web/.env

# NOTE: NEXT_PUBLIC_* variables are NO LONGER NEEDED
# Frontend now fetches configuration from backend at runtime
# See DOCKER_RUNTIME_CONFIG_MIGRATION_PLAN.md for details

# Frontend Configuration
FRONTEND_PORT=3000

# Backend Configuration  
BACKEND_PORT=8000

# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=surfsense
POSTGRES_PORT=5432

# pgAdmin Configuration
PGADMIN_PORT=5050
PGADMIN_DEFAULT_EMAIL=admin@surfsense.com
PGADMIN_DEFAULT_PASSWORD=surfsense
```

#### 6.2: `surfsense_web/.env.example`
**Action:** Remove NEXT_PUBLIC_* variables, add note

**Replace entire content with:**
```bash
# SurfSense Frontend Environment Configuration

# NOTE: NEXT_PUBLIC_* variables are NO LONGER USED in production
# The frontend now fetches configuration from the backend at runtime via /api/v1/config
# This allows changing configuration without rebuilding the Docker image

# For local development ONLY (backend URL)
# In production, this is set by docker-compose
NEXT_PUBLIC_FASTAPI_BACKEND_URL=http://localhost:8000

# These are DEPRECATED and will be removed in future versions:
# - NEXT_PUBLIC_FASTAPI_BACKEND_AUTH_TYPE (fetch from /api/v1/config instead)
# - NEXT_PUBLIC_ETL_SERVICE (fetch from /api/v1/config instead)

# Contact Form Database (OPTIONAL - if using contact form feature)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.example.supabase.co:5432/postgres
```

#### 6.3: `DOCKER_SETUP.md`
**Action:** Update documentation with new setup

**Add this section after "Environment Variables Configuration":**

```markdown
## 🎉 NEW: Runtime Configuration System

**What Changed:**
Starting from version 0.0.8, SurfSense uses a runtime configuration system. This means:
- ✅ Change `AUTH_TYPE`, `ETL_SERVICE`, etc. without rebuilding images
- ✅ Restart containers and changes apply immediately
- ✅ Much faster development and deployment workflow

**How it Works:**
1. Backend exposes `/api/v1/config` endpoint with safe configuration
2. Frontend fetches config at startup from this endpoint
3. No more `NEXT_PUBLIC_*` variables baked into JavaScript

**For Detailed Information:**
See `DOCKER_RUNTIME_CONFIG_MIGRATION_PLAN.md` for complete migration guide.

## Development vs Production Setup

### Development Mode (with hot reload)
```bash
# Use dev docker-compose for development
docker-compose -f docker-compose.dev.yml up --build

# Code changes auto-reload (no restart needed)
# Models download once and persist in volumes
```

### Production Mode (optimized)
```bash
# Use prod docker-compose for production
docker-compose -f docker-compose.prod.yml up --build

# Optimized images, no hot reload
# Models download once and persist in volumes
```

## Changing Configuration

**To change authentication type, ETL service, etc.:**

1. Edit `surfsense_backend/.env`:
```bash
AUTH_TYPE=LOCAL  # or GOOGLE
ETL_SERVICE=DOCLING  # or UNSTRUCTURED, LLAMACLOUD
```

2. Restart backend container:
```bash
docker-compose -f docker-compose.dev.yml restart backend
# or for production:
docker-compose -f docker-compose.prod.yml restart backend
```

3. Refresh your browser - changes apply immediately!

**No rebuild needed!** 🎉
```

#### 6.4: Update README.md (if applicable)
**Action:** Add note about new configuration system

**Find the Docker installation section and add:**

```markdown
## 🔄 Configuration Changes

SurfSense now supports runtime configuration! Change settings without rebuilding:

1. Edit `.env` files in `surfsense_backend/` or `surfsense_web/`
2. Restart containers: `docker-compose restart`
3. Changes apply immediately

See [DOCKER_SETUP.md](DOCKER_SETUP.md) for details.
```

#### 6.5: Rename Old Dockerfiles (backup)
```bash
# Backup current Dockerfiles
mv surfsense_backend/Dockerfile surfsense_backend/Dockerfile.old
mv surfsense_web/Dockerfile surfsense_web/Dockerfile.old

# The new dev Dockerfiles become the default
cp surfsense_backend/Dockerfile.dev surfsense_backend/Dockerfile
cp surfsense_web/Dockerfile.dev surfsense_web/Dockerfile
```

### Testing & Validation

#### Test 1: Documentation is Clear
```bash
# Read the updated docs
cat DOCKER_SETUP.md | grep -A 10 "Runtime Configuration"

# Check that it explains the new system
```

#### Test 2: Old Variables Removed
```bash
# Check .env.example files don't have deprecated variables
grep "NEXT_PUBLIC_FASTAPI_BACKEND_AUTH_TYPE" surfsense_web/.env.example

# Expected: Should show deprecation notice, not actual usage
```

#### Test 3: New User Experience
```bash
# Simulate new user following docs
docker-compose -f docker-compose.dev.yml down -v

# Follow the updated DOCKER_SETUP.md instructions
# Should work smoothly with new system
```

### Success Criteria
- ✅ Old `.env.example` files updated
- ✅ Documentation reflects new system
- ✅ Clear instructions for changing config
- ✅ Old Dockerfiles backed up
- ✅ Migration plan document in repository

---

## 🎯 Summary & Validation

### Complete Migration Checklist

**Phase 1: Dev Environment ✅**
- [ ] `Dockerfile.dev` files created
- [ ] `docker-compose.dev.yml` created
- [ ] Hot reload working for both backend and frontend
- [ ] All services start without errors

**Phase 2: Backend Config Endpoint ✅**
- [ ] `/api/v1/config` endpoint returns JSON
- [ ] No secrets exposed in response
- [ ] Config changes when `.env` changes
- [ ] Endpoint documented in Swagger

**Phase 3: Frontend Config System ✅**
- [ ] `lib/config.ts` created and working
- [ ] Login page uses runtime auth type
- [ ] Upload page uses runtime ETL service
- [ ] Config changes work without frontend rebuild
- [ ] All hooks and pages updated (optional: can be done incrementally)

**Phase 4: Model Management ✅**
- [ ] Models download on first run
- [ ] Models persist in Docker volumes
- [ ] Second startup uses cached models
- [ ] Different ETL services download correct models

**Phase 5: Production Setup ✅**
- [ ] Production Dockerfiles build successfully
- [ ] Production images smaller than dev images
- [ ] Production services run without errors
- [ ] No hot reload in production mode
- [ ] Config changes work in production

**Phase 6: Cleanup ✅**
- [ ] Documentation updated
- [ ] `.env.example` files updated
- [ ] Old files backed up
- [ ] Migration plan in repository

### Final Validation Script

Save this as `validate_migration.sh` and run it to verify everything works:

```bash
#!/bin/bash
set -e

echo "🔍 SurfSense Migration Validation Script"
echo "========================================"

echo ""
echo "📋 Phase 1: Dev Environment"
echo "Testing dev setup..."
docker-compose -f docker-compose.dev.yml ps | grep -q "Up" && echo "✅ Dev services running" || echo "❌ Dev services not running"

echo ""
echo "📋 Phase 2: Backend Config Endpoint"
echo "Testing config endpoint..."
curl -sf http://localhost:8000/api/v1/config > /dev/null && echo "✅ Config endpoint works" || echo "❌ Config endpoint failed"
curl -s http://localhost:8000/api/v1/config | grep -q "authType" && echo "✅ Config has authType" || echo "❌ Missing authType"
curl -s http://localhost:8000/api/v1/config | grep -qi "secret" && echo "❌ SECURITY: Secrets exposed!" || echo "✅ No secrets in config"

echo ""
echo "📋 Phase 3: Frontend Config"
echo "Testing frontend..."
curl -sf http://localhost:3000 > /dev/null && echo "✅ Frontend accessible" || echo "❌ Frontend not accessible"

echo ""
echo "📋 Phase 4: Model Management"
echo "Checking model volumes..."
docker volume ls | grep -q "backend_models" && echo "✅ Model volume exists" || echo "❌ Model volume missing"

echo ""
echo "📋 Phase 5: Production Setup"
echo "Checking production images..."
docker images | grep -q "surfsense.*prod" && echo "✅ Production images exist" || echo "⚠️  Production images not built yet"

echo ""
echo "========================================"
echo "✅ Validation complete!"
echo ""
echo "Next steps:"
echo "1. Test changing AUTH_TYPE in backend .env"
echo "2. Restart backend and verify frontend shows correct login"
echo "3. Test model persistence across restarts"
echo "4. Build and test production setup"
```

### Common Issues & Solutions

**Issue: Config endpoint returns 404**
```bash
# Solution: Check if route is registered
docker-compose -f docker-compose.dev.yml logs backend | grep "config"
# Verify config_routes.py is imported in app/routes/__init__.py
```

**Issue: Frontend still uses NEXT_PUBLIC_* variables**
```bash
# Solution: Check if config.ts is being used
grep -r "NEXT_PUBLIC_FASTAPI_BACKEND_URL" surfsense_web/app/
# Update files to use fetchConfig() instead
```

**Issue: Models download on every restart**
```bash
# Solution: Check volume mount
docker volume ls | grep backend_models
# Verify docker-compose.dev.yml has volume mount
```

**Issue: Hot reload not working**
```bash
# Solution: Check volume mounts
docker-compose -f docker-compose.dev.yml exec backend ls -la /app/
# Should show host files, not container files
```

**Issue: Production build fails**
```bash
# Solution: Check Next.js standalone output
cat surfsense_web/next.config.ts | grep standalone
# Should have output: 'standalone'
```

---

## 🎓 AI Agent Guidelines

**For AI Agents Working on This Plan:**

### General Approach
1. **Work phase by phase** - Don't skip ahead
2. **Test after each phase** - Use provided test scripts
3. **Keep backups** - Before modifying files, consider git stash or backups
4. **Read errors carefully** - Docker logs contain useful info
5. **Use provided commands** - Don't invent new testing approaches

### Testing Strategy
```bash
# Always test with:
1. curl commands (for APIs)
2. docker logs (for backend behavior)
3. Manual browser checks (for UI changes)
4. Volume inspection (for model persistence)

# Create temp test files when needed:
/tmp/test_config.sh  # Temporary test scripts
/tmp/test_output.txt # Save test output here

# Delete temp files after validation
```

### Error Handling
```bash
# If a test fails:
1. Check docker logs first: docker-compose -f docker-compose.dev.yml logs backend
2. Verify file syntax: docker-compose -f docker-compose.dev.yml exec backend python -m py_compile app/routes/config_routes.py
3. Check environment: docker-compose -f docker-compose.dev.yml exec backend env | grep AUTH_TYPE
4. Test endpoint manually: curl -v http://localhost:8000/api/v1/config
```

### Docker Commands Reference
```bash
# Start dev environment
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f [service]

# Restart service
docker-compose -f docker-compose.dev.yml restart [service]

# Execute command in container
docker-compose -f docker-compose.dev.yml exec [service] [command]

# Rebuild service
docker-compose -f docker-compose.dev.yml build --no-cache [service]

# Stop everything
docker-compose -f docker-compose.dev.yml down

# Stop and remove volumes (fresh start)
docker-compose -f docker-compose.dev.yml down -v
```

### Progress Tracking
After completing each phase, create a checkpoint:
```bash
# Example checkpoint file
echo "Phase 1 Complete: $(date)" >> /tmp/migration_progress.txt
echo "- Dev environment working" >> /tmp/migration_progress.txt
echo "- Hot reload verified" >> /tmp/migration_progress.txt
```

---

## 📞 Support & Questions

**If you encounter issues not covered in this plan:**

1. Check Docker logs for error messages
2. Verify environment variables are set correctly
3. Ensure all prerequisites are met (Docker installed, ports available)
4. Review the troubleshooting sections in each phase

**For questions about the plan itself:**
- This plan follows a simplified approach compared to the original proposal
- Focus on getting working solutions, not perfect solutions
- Test frequently and incrementally

---

**End of Migration Plan**

*Last Updated: January 2025*  
*Version: 1.0*
