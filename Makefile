up: COMPOSE_FILE=docker-compose.base.yml
up:
	docker-compose run --rm wait_for_deps
	docker-compose up -d ciddag

deps: COMPOSE_FILE=docker-compose.base.yml
deps:
	docker-compose up -d ipfs0

build: COMPOSE_FILE=docker-compose.base.yml
build:
	docker-compose build ciddag
