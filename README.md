# AI Threat Guard — Data Capture Extension

[![Build Status](https://github.com/Boipelo-Code-eng/CyberNautes/actions/workflows/ci.yml/badge.svg)](https://github.com/Boipelo-Code-eng/CyberNautes/actions/workflows/ci.yml)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Python Version](https://img.shields.io/badge/python-3.10%20|%203.11-blue)

Privacy-first adaptive threat intelligence: a browser extension that captures metadata (requests, console logs, runtime errors, cookie changes, login attempts) and forwards them to a lightweight ingest API.

---

## Features
- Browser extension (MV3) with:
  - Console/error logging
  - Fetch/XHR hooks
  - Login form detection
  - Network + cookie metadata capture
- Local queue with batching & retry
- FastAPI backend for event ingestion (SQLite/Postgres supported)
- API key authentication + basic rate limiting
- Automated unit + end-to-end (E2E) tests
- CI workflow (GitHub Actions)
- Docker Compose + Makefile for local development

---

## Quickstart (Development)

### 1. Backend (FastAPI)

```bash
python -m venv .venv
source .venv/bin/activate

pip install fastapi uvicorn pydantic sqlalchemy psycopg2-binary

python server/server.py
