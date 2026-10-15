import dotenv from "dotenv";

dotenv.config({ quiet: true });

const required = ["DATABASE_URL", "MONGO_URI", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  throw new Error(
    `Missing required env: ${missing.join(", ")}. Set them in .env and restart.`
  );
}

export default {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  pgPoolMax: Number(process.env.PG_POOL_MAX) || 10,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET
};
