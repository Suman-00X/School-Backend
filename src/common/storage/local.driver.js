import fs from "node:fs";
import path from "node:path";
import env from "../config/env.config.js";
import { createDownloadToken } from "./signedToken.js";

/* Files on local disk; downloads go through GET /files/signed/:token */
export const createLocalDriver = baseDir => {
  const root = path.resolve(baseDir);

  const resolveKey = key => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return full;
  };

  return {
    name: "local",

    put: async (key, body) => {
      const full = resolveKey(key);
      await fs.promises.mkdir(path.dirname(full), { recursive: true });
      await fs.promises.writeFile(full, body);
      return { key };
    },

    getStream: async key => {
      const full = resolveKey(key);
      await fs.promises.access(full);
      return fs.createReadStream(full);
    },

    remove: async key => {
      await fs.promises.rm(resolveKey(key), { force: true });
    },

    signedUrl: async (key, { fileName, contentType, expiresInSeconds = 900 } = {}) =>
      `${env.appUrl}/files/signed/${createDownloadToken({ key, fileName, contentType, expiresInSeconds })}`
  };
};
