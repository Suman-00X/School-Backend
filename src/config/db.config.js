import mongoose from "mongoose";
import env from "./env.config.js";

const connectDb = async () => {
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.mongoUri, {
    autoIndex: false
  });

  console.log("MongoDB connected");
};

export default connectDb;
