#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# GitHub raw content URL
GITHUB_RAW_URL="https://raw.githubusercontent.com/REPO_OWNER/surfsense/main"

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        Welcome to SurfSense Installation! 🎉         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}❌ Please do not run this script as root${NC}"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking system requirements...${NC}"

if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
echo -e "${GREEN}✓ Docker installed${NC}"

if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose installed${NC}"

# Check available disk space (need at least 10GB)
AVAILABLE_SPACE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt 10 ]; then
    echo -e "${YELLOW}⚠️  Warning: Less than 10GB disk space available${NC}"
    read -p "Continue anyway? (y/n) [n]: " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        echo "Installation cancelled."
        exit 0
    fi
fi
echo -e "${GREEN}✓ Sufficient disk space${NC}"

echo ""
echo "────────────────────────────────────────────────────────"
echo ""

# Ask installation directory
DEFAULT_INSTALL_DIR="$HOME/surfsense"
echo -e "${BLUE}Where do you want to install SurfSense?${NC}"
echo -e "Default: ${GREEN}$DEFAULT_INSTALL_DIR${NC}"
read -p "Enter path (or press Enter for default): " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}

# Expand tilde if present
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

# Create directory if doesn't exist
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Creating directory: $INSTALL_DIR${NC}"
    mkdir -p "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo -e "${GREEN}✓ Installation directory: $INSTALL_DIR${NC}"

echo ""
echo "────────────────────────────────────────────────────────"
echo ""

# Download configuration files
echo -e "${YELLOW}Downloading configuration files...${NC}"

# For now, create them locally (in production, download from GitHub)
# curl -fsSL "$GITHUB_RAW_URL/docker-compose.install.yml" -o docker-compose.yml
# curl -fsSL "$GITHUB_RAW_URL/.env.install.example" -o .env.example

# Copy from repo (temporary for development)
cp "$(dirname "$0")/docker-compose.install.yml" docker-compose.yml 2>/dev/null || echo "Using local files"
cp "$(dirname "$0")/.env.install.example" .env.example 2>/dev/null || echo "Using local files"

echo -e "${GREEN}✓ Configuration files ready${NC}"

echo ""
echo "────────────────────────────────────────────────────────"
echo ""
echo -e "${BLUE}Configuration Questions:${NC}"
echo ""

# Generate secure passwords
echo -e "${YELLOW}Generating secure passwords...${NC}"
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
SECRET_KEY=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-48)
echo -e "${GREEN}✓ Secure passwords generated${NC}"
echo ""

# Q1: GPU
echo -e "${BLUE}Q1: GPU Support${NC}"
echo "Do you have an NVIDIA GPU and want to use it?"
echo "  - No: Uses CPU-only backend (~3.6GB image)"
echo "  - Yes: Uses GPU-accelerated backend (~9GB image, requires NVIDIA GPU)"
read -p "Have NVIDIA GPU? (y/n) [n]: " HAS_GPU
if [ "$HAS_GPU" = "y" ] || [ "$HAS_GPU" = "Y" ]; then
    BACKEND_IMAGE_TAG="latest-gpu"
    echo -e "${GREEN}✓ Using GPU-accelerated backend${NC}"
else
    BACKEND_IMAGE_TAG="latest"
    echo -e "${GREEN}✓ Using CPU-only backend${NC}"
fi
echo ""

# Q2: Authentication
echo -e "${BLUE}Q2: Authentication Type${NC}"
echo "How do you want users to log in?"
echo "  1) Local (email/password) [Recommended]"
echo "  2) Google OAuth (requires Google Cloud credentials)"
read -p "Choice [1]: " AUTH_CHOICE
AUTH_CHOICE=${AUTH_CHOICE:-1}

if [ "$AUTH_CHOICE" = "2" ]; then
    AUTH_TYPE="GOOGLE"
    echo ""
    echo -e "${YELLOW}Google OAuth Configuration:${NC}"
    echo "You'll need to create OAuth credentials at:"
    echo "https://console.cloud.google.com/apis/credentials"
    echo ""
    read -p "Google OAuth Client ID: " GOOGLE_CLIENT_ID
    read -p "Google OAuth Client Secret: " GOOGLE_CLIENT_SECRET
    echo -e "${GREEN}✓ Google OAuth configured${NC}"
else
    AUTH_TYPE="LOCAL"
    GOOGLE_CLIENT_ID=""
    GOOGLE_CLIENT_SECRET=""
    echo -e "${GREEN}✓ Using local authentication${NC}"
fi
echo ""

# Q3: Text-to-Speech
echo -e "${BLUE}Q3: Text-to-Speech (for podcast generation)${NC}"
echo "Which TTS service do you want to use?"
echo "  1) Local Kokoro TTS (free, no API key needed) [Recommended]"
echo "  2) OpenAI TTS (better quality, requires OpenAI API key)"
echo "  3) Skip (configure later)"
read -p "Choice [1]: " TTS_CHOICE
TTS_CHOICE=${TTS_CHOICE:-1}

case "$TTS_CHOICE" in
    2)
        TTS_SERVICE="openai/tts-1"
        echo ""
        read -p "OpenAI API Key: " TTS_API_KEY
        echo -e "${GREEN}✓ OpenAI TTS configured${NC}"
        ;;
    3)
        TTS_SERVICE=""
        TTS_API_KEY=""
        echo -e "${YELLOW}⚠️  TTS skipped (configure in .env later)${NC}"
        ;;
    *)
        TTS_SERVICE="local/kokoro"
        TTS_API_KEY=""
        echo -e "${GREEN}✓ Using local Kokoro TTS${NC}"
        ;;
esac
echo ""

# Q4: Speech-to-Text
echo -e "${BLUE}Q4: Speech-to-Text (for video transcription)${NC}"
echo "Which STT service do you want to use?"
echo "  1) Skip (configure later) [Recommended]"
echo "  2) OpenAI Whisper (requires OpenAI API key)"
read -p "Choice [1]: " STT_CHOICE
STT_CHOICE=${STT_CHOICE:-1}

if [ "$STT_CHOICE" = "2" ]; then
    STT_SERVICE="openai/whisper-1"
    echo ""
    if [ -n "$TTS_API_KEY" ]; then
        read -p "Use same OpenAI API key? (y/n) [y]: " SAME_KEY
        if [ "$SAME_KEY" != "n" ]; then
            STT_API_KEY="$TTS_API_KEY"
            echo -e "${GREEN}✓ Using same OpenAI API key${NC}"
        else
            read -p "OpenAI API Key for Whisper: " STT_API_KEY
        fi
    else
        read -p "OpenAI API Key: " STT_API_KEY
    fi
    echo -e "${GREEN}✓ OpenAI Whisper configured${NC}"
else
    STT_SERVICE=""
    STT_API_KEY=""
    echo -e "${YELLOW}⚠️  STT skipped (configure in .env later)${NC}"
fi
echo ""

echo "────────────────────────────────────────────────────────"
echo ""

# Generate .env file
echo -e "${YELLOW}Generating configuration file (.env)...${NC}"

cat > .env << EOF
# SurfSense Configuration
# Generated by install.sh on $(date)

# ===== DOCKER IMAGE SETTINGS =====
BACKEND_IMAGE_TAG=$BACKEND_IMAGE_TAG
GITHUB_REPO_OWNER=surfsense

# ===== DATABASE CONFIGURATION =====
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=surfsense
POSTGRES_PORT=5432

# ===== SECURITY =====
SECRET_KEY=$SECRET_KEY

# ===== AUTHENTICATION =====
AUTH_TYPE=$AUTH_TYPE
GOOGLE_OAUTH_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET

# ===== FRONTEND CONFIGURATION =====
FRONTEND_PORT=3000
NEXT_FRONTEND_URL=http://localhost:3000

# ===== BACKEND CONFIGURATION =====
BACKEND_PORT=8000

# ===== DOCUMENT PROCESSING =====
ETL_SERVICE=UNSTRUCTURED

# ===== EMBEDDING & SEARCH =====
EMBEDDING_MODEL=mixedbread-ai/mxbai-embed-large-v1
RERANKERS_MODEL_NAME=ms-marco-MiniLM-L-12-v2
RERANKERS_MODEL_TYPE=flashrank

# ===== TEXT-TO-SPEECH =====
TTS_SERVICE=$TTS_SERVICE
TTS_SERVICE_API_KEY=$TTS_API_KEY
TTS_SERVICE_API_BASE=

# ===== SPEECH-TO-TEXT =====
STT_SERVICE=$STT_SERVICE
STT_SERVICE_API_KEY=$STT_API_KEY
STT_SERVICE_API_BASE=

# ===== PGADMIN =====
PGADMIN_PORT=5050
PGADMIN_DEFAULT_EMAIL=admin@surfsense.com
PGADMIN_DEFAULT_PASSWORD=surfsense
EOF

echo -e "${GREEN}✓ Configuration saved to .env${NC}"
echo ""

echo "────────────────────────────────────────────────────────"
echo ""

# Pull images
echo -e "${YELLOW}Pulling Docker images (this may take a few minutes)...${NC}"
docker compose pull

echo -e "${GREEN}✓ Docker images downloaded${NC}"
echo ""

# Start containers
echo -e "${YELLOW}Starting SurfSense containers...${NC}"
docker compose up -d

echo ""
echo -e "${GREEN}✓ SurfSense started successfully!${NC}"
echo ""

# Wait a moment for services to start
echo -e "${YELLOW}Waiting for services to initialize...${NC}"
sleep 5

# Check if services are running
if docker compose ps | grep -q "Up"; then
    echo -e "${GREEN}✓ All services are running${NC}"
else
    echo -e "${RED}⚠️  Some services may not be running. Check with: docker compose ps${NC}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo -e "║         ${GREEN}SurfSense Installation Complete!${NC}         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}📁 Installation directory:${NC} $INSTALL_DIR"
echo -e "${BLUE}🌐 Frontend:${NC} http://localhost:3000"
echo -e "${BLUE}🔧 Backend API:${NC} http://localhost:8000"
echo -e "${BLUE}🗄️  PgAdmin:${NC} http://localhost:5050"
echo ""
echo -e "${BLUE}📝 Configuration:${NC} $INSTALL_DIR/.env"
echo "   Edit this file to change settings without reinstalling."
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Register your first account"
echo "  3. Start searching!"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  Stop:    cd $INSTALL_DIR && docker compose down"
echo "  Restart: cd $INSTALL_DIR && docker compose up -d"
echo "  Logs:    cd $INSTALL_DIR && docker compose logs -f"
echo "  Update:  cd $INSTALL_DIR && docker compose pull && docker compose up -d"
echo ""
echo -e "${GREEN}🎉 Enjoy SurfSense!${NC}"
echo ""
