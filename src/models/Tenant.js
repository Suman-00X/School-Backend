const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    address: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },

    description: { type: String },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);