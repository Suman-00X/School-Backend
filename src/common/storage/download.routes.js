import { Router } from "express";
import { notFound } from "../http/errors.js";
import { readDownloadToken } from "./signedToken.js";
import { storage } from "./storage.js";

/* GET /files/signed/:token, for local-disk storage. The token itself is the
   authorization (HMAC-signed, short-lived), like an S3 presigned URL. */
const router = Router();

router.get("/signed/:token", async (req, res) => {
  const grant = readDownloadToken(req.params.token);
  if (!grant) throw notFound("File");

  let stream;
  try {
    stream = await storage.getStream(grant.key);
  } catch {
    throw notFound("File");
  }

  res.setHeader("Content-Type", grant.contentType ?? "application/octet-stream");
  if (grant.fileName) {
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(grant.fileName)}"`);
  }
  res.setHeader("Cache-Control", "private, max-age=0, no-store");
  stream.pipe(res);
});

export default router;
