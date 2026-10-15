import env from "../config/env.config.js";
import { createLocalDriver } from "./local.driver.js";

/* Object storage: S3 (or any S3-compatible service) in production, local disk otherwise.

     await storage.put(key, buffer, { contentType });
     const url = await storage.signedUrl(key, { fileName, expiresInSeconds: 900 });

   Keys are chosen by callers and should start with the tenant id. */

let driver = null;

const getDriver = async () => {
  if (driver) return driver;
  if (env.storage.driver === "s3") {
    const { createS3Driver } = await import("./s3.driver.js");
    driver = createS3Driver(env.storage);
  } else {
    driver = createLocalDriver(env.storage.localDir);
  }
  return driver;
};

export const storage = {
  put: async (key, body, options = {}) => (await getDriver()).put(key, body, options),
  getStream: async key => (await getDriver()).getStream(key),
  remove: async key => (await getDriver()).remove(key),
  signedUrl: async (key, options = {}) => (await getDriver()).signedUrl(key, options)
};
