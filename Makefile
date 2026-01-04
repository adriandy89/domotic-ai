init:
	pnpm run start:dev init

api:
	pnpm run start:dev api

core:
	pnpm run start:dev mqtt-core
	
rules:
	npm run start:dev rules-engine

ai:
	pnpm run start:dev ai-service

all:
	pnpm concurrently "pnpm run start:dev init" \
	"pnpm run start:dev api" \
	"pnpm run start:dev mqtt-core" \
	"pnpm run start:dev rules-engine" \
	"pnpm run start:dev ai-service"

.PHONY: all init api core rules ai