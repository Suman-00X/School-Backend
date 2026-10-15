import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    middleName: { type: String },
    lastName: { type: String, required: true },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },

    phone: { type: String },

    passwordHash: { type: String, required: true },

    role: {
      type: String,
      enum: ["ADMIN", "TEACHER", "STUDENT", "PARENT"],
      required: true
    },

    gender: { type: String, enum: ["MALE", "FEMALE", "OTHER"] },
    dob: { type: Date },
    address: { type: String },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "BLOCKED"],
      default: "ACTIVE"
    },

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

userSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true }
);

userSchema.index(
  { tenantId: 1, role: 1 }
);

export default mongoose.model("User", userSchema);