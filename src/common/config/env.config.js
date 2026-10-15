import dotenv from "dotenv";

dotenv.config({ quiet: true });

const required = ["DATABASE_URL", "MONGO_URI", "JWT_SECRET"];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) {
  throw new Error(`Missing required env: ${missing.join(", ")}. Set them in .env and restart.`);
}

const str = (key, fallback = undefined) => process.env[key]?.trim() || fallback;
const num = (key, fallback) => (process.env[key] ? Number(process.env[key]) : fallback);
const list = key =>
  str(key)
    ? str(key)
        .split(",")
        .map(v => v.trim())
        .filter(Boolean)
    : [];

const nodeEnv = str("NODE_ENV", "development");

export default {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port: num("PORT", 3000),
  /* Public base URL of this API (links in emails, payment callbacks, download URLs) */
  appUrl: str("APP_URL", `http://localhost:${num("PORT", 3000)}`),
  logLevel: str("LOG_LEVEL", nodeEnv === "test" ? "silent" : "info"),

  databaseUrl: str("DATABASE_URL"),
  pgPoolMax: num("PG_POOL_MAX", 10),
  mongoUri: str("MONGO_URI"),
  /* Optional. Without it, jobs and cache run in-process (fine for dev, single instance) */
  redisUrl: str("REDIS_URL"),

  jwtSecret: str("JWT_SECRET"),

  allowedOrigins: list("ALLOWED_ORIGINS"),
  rateLimitWindowMs: num("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  rateLimitMax: num("RATE_LIMIT_MAX", 300),

  storage: {
    driver: str("STORAGE_DRIVER", "local"), // local | s3
    localDir: str("STORAGE_LOCAL_DIR", "./storage"),
    s3Bucket: str("S3_BUCKET"),
    s3Region: str("S3_REGION", "ap-south-1"),
    s3Endpoint: str("S3_ENDPOINT"),
    maxUploadBytes: num("MAX_UPLOAD_BYTES", 10 * 1024 * 1024)
  },

  email: {
    driver: str("EMAIL_DRIVER", nodeEnv === "production" ? "smtp" : "console"), // smtp | console | memory
    smtpUrl: str("SMTP_URL"),
    from: str("EMAIL_FROM", "School <no-reply@example.com>")
  },

  sms: {
    driver: str("SMS_DRIVER", "console"), // http | console | memory
    httpUrl: str("SMS_HTTP_URL"),
    apiKey: str("SMS_API_KEY"),
    senderId: str("SMS_SENDER_ID", "SCHOOL")
  },

  payments: {
    provider: str("PAYMENT_PROVIDER", "mock"), // razorpay | mock
    razorpayKeyId: str("RAZORPAY_KEY_ID"),
    razorpayKeySecret: str("RAZORPAY_KEY_SECRET"),
    razorpayWebhookSecret: str("RAZORPAY_WEBHOOK_SECRET")
  },

  sentryDsn: str("SENTRY_DSN")
};
