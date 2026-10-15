import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import env from "../config/env.config.js";

/* Online payment gateway. Amounts are in minor units (paise).

   gateway.createOrder({ amountMinor, currency, receipt, notes }) -> { orderId, amountMinor, currency, keyId }
   gateway.verifyPayment({ orderId, paymentId, signature })      -> boolean (checkout callback)
   gateway.verifyWebhook(rawBody, signatureHeader)               -> boolean
   gateway.parseWebhook(body)                                    -> { event, orderId, paymentId, amountMinor, captured } | null */

const hmacHex = (secret, data) => createHmac("sha256", secret).update(data).digest("hex");

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};

const razorpay = ({ razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret }) => {
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error("PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  }
  const auth = `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64")}`;

  return {
    name: "razorpay",

    createOrder: async ({ amountMinor, currency, receipt, notes }) => {
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: auth },
        body: JSON.stringify({ amount: amountMinor, currency, receipt, notes })
      });
      if (!response.ok) throw new Error(`Razorpay order creation failed (${response.status})`);
      const order = await response.json();
      return { orderId: order.id, amountMinor: order.amount, currency: order.currency, keyId: razorpayKeyId };
    },

    verifyPayment: ({ orderId, paymentId, signature }) =>
      safeEqual(hmacHex(razorpayKeySecret, `${orderId}|${paymentId}`), signature),

    verifyWebhook: (rawBody, signature) =>
      Boolean(razorpayWebhookSecret) && safeEqual(hmacHex(razorpayWebhookSecret, rawBody), signature),

    parseWebhook: body => {
      const payment = body?.payload?.payment?.entity;
      if (!payment) return null;
      return {
        event: body.event,
        orderId: payment.order_id,
        paymentId: payment.id,
        amountMinor: payment.amount,
        captured: body.event === "payment.captured" || payment.status === "captured"
      };
    }
  };
};

/* Development/test gateway with the same contract. Signatures use MOCK_SECRET,
   so tests (and a dev frontend) can simulate a successful checkout. */
export const MOCK_SECRET = "mock-gateway-secret";

const mock = () => ({
  name: "mock",
  createOrder: async ({ amountMinor, currency }) => ({
    orderId: `order_mock_${randomUUID().replaceAll("-", "").slice(0, 14)}`,
    amountMinor,
    currency,
    keyId: "mock_key"
  }),
  verifyPayment: ({ orderId, paymentId, signature }) =>
    safeEqual(hmacHex(MOCK_SECRET, `${orderId}|${paymentId}`), signature),
  verifyWebhook: (rawBody, signature) => safeEqual(hmacHex(MOCK_SECRET, rawBody), signature),
  parseWebhook: body => {
    const payment = body?.payload?.payment?.entity;
    return payment
      ? {
          event: body.event,
          orderId: payment.order_id,
          paymentId: payment.id,
          amountMinor: payment.amount,
          captured: body.event === "payment.captured"
        }
      : null;
  }
});

/* Sign like the mock gateway would (tests and dev tooling) */
export const mockSign = data => hmacHex(MOCK_SECRET, data);

let instance = null;

export const paymentGateway = () => {
  if (!instance) instance = env.payments.provider === "razorpay" ? razorpay(env.payments) : mock();
  return instance;
};
