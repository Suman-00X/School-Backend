import mongoose from "mongoose";
import env from "./env.config.js";

const connectDb = async () => {
  mongoose.set("strictQuery", true);

  /* Production builds indexes explicitly with `npm run sync-indexes` */
  await mongoose.connect(env.mongoUri, {
    autoIndex: env.nodeEnv !== "production"
  });

  console.log("MongoDB connected");
};

export default connectDb;
