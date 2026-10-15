import dotenv from "dotenv";

dotenv.config();

const required = ["MONGO_URI", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  throw new Error(
    `Missing required env: ${missing.join(", ")}. Set them in .env and restart.`
  );
}

export default {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET
};