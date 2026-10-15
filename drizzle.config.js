import { defineConfig } from "drizzle-kit";

/* `npm run db:generate` turns model changes into a new SQL migration */
export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/common/database/platform.schema.js",
    "./src/modules/*/shared/models/*.schema.js",
    "./src/modules/*/*/models/*.schema.js"
  ],
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true
});
