# test-runner/Dockerfile
FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

# Install Python + build tools
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv python3-dev build-essential jq \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements for dev/test
COPY requirements-dev.txt /app/requirements-dev.txt
RUN pip3 install --no-cache-dir -r /app/requirements-dev.txt

# Node dependencies (use package-lock.json for reproducibility if present)
COPY package*.json ./
RUN npm ci || true

# Copy everything (tests + source)
COPY . .

# Playwright deps (ensure browsers installed inside container)
RUN npx playwright install --with-deps chromium
