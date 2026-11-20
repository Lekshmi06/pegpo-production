import mongoose, { Document, Schema } from "mongoose";

export interface ISiteContent extends Document {
  key: string; // e.g. "hero", "tuitionBanner", "featuredPrograms", "announcements", "landingPage"
  section: string;
  data: Record<string, any>;
  lastUpdatedBy?: string;
  isPublished: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const siteContentSchema = new Schema<ISiteContent>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    section: {
      type: String,
      default: "general",
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    lastUpdatedBy: {
      type: String,
      default: "system",
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.models.SiteContent ||
  mongoose.model<ISiteContent>("SiteContent", siteContentSchema);
