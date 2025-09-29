.PHONY: help setup dev build start lint format test

help:
	@echo "make setup    Install dependencies"
	@echo "make dev      Run Next.js dev server"
	@echo "make build    Build for production"
	@echo "make start    Start production server"
	@echo "make lint     Run ESLint"

setup:
	npm install

dev:
	npm run dev

build:
	npm run build

start:
	npm run start

lint:
	npm run lint || true

