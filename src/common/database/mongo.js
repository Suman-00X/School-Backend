import mongoose from "mongoose";
import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";

export const connectMongo = async () => {
  mongoose.set("strictQuery", true);

  /* Production builds indexes explicitly with `npm run mongo:sync-indexes` */
  await mongoose.connect(env.mongoUri, {
    autoIndex: !env.isProduction
  });

  logger.info("MongoDB connected");
};

export const closeMongo = () => mongoose.disconnect();
