import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import env from "../config/env.config.js";

/* Online payment gateway. Amounts are in minor units (paise).

   Keys are never read from the environment: each call takes the credentials of the
   account being charged, { keyId, keySecret, webhookSecret } (bring your own keys).

   gateway.createOrder(credentials, { amountMinor, currency, receipt, notes }) -> { orderId, amountMinor, currency, keyId }
   gateway.verifyPayment(credentials, { orderId, paymentId, signature })      -> boolean (checkout callback)
   gateway.verifyWebhook(credentials, rawBody, signatureHeader)               -> boolean
   gateway.parseWebhook(body)                     -> { event, orderId, paymentId, amountMinor, captured } |
                                                     { event, refund: { refundId, paymentId, amountMinor, status } } | null
   gateway.refund(credentials, { paymentId, amountMinor, notes }) -> { refundId, amountMinor, status: "PENDING" | "PROCESSED" | "FAILED" }
   gateway.testConnection(credentials)            -> { ok, status? }  (are the keys accepted?)
   gateway.modeOf(keyId)                          -> "test" | "live" */

const hmacHex = (secret, data) => createHmac("sha256", secret).update(data).digest("hex");

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};

const requireKeys = credentials => {
  if (!credentials?.keyId || !credentials?.keySecret)
    throw new Error("Gateway credentials (keyId, keySecret) are required");
  return credentials;
};

const verifyCheckout = (credentials, { orderId, paymentId, signature }) =>
  Boolean(credentials?.keySecret) && safeEqual(hmacHex(credentials.keySecret, `${orderId}|${paymentId}`), signature);

const verifyBody = (credentials, rawBody, signature) =>
  Boolean(credentials?.webhookSecret && rawBody) && safeEqual(hmacHex(credentials.webhookSecret, rawBody), signature);

const modeOf = keyId => (String(keyId ?? "").startsWith("rzp_live_") ? "live" : "test");

/* Razorpay refund statuses -> ours */
const REFUND_STATUSES = { created: "PENDING", pending: "PENDING", processed: "PROCESSED", failed: "FAILED" };

/* Razorpay's payment.captured / payment.authorized and refund.* webhook payloads */
const parseRazorpayWebhook = body => {
  const refund = body?.payload?.refund?.entity;
  if (String(body?.event ?? "").startsWith("refund.") && refund) {
    return {
      event: body.event,
      refund: {
        refundId: refund.id,
        paymentId: refund.payment_id,
        amountMinor: refund.amount,
        currency: refund.currency,
        status: REFUND_STATUSES[refund.status] ?? (body.event === "refund.failed" ? "FAILED" : "PENDING")
      }
    };
  }
  const payment = body?.payload?.payment?.entity;
  if (!payment) return null;
  return {
    event: body.event,
    orderId: payment.order_id,
    paymentId: payment.id,
    amountMinor: payment.amount,
    currency: payment.currency,
    captured: body.event === "payment.captured" || payment.status === "captured"
  };
};

const RAZORPAY_API = "https://api.razorpay.com/v1";

const basicAuth = ({ keyId, keySecret }) => `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

export const razorpayGateway = {
  name: "razorpay",
  modeOf,

  createOrder: async (credentials, { amountMinor, currency, receipt, notes }) => {
    requireKeys(credentials);
    const response = await fetch(`${RAZORPAY_API}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: basicAuth(credentials) },
      body: JSON.stringify({ amount: amountMinor, currency, receipt, notes })
    });
    if (!response.ok) throw new Error(`Razorpay order creation failed (${response.status})`);
    const order = await response.json();
    return { orderId: order.id, amountMinor: order.amount, currency: order.currency, keyId: credentials.keyId };
  },

  verifyPayment: verifyCheckout,
  verifyWebhook: verifyBody,
  parseWebhook: parseRazorpayWebhook,

  /* Refund (part of) a captured payment back to the payer's original method */
  refund: async (credentials, { paymentId, amountMinor, notes }) => {
    requireKeys(credentials);
    const response = await fetch(`${RAZORPAY_API}/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: basicAuth(credentials) },
      body: JSON.stringify({ amount: amountMinor, speed: "normal", notes })
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      const error = new Error(`Razorpay refund failed (${response.status})`);
      error.gatewayMessage = detail?.error?.description ?? null;
      throw error;
    }
    const refund = await response.json();
    return { refundId: refund.id, amountMinor: refund.amount, status: REFUND_STATUSES[refund.status] ?? "PENDING" };
  },

  /* A cheap authenticated read: 200 = keys accepted, 401 = rejected */
  testConnection: async credentials => {
    requireKeys(credentials);
    try {
      const response = await fetch(`${RAZORPAY_API}/orders?count=1`, {
        headers: { authorization: basicAuth(credentials) }
      });
      return { ok: response.ok, status: response.status };
    } catch {
      return { ok: false, status: null };
    }
  }
};

/* Development/test gateway with the same contract and the same signature checks
   (HMAC with the account's own secrets), but no network: orders are made up and
   every key pair "connects". Sign like it with gatewaySignature(secret, data). */
export const mockGateway = {
  name: "mock",
  modeOf,
  createOrder: async (credentials, { amountMinor, currency }) => ({
    orderId: `order_mock_${randomUUID().replaceAll("-", "").slice(0, 14)}`,
    amountMinor,
    currency,
    keyId: requireKeys(credentials).keyId
  }),
  verifyPayment: verifyCheckout,
  verifyWebhook: verifyBody,
  parseWebhook: body => {
    const event = parseRazorpayWebhook(body);
    return event?.refund ? event : event && { ...event, captured: body.event === "payment.captured" };
  },
  /* Processed at once, like most real refunds */
  refund: async (credentials, { amountMinor }) => {
    requireKeys(credentials);
    return { refundId: `rfnd_mock_${randomUUID().replaceAll("-", "").slice(0, 14)}`, amountMinor, status: "PROCESSED" };
  },
  testConnection: async credentials => {
    requireKeys(credentials);
    return { ok: true, status: 200 };
  }
};

/* HMAC-SHA256 hex signature, as the gateways compute it (tests and dev tooling) */
export const gatewaySignature = (secret, data) => hmacHex(secret, data);

/* PAYMENT_PROVIDER=mock is a global override for development and tests */
export const paymentGateway = () => (env.payments.provider === "mock" ? mockGateway : razorpayGateway);
