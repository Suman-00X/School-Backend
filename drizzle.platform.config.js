import { defineConfig } from "drizzle-kit";

/* The platform database (school registry): `npm run db:generate:platform` */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/common/tenancy/registry.schema.js", "./src/modules/platform/operators/models/platformOperator.schema.js"],
  out: "./migrations-platform",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true
});
