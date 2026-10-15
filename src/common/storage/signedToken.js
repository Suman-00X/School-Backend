import { createHmac, timingSafeEqual } from "node:crypto";
import env from "../config/env.config.js";

/* Signed tokens for local downloads (S3 uses its own presigned URLs) */
const sign = payload => createHmac("sha256", env.jwtSecret).update(payload).digest("base64url");

export const createDownloadToken = ({ key, fileName, contentType, expiresInSeconds }) => {
  const payload = Buffer.from(
    JSON.stringify({ key, fileName, contentType, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

export const readDownloadToken = token => {
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  return data.exp >= Math.floor(Date.now() / 1000) ? data : null;
};
