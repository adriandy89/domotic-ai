init:
	pnpm run start:dev init

api:
	pnpm run start:dev api

notifications:
	pnpm run start:dev notifications

ngrok:
	pnpm run ngrok:start

all:
	pnpm concurrently "pnpm run start:dev init" \
	"pnpm run start:dev api" \
	"pnpm run start:dev notifications"

.PHONY: all init api notifications