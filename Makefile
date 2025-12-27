init:
	pnpm run start:dev init

api:
	pnpm run start:dev api

notifications:
	pnpm run start:dev notifications

core:
	pnpm run start:dev mqtt-core
	
rules:
	npm run start:dev rules-engine

all:
	pnpm concurrently "pnpm run start:dev init" \
	"pnpm run start:dev api" \
	"pnpm run start:dev notifications" \
	"pnpm run start:dev mqtt-core" \
	"pnpm run start:dev rules-engine"

.PHONY: all init api notifications core rules