# Makefile for AI Threat Guard local development

# Auto-detect whether to use 'docker compose' or 'docker-compose'
ifeq (, $(shell which docker-compose 2>/dev/null))
  ifeq (, $(shell docker compose version 2>/dev/null))
    $(error Neither 'docker-compose' nor 'docker compose' found in PATH)
  else
    COMPOSE=docker compose
  endif
else
  COMPOSE=docker-compose
endif

up:
	$(COMPOSE) up --build -d --remove-orphans

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

rebuild:
	$(COMPOSE) build --no-cache

# 🔹 Run tests fully inside the test-runner container
test:
	@echo "🚀 Running all tests inside Docker (test-runner)..."
	$(COMPOSE) build test-runner   # ✅ Always rebuild test-runner image first
	$(COMPOSE) run --rm test-runner bash -c "\
		set -e; \
		echo '============================================================'; \
		echo '📦 [1/3] Node.js unit tests (test_queue.js)'; \
		echo '============================================================'; \
		npm ci && node tests/test_queue.js; \
		echo '✅ Node.js unit tests passed!'; \
		\
		echo '============================================================'; \
		echo '🌐 [2/3] Playwright E2E tests'; \
		echo '============================================================'; \
		npx playwright test; \
		echo '✅ Playwright E2E tests passed!'; \
		\
		echo '============================================================'; \
		echo '🧠 [3/3] Python ML unit tests'; \
		echo '============================================================'; \
		pytest -q --disable-warnings --maxfail=1 tests/test_ml_model.py; \
		echo '✅ Python ML tests passed!'; \
		\
		echo '============================================================'; \
		echo '🎉 ALL TESTS PASSED SUCCESSFULLY'; \
		echo '============================================================'; \
	"

doctor:
	@echo "Checking Docker..."
	@docker ps > /dev/null || (echo "❌ Docker is not running!" && exit 1)
	@echo "✅ Docker is running."
	@$(COMPOSE) version

ci: up test
	@echo "✅ CI pipeline finished successfully."

help:
	@echo "Available targets:"
	@echo "  make up       - build and start containers in detached mode"
	@echo "  make down     - stop and remove containers"
	@echo "  make logs     - tail container logs"
	@echo "  make ps       - list running containers"
	@echo "  make rebuild  - rebuild images without cache"
	@echo "  make test     - run unit + E2E tests inside Docker"
	@echo "  make doctor   - check Docker & Compose availability"
	@echo "  make ci       - run CI pipeline (up + test)"

.PHONY: up down logs ps rebuild test doctor help ci
