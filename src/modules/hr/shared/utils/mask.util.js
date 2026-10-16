/* Sensitive identifiers are returned with all but the last 4 characters hidden:
   "123456789012" -> "XXXXXXXX9012" */
import { decryptField, encryptField } from "../../../../common/crypto/fieldEncryption.js";

export const maskTail = (value, visible = 4) => {
  if (!value) return value ?? null;
  const text = String(value);
  return text.length <= visible ? "X".repeat(text.length) : "X".repeat(text.length - visible) + text.slice(-visible);
};

/* Bank account and PAN are encrypted at rest and only ever shown masked */
export const sealSensitive = encryptField;
export const maskSensitive = value => maskTail(decryptField(value));
