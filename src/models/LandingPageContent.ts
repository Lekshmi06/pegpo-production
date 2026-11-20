import mongoose, { Document, Schema } from "mongoose";

export interface IFeatureItem {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface IHowItWorksStep {
  stepNumber: number;
  title: string;
  description: string;
}

export interface IFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ILandingPageContent extends Document {
  announcementBanner: {
    enabled: boolean;
    text: string;
    linkText?: string;
    linkUrl?: string;
  };
  hero: {
    badgeText: string;
    title: string;
    subtitle: string;
    primaryCtaText: string;
    primaryCtaLink: string;
    secondaryCtaText: string;
    secondaryCtaLink: string;
    heroImageUrl?: string;
  };
  features: IFeatureItem[];
  howItWorks: IHowItWorksStep[];
  faqs: IFaqItem[];
  footerContact: {
    tagline: string;
    supportEmail: string;
    supportPhone: string;
    address: string;
    copyrightText: string;
  };
  updatedBy?: string;
  updatedAt?: Date;
  createdAt?: Date;
}

const landingPageContentSchema = new Schema<ILandingPageContent>(
  {
    announcementBanner: {
      enabled: { type: Boolean, default: true },
      text: { type: String, default: "" },
      linkText: { type: String, default: "" },
      linkUrl: { type: String, default: "" },
    },
    hero: {
      badgeText: { type: String, default: "" },
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
      primaryCtaText: { type: String, default: "" },
      primaryCtaLink: { type: String, default: "" },
      secondaryCtaText: { type: String, default: "" },
      secondaryCtaLink: { type: String, default: "" },
      heroImageUrl: { type: String, default: "" },
    },
    features: [
      {
        id: { type: String, default: () => `feat-${Date.now()}` },
        title: { type: String, default: "" },
        description: { type: String, default: "" },
        icon: { type: String, default: "Sparkles" },
      },
    ],
    howItWorks: [
      {
        stepNumber: { type: Number, default: 1 },
        title: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    ],
    faqs: [
      {
        id: { type: String, default: () => `faq-${Date.now()}` },
        question: { type: String, default: "" },
        answer: { type: String, default: "" },
      },
    ],
    footerContact: {
      tagline: { type: String, default: "" },
      supportEmail: { type: String, default: "" },
      supportPhone: { type: String, default: "" },
      address: { type: String, default: "" },
      copyrightText: { type: String, default: "" },
    },
    updatedBy: { type: String, default: "system" },
  },
  { timestamps: true }
);

export default mongoose.models.LandingPageContent ||
  mongoose.model<ILandingPageContent>("LandingPageContent", landingPageContentSchema);
