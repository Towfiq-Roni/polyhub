.PHONY: dev-up dev-down dev-logs dev-psql dev-cert prod-build prod-up prod-down prod-logs migrate smoke

# --project-directory pins relative paths (e.g. the api service's repo-root
# build context "." in docker-compose.prod.yml) to the repo root regardless of
# the compose files living under infra/ — `make` always runs from here.
COMPOSE_DEV := docker compose -p hub-dev -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --env-file infra/.env.dev --project-directory .
COMPOSE_PROD := docker compose -p hub-prod -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env.prod --project-directory .

infra/certs/dev/live/localhost/fullchain.pem:
	mkdir -p $(dir $@)
	openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
	  -keyout infra/certs/dev/live/localhost/privkey.pem \
	  -out $@ \
	  -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"

dev-cert: infra/certs/dev/live/localhost/fullchain.pem

dev-up: dev-cert
	$(COMPOSE_DEV) up -d --build
	@echo "web: https://localhost:8443  (self-signed dev cert — browser will warn, that's expected)"
	@echo "Point apps/api/.env's DATABASE_URL at this dev container (see infra/.env.dev.example)."

dev-down:
	$(COMPOSE_DEV) down

dev-logs:
	$(COMPOSE_DEV) logs -f

dev-psql:
	$(COMPOSE_DEV) exec postgres psql -U hub -d hub_dev

# infra/.env.prod must be populated first (copy from infra/.env.prod.example and
# fill in real values) — this file is gitignored and never committed.

prod-build:
	$(COMPOSE_PROD) build

prod-up:
	$(COMPOSE_PROD) up -d

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f

migrate:
	# --no-install: use the image's version-pinned `prisma` CLI (a runtime
	# dependency of apps/api), never npx's auto-fetched registry `latest`.
	$(COMPOSE_PROD) run --rm api npx --no-install prisma migrate deploy

smoke:
	bash infra/scripts/smoke.sh
