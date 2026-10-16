import mongoose from "mongoose";
import { tenantModel } from "../database/mongo.js";

/* Once-only side effects across retries, duplicate events and concurrent workers:

     if (!(await claimOnce(`results:${examId}`))) return;   // someone already did it

   The claim is a document with a unique key, so exactly one caller wins.
   Claims expire after 90 days. */
const claimSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }
});

const JobClaim = tenantModel("JobClaim", claimSchema);

export const claimOnce = async key => {
  try {
    await JobClaim.create({ key });
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
};

/* Release a claim (e.g. when the side effect failed and should be retried) */
export const releaseClaim = key => JobClaim.deleteOne({ key });
