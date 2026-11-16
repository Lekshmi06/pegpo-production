import mongoose, { Document, Schema } from "mongoose";

export interface IParty extends Document {
  id: string;
  name: string;
  role: "Customer" | "Supplier" | "Both";
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  address?: string;
  placeOfSupply?: string;
  defaultAccount?: string;
  openingBalance?: number;
  outstandingAmount?: number;
  status: "Active" | "Inactive";
  createdAt: Date;
  updatedAt: Date;
}

const PartySchema = new Schema<IParty>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, unique: true, index: true },
    role: {
      type: String,
      enum: ["Customer", "Supplier", "Both"],
      default: "Customer",
    },
    gstin: { type: String, default: "" },
    pan: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    placeOfSupply: { type: String, default: "Maharashtra" },
    defaultAccount: { type: String, default: "Debtors" },
    openingBalance: { type: Number, default: 0 },
    outstandingAmount: { type: Number, default: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  {
    timestamps: true,
  }
);

export const Party =
  mongoose.models.Party || mongoose.model<IParty>("Party", PartySchema);
export default Party;

