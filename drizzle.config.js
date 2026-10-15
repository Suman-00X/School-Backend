import { defineConfig } from "drizzle-kit";

/* `npm run db:generate` turns schema changes into a new SQL migration */
export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/database/postgres/schema/enums.js",
    "./src/database/postgres/schema/tenancy.schema.js",
    "./src/database/postgres/schema/people.schema.js",
    "./src/database/postgres/schema/academics.schema.js",
    "./src/database/postgres/schema/exams.schema.js"
  ],
  out: "./src/database/postgres/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true
});
