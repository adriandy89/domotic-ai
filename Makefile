init:
	pnpm run start:dev init

api:
	pnpm run start:dev api

notifications:
	pnpm run start:dev notifications

core:
	pnpm run start:dev mqtt-core

ngrok:
	pnpm run ngrok:start

all:
	pnpm concurrently "pnpm run start:dev init" \
	"pnpm run start:dev api" \
	"pnpm run start:dev notifications" \
	"pnpm run start:dev mqtt-core"

.PHONY: all init api notifications core ngrok