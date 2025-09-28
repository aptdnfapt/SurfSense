# SurfSense Tailscale Setup Guide

This guide helps you set up SurfSense for small team use over Tailscale VPN.

## Prerequisites

- Tailscale installed and configured on your VM/server
- Docker and Docker Compose installed
- SurfSense repository cloned

## Quick Setup for Tailscale

1. **Configure Environment Files**
   ```bash
   # Copy example files
   cp .env.example .env
   cp surfsense_backend/.env.example surfsense_backend/.env
   cp surfsense_web/.env.example surfsense_web/.env

   # Edit with your settings
   nano surfsense_backend/.env  # Add API keys, database settings
   nano surfsense_web/.env      # Configure frontend settings
   ```

2. **Build and Start Services**
   ```bash
   # Build the modified production containers
   docker compose build

   # Start all services
   docker compose up -d
   ```

3. **Access via Tailscale**

   Once running, access SurfSense through your Tailscale IP:

   - **Frontend**: `http://[tailscale-ip]:3000`
   - **Backend API**: `http://[tailscale-ip]:8000`
   - **API Docs**: `http://[tailscale-ip]:8000/docs`
   - **pgAdmin**: `http://[tailscale-ip]:5050`

## Key Changes Made

### Backend
- ✅ Removed `--reload` flag (no more auto-restart)
- ✅ Added production Uvicorn settings (workers, logging)
- ✅ Binds to `0.0.0.0` for Tailscale access

### Frontend
- ✅ Uses production build (`pnpm build && pnpm start`)
- ✅ Binds to `0.0.0.0` for Tailscale access
- ✅ No more development hot reload

### Networking
- ✅ Services bind to all interfaces (`0.0.0.0`)
- ✅ Compatible with Tailscale VPN
- ✅ Internal team access only

## Environment Variables

Add these to your `surfsense_backend/.env`:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:your_password@db:5432/surfsense

# Authentication
SECRET_KEY=your_secure_jwt_secret
AUTH_TYPE=LOCAL  # or GOOGLE

# AI/ML Settings
EMBEDDING_MODEL=mixedbread-ai/mxbai-embed-large-v1
RERANKERS_MODEL_NAME=ms-marco-MiniLM-L-12-v2
ETL_SERVICE=DOCLING  # or UNSTRUCTURED or LLAMACLOUD

# API Keys (get from respective services)
FIRECRAWL_API_KEY=your_key
# Add other API keys as needed
```

## Troubleshooting

- **Can't access via Tailscale?** Check that services are binding to `0.0.0.0`
- **Database connection issues?** Verify Tailscale IP is allowed
- **Build fails?** Ensure all environment variables are set
- **Services not starting?** Check logs: `docker compose logs [service_name]`

## Updates

To update SurfSense:
```bash
# Pull latest changes
git pull

# Rebuild containers
docker compose build --no-cache

# Restart services
docker compose up -d
```

This setup gives you production-like stability while keeping Docker simplicity for your small team use over Tailscale.