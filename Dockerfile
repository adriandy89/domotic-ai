FROM node:22.15-bullseye-slim AS base
RUN apt-get update -y && \
    apt-get install -y openssl && \
    npm install -g pnpm @nestjs/cli

# prisma-migrate target
FROM base AS prisma-migrate
WORKDIR /usr/src/app
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY prisma.config.ts ./
COPY ./prisma ./prisma
RUN pnpm install
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# production stage
FROM base AS production
ARG SERVICE_NAME
ARG NODE_ENV=production
ARG DATABASE_URL="postgresql://dummy:dummy@dummy:5432/dummy?schema=public"
ENV NODE_ENV=${NODE_ENV}
ENV DATABASE_URL=${DATABASE_URL}
WORKDIR /usr/src/app
COPY . .
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY prisma.config.ts ./
COPY ./prisma ./
RUN pnpm install
RUN pnpm exec prisma generate
RUN pnpm run build ${SERVICE_NAME}
ENV APP_MAIN_FILE=dist/apps/${SERVICE_NAME}/main
CMD node ${APP_MAIN_FILE}


# # Base with Playwright dependencies
# FROM node:22.15-bullseye AS playwright-base
# RUN apt-get update -y && \
#     apt-get install -y openssl && \
#     npm install -g pnpm @nestjs/cli && \
#     apt-get install -y \
#     libnss3 \
#     libnspr4 \
#     libatk1.0-0 \
#     libatk-bridge2.0-0 \
#     libcups2 \
#     libdrm2 \
#     libxkbcommon0 \
#     libatspi2.0-0 \
#     libxcomposite1 \
#     libxdamage1 \
#     libxfixes3 \
#     libxrandr2 \
#     libgbm1 \
#     libasound2 \
#     build-essential \
#     libcairo2-dev \
#     libpango1.0-dev \
#     libjpeg-dev \
#     libgif-dev \
#     librsvg2-dev \
#     && rm -rf /var/lib/apt/lists/*

# # production stage with Playwright
# FROM playwright-base AS production-playwright
# ARG SERVICE_NAME
# ARG NODE_ENV=production
# ENV NODE_ENV=${NODE_ENV}
# WORKDIR /usr/src/app
# COPY . .
# COPY package*.json ./
# COPY pnpm-lock.yaml ./
# COPY ./prisma ./
# # Install all dependencies with pnpm using shamefully-hoist for better native module support
# RUN pnpm install --frozen-lockfile --shamefully-hoist
# # Ensure canvas native module is properly built 
# RUN find node_modules -name "canvas" -type d -exec test -f {}/package.json \; -print | head -1 | xargs -I {} sh -c 'cd {} && npm rebuild'
# ENV PLAYWRIGHT_BROWSERS_PATH=0
# RUN npx playwright install --with-deps
# RUN pnpm exec prisma generate
# RUN pnpm run build ${SERVICE_NAME}
# ENV APP_MAIN_FILE=dist/apps/${SERVICE_NAME}/main
# CMD node ${APP_MAIN_FILE}
