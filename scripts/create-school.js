/* Operator CLI: onboard a school (tenant) with its first admin.

     npm run school:create -- --name "Green Valley School" --code GVS \
       --admin-email principal@gvs.edu --admin-first Asha --admin-last Rao [--timezone Asia/Kolkata] [--currency INR]

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
    country: { type: "string", default: "IN" }
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
const { digest, randomToken } = await import("../src/common/crypto/tokens.js");
const { email } = await import("../src/common/messaging/email.js");
const { authEmails } = await import("../src/modules/auth/shared/utils/authEmails.util.js");
const { TOKEN_TTL_HOURS } = await import("../src/modules/auth/shared/constants/auth.constants.js");
const { isTimeZone } = await import("../src/common/tenancy/tenant.service.js");
const schema = await import("../src/database.schema.js");

if (!isTimeZone(args.timezone)) fail("--timezone must be an IANA time zone such as Asia/Kolkata");

initPostgres(schema);
try {
  const { tenant, admin, token } = await transaction(async tx => {
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        name: args.name.trim(),
        code: args.code.trim().toUpperCase(),
        timezone: args.timezone,
        currency: args.currency.toUpperCase(),
        country: args.country.toUpperCase()
      })
      .returning();
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
    const token = randomToken();
    await tx.insert(schema.authTokens).values({
      tenantId: tenant.id,
      userId: admin.id,
      purpose: "INVITE",
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS.INVITE * 3_600_000)
    });
    return { tenant, admin, token };
  });

  const invitation = authEmails.invite({ user: admin, school: tenant, token, hours: TOKEN_TTL_HOURS.INVITE });
  await email.send(invitation);
  console.log(`School created: ${tenant.name} (${tenant.code}), id ${tenant.id}`);
  console.log(`Admin: ${admin.firstName} ${admin.lastName} <${admin.email}>, id ${admin.id}`);
  console.log(
    `Invitation (also emailed; valid ${TOKEN_TTL_HOURS.INVITE / 24} days):\n${/https?:\/\/\S+/.exec(invitation.text)[0]}`
  );
  console.log(
    `Or set the password directly: POST /api/v1/auth/password-resets { "token": "${token}", "password": "…" }`
  );
} catch (error) {
  if ((error.cause ?? error).code === "23505") fail(`a school with code ${args.code.toUpperCase()} already exists`);
  throw error;
} finally {
  await closePostgres();
}
