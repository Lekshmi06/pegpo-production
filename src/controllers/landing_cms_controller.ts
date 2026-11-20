import { Request, Response } from "express";
import LandingPageContent from "../models/LandingPageContent";
import SiteContent from "../models/SiteContent";
import { isSuperAdmin, isAdmin, isTuitionOperationsAdmin } from "../middlewares/admin_module_middleware";

export const DEFAULT_LANDING_CONTENT = {
  announcementBanner: {
    enabled: true,
    text: "2026 Academic Term Tuition Mode is now active with SmartBoard live classes.",
    linkText: "Explore Tuition Mode",
    linkUrl: "/tuition-mode",
  },
  hero: {
    badgeText: "Intelligent Unified LMS & Campus Platform",
    title: "One platform. Every learning journey.",
    subtitle: "EduPye brings students, educators, campuses, and corporate training teams into one connected cloud ecosystem. Unifying adaptive AI tutoring, smart teacher studios, verified course marketplace, and campus ERP operations.",
    primaryCtaText: "Get Started Free",
    primaryCtaLink: "/signup",
    secondaryCtaText: "Sign In to Portal",
    secondaryCtaLink: "/login",
    heroImageUrl: "",
  },
  features: [
    {
      id: "ai-learning",
      title: "AI-Powered Learning Companion",
      description: "24/7 academic tutor trained specifically on official syllabi and competitive exam question banks with step-by-step proofs.",
      icon: "Brain",
    },
    {
      id: "smartboard",
      title: "Interactive Live SmartBoard Classroom",
      description: "Phase 4 WebRTC live classroom with split-screen multi-mode docks, real-time stylus annotations, and full-duplex video.",
      icon: "Tv",
    },
    {
      id: "course-marketplace",
      title: "Course Marketplace & Verified Credentials",
      description: "Curated academic masterclasses, competitive prep modules, and verified certification programs from top educators.",
      icon: "ShoppingBag",
    },
    {
      id: "tuition-mode",
      title: "Centralized Tuition Mode Ecosystem",
      description: "Permanent Student (STU-XXXXXX) & Teacher (TCH-XXXXXX) codes for scheduled 1:1 and cohort learning with auto-attendance.",
      icon: "GraduationCap",
    },
    {
      id: "campus-erp",
      title: "Campus & Institutional ERP Hub",
      description: "Multi-branch attendance, dynamic timetable management, automated fee collection, and comprehensive student rosters.",
      icon: "Building2",
    },
    {
      id: "compliance-recordings",
      title: "1-Year Compliance Classroom Archives",
      description: "Automated session recordings with participant attendance rosters preserved for a full 365 days of on-demand replay.",
      icon: "ShieldCheck",
    },
  ],
  howItWorks: [
    {
      stepNumber: 1,
      title: "Individuals Learn",
      description: "Personalized diagnostic baselines, adaptive study drills, 24/7 AI tutor guidance, and competitive exam cracker tools.",
    },
    {
      stepNumber: 2,
      title: "Educators Teach",
      description: "1-Click AI lesson blueprint generation, zero-lag cloud SmartBoard synchronization, and automated multi-format rubric grading.",
    },
    {
      stepNumber: 3,
      title: "Institutions Manage Operations",
      description: "Unified campus governance, faculty workloads, fee reconciliation, branch management, and verifiable credential issuance.",
    },
  ],
  faqs: [
    {
      id: "faq-1",
      question: "What is EduPye Tuition Mode?",
      answer: "EduPye Tuition Mode provides a distraction-free, scheduled virtual tuition classroom with permanent codes (STU-XXXXXX & TCH-XXXXXX), live interactive SmartBoard, and 1-year compliance replays.",
    },
    {
      id: "faq-2",
      question: "How does the AI Learning Companion work?",
      answer: "The AI companion is conditioned strictly on accredited textbooks, official syllabus boundaries, and verified question banks with rigid verification guardrails.",
    },
    {
      id: "faq-3",
      question: "Can educational institutions connect their existing systems?",
      answer: "Yes, EduPye supports Single Sign-On (SSO), secure iframe embedding for ERPs, and complete data export for institutional compliance.",
    },
    {
      id: "faq-4",
      question: "How are live class recordings retained?",
      answer: "Every live SmartBoard class is automatically processed, indexed with attendee duration logs, and retained for 365 days for student revision.",
    },
  ],
  footerContact: {
    tagline: "Empowering learners, educators, and institutions with next-generation unified learning technology.",
    supportEmail: "support@edupye.com",
    supportPhone: "+91 98765 43210",
    address: "Cyber City, Technology Corridor, Hyderabad, India",
    copyrightText: "© 2026 EduPye Inc. All rights reserved.",
  },
};

export const landingCmsController = {
  /**
   * GET /api/public/landing-content
   * Public: returns live landing page CMS content merged with defaults
   */
  async getPublicLandingContent(_req: Request, res: Response): Promise<void> {
    try {
      const doc = await LandingPageContent.findOne().sort({ updatedAt: -1 });
      if (!doc) {
        res.status(200).json({
          success: true,
          data: DEFAULT_LANDING_CONTENT,
        });
        return;
      }

      const raw = doc.toObject();
      // Ensure any missing sections are merged with sensible defaults
      const merged = {
        announcementBanner: {
          ...DEFAULT_LANDING_CONTENT.announcementBanner,
          ...(raw.announcementBanner || {}),
        },
        hero: {
          ...DEFAULT_LANDING_CONTENT.hero,
          ...(raw.hero || {}),
        },
        features: Array.isArray(raw.features) && raw.features.length > 0
          ? raw.features
          : DEFAULT_LANDING_CONTENT.features,
        howItWorks: Array.isArray(raw.howItWorks) && raw.howItWorks.length > 0
          ? raw.howItWorks
          : DEFAULT_LANDING_CONTENT.howItWorks,
        faqs: Array.isArray(raw.faqs) && raw.faqs.length > 0
          ? raw.faqs
          : DEFAULT_LANDING_CONTENT.faqs,
        footerContact: {
          ...DEFAULT_LANDING_CONTENT.footerContact,
          ...(raw.footerContact || {}),
        },
        updatedBy: raw.updatedBy,
        updatedAt: raw.updatedAt,
      };

      res.status(200).json({
        success: true,
        data: merged,
      });
    } catch (err: any) {
      console.error("[getPublicLandingContent error]:", err);
      res.status(200).json({
        success: true,
        data: DEFAULT_LANDING_CONTENT,
      });
    }
  },

  /**
   * PUT /api/admin/landing-content
   * Admin-protected: updates landing page content
   */
  async updateAdminLandingContent(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      const userRole = (user?.adminRole || user?.role || user?.activeRole || "").toLowerCase();
      const isAuthorized =
        isSuperAdmin(userRole) ||
        isAdmin(userRole) ||
        isTuitionOperationsAdmin(userRole) ||
        Boolean(user?.teacherCode);

      if (!isAuthorized) {
        res.status(403).json({
          success: false,
          message: "Access Denied: Only Super Admins and Admins can publish landing page content.",
        });
        return;
      }

      const body = req.body || {};
      const updatedBy = user?.displayName || user?.name || user?.username || "Admin";

      let doc = await LandingPageContent.findOne();
      if (!doc) {
        doc = new LandingPageContent({
          ...DEFAULT_LANDING_CONTENT,
          ...body,
          updatedBy,
        });
      } else {
        if (body.announcementBanner) doc.announcementBanner = body.announcementBanner;
        if (body.hero) doc.hero = body.hero;
        if (Array.isArray(body.features)) doc.features = body.features;
        if (Array.isArray(body.howItWorks)) doc.howItWorks = body.howItWorks;
        if (Array.isArray(body.faqs)) doc.faqs = body.faqs;
        if (body.footerContact) doc.footerContact = body.footerContact;
        doc.updatedBy = updatedBy;
      }

      await doc.save();

      // Also sync top-level SiteContent records for backward compatibility
      try {
        if (body.hero) {
          await SiteContent.findOneAndUpdate(
            { key: "hero" },
            {
              key: "hero",
              data: {
                tagBadge: body.hero.badgeText,
                headlineLine1: body.hero.title,
                headlineLine2Gradient: "",
                subtitle: body.hero.subtitle,
                primaryCtaText: body.hero.primaryCtaText,
                secondaryCtaText: body.hero.secondaryCtaText,
              },
              lastUpdatedBy: updatedBy,
              isPublished: true,
            },
            { upsert: true }
          );
        }

        if (body.announcementBanner) {
          await SiteContent.findOneAndUpdate(
            { key: "announcements" },
            {
              key: "announcements",
              data: {
                active: body.announcementBanner.enabled,
                badge: "Announcement",
                message: body.announcementBanner.text,
                linkText: body.announcementBanner.linkText,
                linkUrl: body.announcementBanner.linkUrl,
              },
              lastUpdatedBy: updatedBy,
              isPublished: true,
            },
            { upsert: true }
          );
        }
      } catch (syncErr) {
        console.warn("Notice: SiteContent sync warning:", syncErr);
      }

      res.status(200).json({
        success: true,
        message: "Landing page content published successfully.",
        data: doc,
      });
    } catch (err: any) {
      console.error("[updateAdminLandingContent error]:", err);
      res.status(500).json({
        success: false,
        message: err.message || "Failed to update landing page content.",
      });
    }
  },

  /**
   * POST /api/admin/landing-content/reset
   * Admin-protected: resets content back to system defaults
   */
  async resetLandingContent(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as any;
      const userRole = (user?.adminRole || user?.role || user?.activeRole || "").toLowerCase();
      const isAuthorized = isSuperAdmin(userRole) || isAdmin(userRole);

      if (!isAuthorized) {
        res.status(403).json({
          success: false,
          message: "Access Denied: Only Super Admins can reset landing page content.",
        });
        return;
      }

      await LandingPageContent.deleteMany({});
      const updatedBy = user?.displayName || user?.name || user?.username || "Admin";
      const doc = await LandingPageContent.create({
        ...DEFAULT_LANDING_CONTENT,
        updatedBy,
      });

      res.status(200).json({
        success: true,
        message: "Landing page content reset to defaults.",
        data: doc,
      });
    } catch (err: any) {
      console.error("[resetLandingContent error]:", err);
      res.status(500).json({
        success: false,
        message: err.message || "Failed to reset landing page content.",
      });
    }
  },
};

export default landingCmsController;
