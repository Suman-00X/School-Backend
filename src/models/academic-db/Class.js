import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true
    },

    classOrder: {
      type: Number,
      required: true
    },

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

classSchema.index(
  { tenantId: 1, className: 1 },
  { unique: true }
);

classSchema.index(
  { tenantId: 1, classOrder: 1 },
  { unique: true }
);

export default mongoose.model("Class", classSchema);