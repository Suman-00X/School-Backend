import mongoose from "mongoose";

const parentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    parentCode: { 
      type: String, 
      required: true 
    },

    occupation: { type: String },
    annualIncome: { type: Number },
    description: { type: String },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

parentSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true }
);

export default mongoose.model("Parent", parentSchema);
