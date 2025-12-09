// Prisma v7 configuration file
// In Docker, environment variables are provided by docker-compose.yml (env_file)
// No need for dotenv in containerized environments
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
