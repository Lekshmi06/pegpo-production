import { Request, Response } from "express";
import SiteContent from "../models/SiteContent";

export const DEFAULT_SITE_CONTENT: Record<string, any> = {
  hero: {
    tagBadge: "Intelligent Unified LMS & Campus Platform",
    headlineLine1: "One platform.",
    headlineLine2Gradient: "Every learning journey.",
    subtitle: "EduPye brings students, educators, campuses, and corporate training teams into one connected cloud ecosystem. Unifying adaptive AI tutoring, smart teacher studios, verified course marketplace, and campus ERP operations.",
    primaryCtaText: "Get Started Free",
    secondaryCtaText: "Sign In to Portal",
  },
  tuitionBanner: {
    badge: "Centralized Tuition Ecosystem",
    title: "EduPye Tuition Mode",
    subtitle: "A high-focus, scheduled learning environment engineered for structured one-to-one programs, interactive SmartBoard live classes, combined study streams, and frictionless permanent code access.",
    feature1Title: "Permanent User Codes",
    feature1Desc: "Unique Student (STU-XXXXXX) and Teacher (TCH-XXXXXX) codes for instant tuition authentication.",
    feature2Title: "Dual-Dock SmartBoard",
    feature2Desc: "Phase 4 WebRTC live classroom with split-screen multi-mode docks, stylus annotations, and full-duplex video.",
    feature3Title: "Combined Study Stream",
    feature3Desc: "Program-specific real-time discussion rooms with PDF, image, and video exchange backed by 1-year compliant storage.",
    feature4Title: "15-Min Post-Session Logout",
    feature4Desc: "Automated security protocols ensure student classrooms gracefully close and log out idle participants.",
  },
  featuredPrograms: {
    programs: [
      {
        code: "PRG-PHY12-DEMO",
        title: "Class 12 Physics - Mechanics & Electromagnetism",
        subject: "Physics",
        grade: "Class 12",
        badge: "Popular",
        schedule: "Mon, Wed, Fri (17:00 - 18:30)",
      },
      {
        code: "PRG-CHEM12",
        title: "Class 12 Chemistry - Organic & Inorganic Prep",
        subject: "Chemistry",
        grade: "Class 12",
        badge: "Top Rated",
        schedule: "Tue, Thu, Sat (16:30 - 18:00)",
      },
      {
        code: "PRG-MATH12",
        title: "Class 12 Mathematics - Calculus & Vectors",
        subject: "Mathematics",
        grade: "Class 12",
        badge: "Comprehensive",
        schedule: "Mon, Wed, Fri (18:30 - 20:00)",
      },
    ],
  },
  announcements: {
    active: true,
    badge: "Announcement",
    message: "2026 Academic Term Tuition Mode is now active. Verify your permanent student/teacher code in your profile to access SmartBoard classrooms.",
    linkText: "Learn More",
    linkUrl: "/tuition-mode",
  },
};

export const contentController = {
  /**
   * GET /api/content
   * Public: Returns all live site content sections for Frontend-vercel
   */
  async getAllContent(req: Request, res: Response): Promise<void> {
    try {
      const records = await SiteContent.find({});
      const contentMap: Record<string, any> = { ...DEFAULT_SITE_CONTENT };

      for (const rec of records) {
        contentMap[rec.key] = rec.data;
      }

      res.status(200).json({
        success: true,
        data: contentMap,
      });
    } catch (err: any) {
      console.error("Error in getAllContent:", err);
      res.status(200).json({
        success: true,
        data: DEFAULT_SITE_CONTENT,
      });
    }
  },

  /**
   * GET /api/content/:key
   * Public: Returns content for a specific key
   */
  async getContentByKey(req: Request, res: Response): Promise<void> {
    try {
      const key = String(req.params.key);
      const record = await SiteContent.findOne({ key });
      if (record) {
        res.status(200).json({ success: true, key, data: record.data });
        return;
      }

      const defaultData = DEFAULT_SITE_CONTENT[key] || {};
      res.status(200).json({ success: true, key, data: defaultData });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PUT /api/admin/content/:key
   * Admin-protected: Updates or creates a site content section
   */
  async updateContentByKey(req: Request, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const payload = req.body;
      const user = req.user as any;
      const userName = user?.displayName || user?.name || user?.username || "Admin";

      const updated = await SiteContent.findOneAndUpdate(
        { key },
        {
          key,
          data: payload,
          lastUpdatedBy: userName,
          isPublished: true,
          publishedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      res.status(200).json({
        success: true,
        message: `Content section '${key}' updated successfully.`,
        key,
        data: updated.data,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * GET /api/cms/landing-page
   * Returns full Landing Page CMS data structure for ADMIN/frontend
   */
  async getLandingPageCms(req: Request, res: Response): Promise<void> {
    try {
      const { mode = "draft" } = req.query;
      const key = mode === "published" ? "landingPage_published" : "landingPage_draft";
      let record = await SiteContent.findOne({ key });

      if (!record && mode === "published") {
        record = await SiteContent.findOne({ key: "landingPage_draft" });
      }

      if (!record) {
        // Build initial standard structure
        const hero = DEFAULT_SITE_CONTENT.hero;
        const initialCms = {
          sectionVisibility: {
            hero: true,
            cinematicShowcase: true,
            statsAndShift: true,
            coreFeatures: true,
            dimensions: true,
            exploreOpportunities: true,
            blogMatrix: true,
            videoHub: true,
            whyAndTestimonials: true,
            finalCTA: true,
          },
          navbar: {
            brandName: "EduPye",
            brandHighlight: ".LMS",
            badge: "2026 Cloud",
            navLinks: [
              { label: "Features", href: "#features" },
              { label: "Tuition Mode", href: "#tuition" },
              { label: "How It Works", href: "#how-it-works" },
              { label: "Comparison", href: "#comparison" },
            ],
            signInText: "Sign In",
            ctaButtonText: "Get Started Free",
          },
          hero: {
            tagBadge: hero.tagBadge,
            headlineLine1: hero.headlineLine1,
            headlineLine2Gradient: hero.headlineLine2Gradient,
            subtitle: hero.subtitle,
            subtitleHighlight: "adaptive AI tutoring",
            primaryCtaText: hero.primaryCtaText,
            secondaryCtaText: hero.secondaryCtaText,
            proofBadges: ["Verified CBSE & ICSE", "1:1 Live SmartBoard", "1-Year Compliance Archive"],
            profiles: [],
          },
          exploreOpportunities: {
            sectionTag: "Opportunities",
            headingLine1: "Explore Verified",
            headingLine2Gradient: "Learning & Careers",
            subtitle: "Connecting students and educators across India.",
            categories: ["Science", "Mathematics", "Technology", "Humanities"],
            liveListingsCount: "1,200+",
            verifiedPartnersCount: "150+",
            tabs: [],
          },
        };

        res.status(200).json({ success: true, data: initialCms });
        return;
      }

      res.status(200).json({ success: true, data: record.data });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * PUT /api/cms/landing-page
   * Saves landing page draft
   */
  async saveLandingPageDraft(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;
      const user = req.user as any;
      const userName = user?.displayName || user?.name || user?.username || "Admin";

      const updated = await SiteContent.findOneAndUpdate(
        { key: "landingPage_draft" },
        {
          key: "landingPage_draft",
          data: payload,
          lastUpdatedBy: userName,
          isPublished: false,
        },
        { upsert: true, new: true }
      );

      // Also sync top-level hero & announcements
      if (payload.hero) {
        await SiteContent.findOneAndUpdate(
          { key: "hero" },
          {
            key: "hero",
            data: {
              tagBadge: payload.hero.tagBadge || DEFAULT_SITE_CONTENT.hero.tagBadge,
              headlineLine1: payload.hero.headlineLine1 || DEFAULT_SITE_CONTENT.hero.headlineLine1,
              headlineLine2Gradient: payload.hero.headlineLine2Gradient || DEFAULT_SITE_CONTENT.hero.headlineLine2Gradient,
              subtitle: payload.hero.subtitle || DEFAULT_SITE_CONTENT.hero.subtitle,
              primaryCtaText: payload.hero.primaryCtaText || DEFAULT_SITE_CONTENT.hero.primaryCtaText,
              secondaryCtaText: payload.hero.secondaryCtaText || DEFAULT_SITE_CONTENT.hero.secondaryCtaText,
            },
            lastUpdatedBy: userName,
            isPublished: true,
          },
          { upsert: true }
        );
      }

      res.status(200).json({ success: true, message: "Draft saved successfully", data: updated.data });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/cms/landing-page/publish
   * Publishes draft to live production
   */
  async publishLandingPage(req: Request, res: Response): Promise<void> {
    try {
      const draft = await SiteContent.findOne({ key: "landingPage_draft" });
      const draftData = draft ? draft.data : DEFAULT_SITE_CONTENT.hero;
      const user = req.user as any;
      const userName = user?.displayName || user?.name || user?.username || "Admin";

      const published = await SiteContent.findOneAndUpdate(
        { key: "landingPage_published" },
        {
          key: "landingPage_published",
          data: draftData,
          lastUpdatedBy: userName,
          isPublished: true,
          publishedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      // Sync live hero
      if (draftData.hero) {
        await SiteContent.findOneAndUpdate(
          { key: "hero" },
          {
            key: "hero",
            data: {
              tagBadge: draftData.hero.tagBadge,
              headlineLine1: draftData.hero.headlineLine1,
              headlineLine2Gradient: draftData.hero.headlineLine2Gradient,
              subtitle: draftData.hero.subtitle,
              primaryCtaText: draftData.hero.primaryCtaText,
              secondaryCtaText: draftData.hero.secondaryCtaText,
            },
            lastUpdatedBy: userName,
            isPublished: true,
            publishedAt: new Date(),
          },
          { upsert: true }
        );
      }

      res.status(200).json({ success: true, message: "Landing page published live", data: published.data });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * POST /api/cms/reset
   * Resets CMS to default copy
   */
  async resetLandingPage(req: Request, res: Response): Promise<void> {
    try {
      await SiteContent.deleteMany({ key: { $in: ["landingPage_draft", "landingPage_published"] } });
      res.status(200).json({ success: true, message: "Reset to system defaults complete", data: DEFAULT_SITE_CONTENT.hero });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default contentController;

