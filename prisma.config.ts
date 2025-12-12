// Prisma v7 configuration file
// Load environment variables from .env file
// This is needed because Prisma loads this config BEFORE NestJS initializes
import { config } from 'dotenv';
import { defineConfig, env } from "prisma/config";

// Load .env file in development/local environment
// In Docker, environment variables are provided by docker-compose.yml (env_file)
if (process.env.NODE_ENV !== 'production') {
  config();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
