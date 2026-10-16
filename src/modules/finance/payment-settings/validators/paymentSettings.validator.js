import { z } from "../../../../common/validation/zod.js";

const secret = () =>
  z
    .string()
    .trim()
    .min(8, "must be at least 8 characters")
    .max(256)
    .regex(/^\S+$/, "must not contain spaces")
    /* Looks like our own ciphertext: storing it would break decryption */
    .refine(value => !value.startsWith("enc:"), "is not a valid key");

export const paymentSettingsValidators = {
  /* All three together: the keys are a set */
  replace: {
    body: z.object({
      keyId: z
        .string()
        .trim()
        .regex(/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, "must be a Razorpay key id (rzp_test_… or rzp_live_…)"),
      keySecret: secret(),
      webhookSecret: secret()
    })
  }
};
