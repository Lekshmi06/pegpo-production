import mongoose, { Document, Schema } from "mongoose";

export interface IAccount extends Document {
  id: string;
  name: string;
  accountType?: string;
  rootType: "Asset" | "Liability" | "Equity" | "Income" | "Expense" | "Other";
  parent?: string | null;
  isGroup?: boolean;
  balance?: number;
  currency?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, unique: true, index: true },
    accountType: { type: String, default: "General" },
    rootType: {
      type: String,
      enum: ["Asset", "Liability", "Equity", "Income", "Expense", "Other"],
      default: "Asset",
    },
    parent: { type: String, default: null },
    isGroup: { type: Boolean, default: false },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
  },
  {
    timestamps: true,
  }
);

export const Account =
  mongoose.models.Account || mongoose.model<IAccount>("Account", AccountSchema);
export default Account;

