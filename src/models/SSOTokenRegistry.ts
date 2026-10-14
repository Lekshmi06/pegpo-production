import mongoose, { Document, Schema } from "mongoose";

export interface ISSOTokenRecord extends Document {
  jti: string;
  sourceSystem: "school" | "college";
  externalUserId: string;
  isConsumed: boolean;
  consumedAt?: Date;
  isRevoked: boolean;
  revokedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ssoTokenRecordSchema = new Schema<ISSOTokenRecord>(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    sourceSystem: {
      type: String,
      enum: ["school", "college"],
      required: true,
    },
    externalUserId: {
      type: String,
      required: true,
      trim: true,
    },
    isConsumed: {
      type: Boolean,
      default: false,
    },
    consumedAt: {
      type: Date,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    revokedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB TTL index: automatically deletes document once current time reaches expiresAt
ssoTokenRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ssoTokenRecordSchema.index({ jti: 1, isRevoked: 1 });

const SSOTokenRegistry = mongoose.model<ISSOTokenRecord>(
  "SSOTokenRegistry",
  ssoTokenRecordSchema
);

export default SSOTokenRegistry;
