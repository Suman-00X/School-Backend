import mongoose from "mongoose";
import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";

let watching = false;

/* Connection changes after start-up are worth a log line each */
const watchConnection = () => {
  if (watching) return;
  watching = true;
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  mongoose.connection.on("error", error => logger.error({ err: error }, "MongoDB connection error"));
};

export const connectMongo = async () => {
  mongoose.set("strictQuery", true);
  watchConnection();

  /* Production builds indexes explicitly with `npm run mongo:sync-indexes` */
  await mongoose.connect(env.mongoUri, {
    autoIndex: !env.isProduction
  });

  logger.info("MongoDB connected");
};

export const closeMongo = () => mongoose.disconnect();
