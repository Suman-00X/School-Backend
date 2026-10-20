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

/* "postgres://u:p@host/platform?x" -> "postgres://u:p@host/{database}?x" */
const withDatabasePlaceholder = url => {
  try {
    const parsed = new URL(url);
    parsed.pathname = "/__SCHOOL_DATABASE__";
    return parsed.toString().replace("__SCHOOL_DATABASE__", "{database}");
  } catch {
    return url;
  }
};

/* The mock gateway accepts any keys and invents payments: never in production */
if (nodeEnv === "production" && str("PAYMENT_PROVIDER") === "mock") {
  throw new Error("PAYMENT_PROVIDER=mock is not allowed in production. Remove it (Razorpay is the default).");
}

export default {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port: num("PORT", 3000),
  /* Public base URL of this API (links in emails, payment callbacks, download URLs) */
  appUrl: str("APP_URL", `http://localhost:${num("PORT", 3000)}`),
  logLevel: str("LOG_LEVEL", nodeEnv === "test" ? "silent" : "info"),
  /* Release identifier on every log line (e.g. the git SHA, set by the deploy) */
  appVersion: str("APP_VERSION", "dev"),
  /* Requests and database queries slower than this are logged as warnings */
  slowRequestMs: num("SLOW_REQUEST_MS", 1000),
  slowQueryMs: num("SLOW_QUERY_MS", 500),
  /* One line per HTTP request for monitoring the API (see logging/accessLog.js) */
  accessLog: {
    mode: str("ACCESS_LOG", { test: "off", production: "stdout" }[nodeEnv] ?? "file"), // file | stdout | off
    dir: str("ACCESS_LOG_DIR", "./logs"),
    retentionDays: num("ACCESS_LOG_RETENTION_DAYS", 14),
    /* Exact paths left out, e.g. load-balancer probes: /health,/ready */
    ignore: list("ACCESS_LOG_IGNORE")
  },

  /* The PLATFORM database: the registry of schools (see tenancy/context.js) */
  databaseUrl: str("DATABASE_URL"),
  pgPoolMax: num("PG_POOL_MAX", 10),
  /* The MongoDB server (cluster) the schools' databases live on */
  mongoUri: str("MONGO_URI"),

  /* Database per school (D-45). By default each school's databases are on the same servers
     as DATABASE_URL / MONGO_URI, named school_<code>: one string per server is enough.
     The templates can point elsewhere (e.g. Neon's pooled host); a school can also be given
     its own connection strings when it is created. */
  tenancy: {
    databaseUrlTemplate: str("TENANT_DATABASE_URL_TEMPLATE", withDatabasePlaceholder(str("DATABASE_URL"))),
    mongoUrlTemplate: str("TENANT_MONGO_URI_TEMPLATE", withDatabasePlaceholder(str("MONGO_URI"))),
    /* Allowed to CREATE DATABASE (Neon: the project owner's direct, non-pooled string) */
    postgresAdminUrl: str("POSTGRES_ADMIN_URL", str("DATABASE_URL")),
    databasePrefix: str("TENANT_DATABASE_PREFIX", "school_"),
    /* Connection pools kept open per process, and connections per school */
    maxOpenTenants: num("TENANT_MAX_OPEN", 50),
    poolMaxPerTenant: num("TENANT_POOL_MAX", 5)
  },
  /* Optional. Without it, jobs and cache run in-process (fine for dev, single instance) */
  redisUrl: str("REDIS_URL"),

  jwtSecret: str("JWT_SECRET"),

  auth: {
    /* Access tokens are short; refresh tokens rotate on every use */
    accessTokenTtlSeconds: num("ACCESS_TOKEN_TTL_SECONDS", 15 * 60),
    refreshTokenTtlDays: num("REFRESH_TOKEN_TTL_DAYS", 30),
    /* Account lockout after repeated wrong passwords */
    maxFailedLogins: num("AUTH_MAX_FAILED_LOGINS", 5),
    lockoutMinutes: num("AUTH_LOCKOUT_MINUTES", 15),
    /* Sign-in and reset requests per IP + email (refresh and links: 5× per IP) */
    rateLimitWindowMs: num("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    rateLimitMax: num("AUTH_RATE_LIMIT_MAX", 10)
  },
  /* Public URL of the web app (links in invitation and password-reset emails) */
  webAppUrl: str("WEB_APP_URL", str("APP_URL", `http://localhost:${num("PORT", 3000)}`)),
  /* 32 bytes (hex or base64) for encrypting sensitive fields; required in production */
  dataEncryptionKey: str("DATA_ENCRYPTION_KEY"),

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

  /* Each school brings its own gateway keys (stored encrypted); mock = no real gateway */
  payments: {
    provider: str("PAYMENT_PROVIDER", nodeEnv === "production" ? "razorpay" : "mock") // razorpay | mock
  },

  sentryDsn: str("SENTRY_DSN"),
  /* GET /metrics needs "Authorization: Bearer <token>"; unset: the endpoint is off */
  metricsToken: str("METRICS_TOKEN")
};
