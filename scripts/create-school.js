/* Operator CLI: onboard a school (tenant) with its first admin.

     npm run school:create -- --name "Green Valley School" --code GVS \
       --admin-email principal@gvs.edu --admin-first Asha --admin-last Rao [--timezone Asia/Kolkata] [--currency INR]

   The school gets its own PostgreSQL and MongoDB databases: school_<code> on the servers of
   DATABASE_URL / MONGO_URI, or --database-url / --mongo-url for databases of its own.
   Prints (and emails, with a configured email driver) a 7-day invitation link where the
   admin sets their password, then signs in with the school code, email and password. */
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    code: { type: "string" },
    "admin-email": { type: "string" },
    "admin-first": { type: "string" },
    "admin-last": { type: "string" },
    timezone: { type: "string", default: "Asia/Kolkata" },
    currency: { type: "string", default: "INR" },
    country: { type: "string", default: "IN" },
    /* Optional: the school's own databases ("bring your own"), else school_<code> on the shared servers */
    "database-url": { type: "string" },
    "mongo-url": { type: "string" }
  }
});

const fail = message => {
  console.error(`create-school: ${message}`);
  process.exit(1);
};

const missing = ["name", "code", "admin-email", "admin-first", "admin-last"].filter(key => !args[key]?.trim());
if (missing.length) fail(`missing --${missing.join(", --")}`);
if (!/^[A-Z0-9-]{2,20}$/i.test(args.code)) fail("--code must be 2-20 letters, digits or dashes");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args["admin-email"])) fail("--admin-email is not an email address");
if (!/^[A-Z]{3}$/i.test(args.currency)) fail("--currency must be an ISO 4217 code such as INR");

const { initPostgres, closePostgres, transaction } = await import("../src/common/database/postgres.js");
const { connectMongo, closeMongo } = await import("../src/common/database/mongo.js");
const { runInTenant } = await import("../src/common/tenancy/context.js");
const { migratePlatformDatabase, provisionTenant } = await import("../src/common/tenancy/provisioning.js");
const { digest, randomToken } = await import("../src/common/crypto/tokens.js");
const { email } = await import("../src/common/messaging/email.js");
const { authEmails } = await import("../src/modules/auth/shared/utils/authEmails.util.js");
const { TOKEN_TTL_HOURS } = await import("../src/modules/auth/shared/constants/auth.constants.js");
const { isTimeZone } = await import("../src/common/tenancy/tenant.service.js");
const schema = await import("../src/database.schema.js");

if (!isTimeZone(args.timezone)) fail("--timezone must be an IANA time zone such as Asia/Kolkata");

initPostgres(schema);
await connectMongo();
try {
  /* The registry first (idempotent), then the school's own databases */
  await migratePlatformDatabase();
  const { record, profile: tenant } = await provisionTenant({
    code: args.code,
    name: args.name,
    timezone: args.timezone,
    currency: args.currency,
    country: args.country,
    databaseUrl: args["database-url"],
    mongoUrl: args["mongo-url"]
  });

  const { admin, token } = await runInTenant(record.id, () =>
    transaction(async tx => {
      const [admin] = await tx
        .insert(schema.users)
        .values({
          tenantId: tenant.id,
          firstName: args["admin-first"].trim(),
          lastName: args["admin-last"].trim(),
          email: args["admin-email"].trim().toLowerCase(),
          role: "ADMIN"
        })
        .returning();
      /* The link names its school (see auth credentials) */
      const token = `${tenant.id}.${randomToken()}`;
      await tx.insert(schema.authTokens).values({
        tenantId: tenant.id,
        userId: admin.id,
        purpose: "INVITE",
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS.INVITE * 3_600_000)
      });
      return { admin, token };
    })
  );

  const invitation = authEmails.invite({ user: admin, school: tenant, token, hours: TOKEN_TTL_HOURS.INVITE });
  await email.send(invitation);
  console.log(`School created: ${tenant.name} (${tenant.code}), id ${tenant.id}`);
  console.log(
    `Databases: PostgreSQL ${args["database-url"] ? "(own connection string)" : record.databaseName}, MongoDB ${args["mongo-url"] ? "(own connection string)" : record.mongoDatabaseName}`
  );
  console.log(`Admin: ${admin.firstName} ${admin.lastName} <${admin.email}>, id ${admin.id}`);
  console.log(
    `Invitation (also emailed; valid ${TOKEN_TTL_HOURS.INVITE / 24} days):\n${/https?:\/\/\S+/.exec(invitation.text)[0]}`
  );
  console.log(
    `Or set the password directly: POST /api/v1/auth/password-resets { "token": "${token}", "password": "…" }`
  );
} catch (error) {
  if (error.status === 409) fail(error.message.replace(/^A/, "a"));
  throw error;
} finally {
  await closePostgres();
  await closeMongo();
}
