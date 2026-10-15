import mongoose from "mongoose";

const serialCounterSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true
    },

    scope: {
      type: String,
      required: true
    },

    seq: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

// one serial stream per tenant per scope
serialCounterSchema.index(
  { tenantId: 1, scope: 1 },
  { unique: true }
);

export default mongoose.model("SerialCounter", serialCounterSchema);
