import mongoose from "mongoose";
import env from "../../config/env.config.js";

export const connectMongo = async () => {
  mongoose.set("strictQuery", true);

  /* Production builds indexes explicitly with `npm run mongo:sync-indexes` */
  await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== "production"
  });

  console.log("MongoDB connected");
};

export const closeMongo = () => mongoose.disconnect();
