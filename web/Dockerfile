#stage 1
FROM node:22.16-alpine as dev
RUN mkdir -p /app
WORKDIR /app
COPY --chown=node:node package*.json pnpm-lock.yaml ./
RUN npm install --verbose
COPY --chown=node:node . .
RUN npm run build
#stage 2
FROM nginx
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dev /app/dist /usr/share/nginx/html
# Expose port 80
EXPOSE 80