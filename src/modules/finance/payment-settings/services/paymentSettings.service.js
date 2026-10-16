import env from "../../../../common/config/env.config.js";
import { decryptField, encryptField } from "../../../../common/crypto/fieldEncryption.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { paymentGateway } from "../../../../common/payments/gateway.js";
import { paymentGatewayAccountRepository as accounts } from "../repositories/paymentGatewayAccount.repository.js";

export const NOT_SET_UP = "Online payments are not set up for this school";

/* Secrets are shown as their last 4 characters only: "****f9Qa" */
const mask = encrypted => {
  const plain = decryptField(encrypted);
  return plain ? `****${plain.slice(-4)}` : null;
};

/* Where the school points its Razorpay webhook (payment.captured) */
const webhookUrl = tenantId => `${env.appUrl}/api/v1/public/payments/razorpay/${tenantId}/webhook`;

const view = (ctx, account) => {
  const gateway = paymentGateway();
  const common = { provider: "razorpay", webhookUrl: webhookUrl(ctx.tenantId), simulated: gateway.name === "mock" };
  if (!account) return { configured: false, ...common };
  return {
    configured: true,
    ...common,
    mode: gateway.modeOf(account.keyId),
    keyId: account.keyId,
    keySecret: mask(account.keySecret),
    webhookSecret: mask(account.webhookSecret),
    verifiedAt: account.verifiedAt,
    configuredBy: account.configuredBy,
    updatedAt: account.updatedAt
  };
};

export const paymentSettingsService = {
  get: async ctx => view(ctx, await accounts.findWithSecrets(ctx.tenantId)),

  /* Write-only secrets: replaced as a set, encrypted before they reach the database */
  replace: async (ctx, { keyId, keySecret, webhookSecret }) => {
    const values = {
      provider: "razorpay",
      keyId,
      keySecret: encryptField(keySecret),
      webhookSecret: encryptField(webhookSecret),
      configuredBy: ctx.userId,
      verifiedAt: null
    };
    const existing = await accounts.findWithSecrets(ctx.tenantId);
    if (existing) await accounts.update(ctx.tenantId, existing.id, values);
    else await accounts.create(ctx.tenantId, values);
    return paymentSettingsService.get(ctx);
  },

  /* Online payments stop; payments already recorded are unaffected */
  remove: async ctx => {
    const [removed] = await accounts.purge(ctx.tenantId);
    if (!removed) throw notFound("Online payment settings");
    return paymentSettingsService.get(ctx);
  },

  /* Ask the gateway whether it accepts the stored keys */
  testConnection: async ctx => {
    const account = await accounts.findWithSecrets(ctx.tenantId);
    if (!account) throw unprocessable(NOT_SET_UP);
    const gateway = paymentGateway();
    const result = await gateway.testConnection(await paymentSettingsService.credentialsFor(ctx));
    if (!result.ok) {
      throw unprocessable(
        result.status
          ? `Razorpay rejected these keys (HTTP ${result.status}). Check the key id and key secret`
          : "Razorpay could not be reached. Try again in a few minutes"
      );
    }
    await accounts.update(ctx.tenantId, account.id, { verifiedAt: new Date() });
    return paymentSettingsService.get(ctx);
  },

  /* For other submodules: the school's decrypted keys, or 422 when online payments are not set up */
  credentialsFor: async ctx => {
    const account = await accounts.findWithSecrets(ctx.tenantId);
    if (!account) throw unprocessable(NOT_SET_UP);
    return {
      keyId: account.keyId,
      keySecret: decryptField(account.keySecret),
      webhookSecret: decryptField(account.webhookSecret)
    };
  }
};
