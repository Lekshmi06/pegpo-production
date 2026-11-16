import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";

// Dynamic schemas for collections in the shared database
const UserProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    track: String,
    mode: String,
    contact: mongoose.Schema.Types.Mixed,
    personal: mongoose.Schema.Types.Mixed,
    education: mongoose.Schema.Types.Mixed,
    educationsList: Array,
    experience: mongoose.Schema.Types.Mixed,
    experiencesList: Array,
    skills: [String],
    academicPercentage: Number,
  },
  { timestamps: true, collection: "userprofiles", strict: false }
);

const UserProfile =
  mongoose.models.UserProfile ||
  mongoose.model("UserProfile", UserProfileSchema);

const RecruiterOrganizationSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    entity: { type: String, enum: ["company", "institution", "startup"] },
    name: { type: String, required: true },
    address: String,
    headquarters: String,
    orgType: String,
    employees: String,
    ceoName: String,
    ceoEmail: String,
    phone: String,
    industry: String,
    website: String,
    bio: String,
    description: String,
    founders: String,
    coFounders: Array,
    foundingTheme: String,
    sector: String,
    executiveLeadership: String,
    accreditations: String,
    mission: String,
    totalEnrollment: String,
    fundraisingProfile: mongoose.Schema.Types.Mixed,
    accountStatus: { type: String, default: "Active" },
    verificationStatus: { type: String, default: "Pending" },
    documents: Array,
    recentActivity: Array,
  },
  { timestamps: true, collection: "recruiterorganizations", strict: false }
);

const RecruiterOrganization =
  mongoose.models.RecruiterOrganization ||
  mongoose.model("RecruiterOrganization", RecruiterOrganizationSchema);

const ResumeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    title: String,
    templateId: String,
    atsScore: Number,
  },
  { timestamps: true, collection: "resumes", strict: false }
);

const Resume =
  mongoose.models.Resume || mongoose.model("Resume", ResumeSchema);

export const adminPlatformController = {
  // -------------------------------------------------------------------------
  // CANDIDATES
  // -------------------------------------------------------------------------
  async getCandidates(req: Request, res: Response): Promise<void> {
    try {
      const candidateUsers = await User.find({
        role: { $in: ["user", "candidate", "USER", null, undefined] },
      } as any)
        .sort({ createdAt: -1 })
        .lean();

      const userIds = candidateUsers.map((u: any) => u._id);
      const profiles: any[] = await UserProfile.find({ userId: { $in: userIds } }).lean();
      const resumes: any[] = await Resume.find({ userId: { $in: userIds } }).lean();

      const profileMap = new Map();
      profiles.forEach((p) => profileMap.set(p.userId?.toString(), p));

      const resumeMap = new Map();
      resumes.forEach((r) => resumeMap.set(r.userId?.toString(), r));

      const formatted = candidateUsers.map((u: any) => {
        const idStr = u._id.toString();
        const profile = profileMap.get(idStr);
        const resume = resumeMap.get(idStr);

        const name =
          profile?.contact?.fullName ||
          u.fullName ||
          u.displayName ||
          u.name ||
          u.username ||
          "Candidate";
        const email = u.email || profile?.contact?.email || "";
        const phone = profile?.contact?.phone || u.phone || "+91 98000 00000";
        const locParts = [profile?.contact?.city, profile?.contact?.country].filter(Boolean);
        const location = locParts.length > 0 ? locParts.join(", ") : "Bengaluru, India";
        const education =
          profile?.education?.degree || profile?.educationsList?.[0]?.degree || "B.Tech Graduate";
        const college =
          profile?.education?.institution ||
          profile?.educationsList?.[0]?.institution ||
          "Engineering College";
        const endYearStr = profile?.education?.endYear || profile?.educationsList?.[0]?.endYear;
        const passoutYear = endYearStr ? String(new Date(endYearStr).getFullYear()) : "2025";
        const score = resume?.atsScore || profile?.academicPercentage || 85;

        const skillList =
          Array.isArray(profile?.skills) && profile.skills.length > 0
            ? profile.skills
            : ["React", "Node.js", "TypeScript", "Problem Solving"];

        const experienceStr =
          profile?.experience?.title ||
          profile?.experiencesList?.[0]?.title ||
          "Fresh Graduate (0 Years)";

        const registrationDate = u.createdAt
          ? new Date(u.createdAt).toISOString().split("T")[0]
          : "2026-08-01";

        return {
          id: idStr,
          name,
          email,
          phone,
          location,
          education,
          college,
          passoutYear,
          score,
          skills: skillList,
          experience: experienceStr,
          accountStatus: u.status === "Locked" ? "Suspended" : u.status || "Active",
          verificationStatus: u.isEmailVerified ? "Verified" : "Pending",
          registrationDate,
          documents: [
            { name: "Resume.pdf", type: "Resume", verified: true },
            { name: "Degree_Certificate.pdf", type: "Education", verified: false },
          ],
          activityLog: [
            {
              id: `act-${u._id}`,
              action: "Candidate profile registered",
              timestamp: u.createdAt
                ? new Date(u.createdAt).toLocaleString()
                : new Date().toLocaleString(),
            },
          ],
        };
      });

      res.json({ success: true, data: formatted });
    } catch (err: any) {
      console.error("Error fetching candidates:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch candidates",
        error: err.message,
      });
    }
  },

  async getCandidateStats(req: Request, res: Response): Promise<void> {
    try {
      const candidates: any[] = await User.find({
        role: { $in: ["user", "candidate", "USER", null, undefined] },
      } as any).lean();

      const total = candidates.length;
      const active = candidates.filter(
        (c) => c.status !== "Locked" && c.status !== "Inactive" && c.status !== "suspended"
      ).length;
      const pending = candidates.filter((c) => !c.isEmailVerified).length;
      const suspended = candidates.filter(
        (c) => c.status === "Locked" || c.status === "Suspended" || c.status === "suspended"
      ).length;

      res.json({ success: true, data: { total, active, pending, suspended } });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch candidate stats",
        error: err.message,
      });
    }
  },

  async updateCandidateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { accountStatus, verificationStatus } = req.body;

      const updateData: any = {};
      if (accountStatus) {
        updateData.status = accountStatus === "Suspended" ? "Locked" : accountStatus;
      }
      if (verificationStatus) {
        updateData.isEmailVerified = verificationStatus === "Verified";
      }

      const updated = await User.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      ).lean();
      if (!updated) {
        res.status(404).json({ success: false, message: "Candidate not found" });
        return;
      }

      res.json({
        success: true,
        message: "Candidate status updated successfully",
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update candidate status",
        error: err.message,
      });
    }
  },

  async deleteCandidate(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await User.findByIdAndUpdate(id, { $set: { status: "Locked" } });
      res.json({ success: true, message: "Candidate archived successfully" });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete candidate",
        error: err.message,
      });
    }
  },

  // -------------------------------------------------------------------------
  // STARTUPS
  // -------------------------------------------------------------------------
  async getStartups(req: Request, res: Response): Promise<void> {
    try {
      const orgs: any[] = await RecruiterOrganization.find({ entity: "startup" })
        .sort({ createdAt: -1 })
        .lean();

      const startupUsers: any[] = await User.find({
        role: "recruiter",
        entityType: "startup",
      }).lean();

      const userOrgIds = new Set(orgs.map((o) => o.ownerUserId?.toString()).filter(Boolean));
      const orphanUsers = startupUsers.filter((u) => !userOrgIds.has(u._id.toString()));

      const formattedOrgs = orgs.map((o) => ({
        id: o._id.toString(),
        name: o.name,
        logo: "🚀",
        founder: o.ceoName || o.founders || "Founder",
        coFounders: o.coFounders || [],
        email: o.ceoEmail || "founders@startup.io",
        phone: o.phone || "+91 98888 12345",
        industry: o.industry || o.sector || "HealthTech / AI",
        location: o.headquarters || o.address || "Bengaluru, Karnataka",
        stage: o.fundraisingProfile?.fundingStage || "Seed",
        website: o.website || "https://startup.io",
        description:
          o.description || o.bio || "Innovative technology startup on LetGetIn.",
        tagline: o.foundingTheme || "Autonomous tech solutions.",
        teamSize: o.employees || "10-25 Members",
        fundingRaised: o.fundraisingProfile?.raisedAmount
          ? `$${o.fundraisingProfile.raisedAmount}`
          : "$1.5M",
        documents: o.documents || [],
        accountStatus: o.accountStatus || "Active",
        verificationStatus: o.verificationStatus || "Verified",
        registrationDate: o.createdAt
          ? new Date(o.createdAt).toISOString().split("T")[0]
          : "2026-08-10",
        recentActivity: o.recentActivity || [
          {
            id: `act-${o._id}`,
            action: "Startup registered on LetGetIn",
            timestamp: o.createdAt
              ? new Date(o.createdAt).toLocaleString()
              : new Date().toLocaleString(),
          },
        ],
      }));

      orphanUsers.forEach((u) => {
        formattedOrgs.unshift({
          id: u._id.toString(),
          name: u.fullName || u.displayName || u.username || "New Startup",
          logo: "⚡",
          founder: u.fullName || u.displayName || u.username,
          coFounders: [],
          email: u.email || "founder@startup.io",
          phone: u.phone || "+91 98888 00000",
          industry: "Emerging Tech / SaaS",
          location: "India",
          stage: "Pre-Seed",
          website: "https://startup.io",
          description: "New startup registered on LetGetIn.",
          tagline: "Next-gen tech innovation.",
          teamSize: "1-10 Members",
          fundingRaised: "$100K",
          documents: [],
          accountStatus: "Active",
          verificationStatus: u.isEmailVerified ? "Verified" : "Pending",
          registrationDate: u.createdAt
            ? new Date(u.createdAt).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
          recentActivity: [
            {
              id: `act-${u._id}`,
              action: "Startup account registered on LetGetIn",
              timestamp: u.createdAt
                ? new Date(u.createdAt).toLocaleString()
                : new Date().toLocaleString(),
            },
          ],
        });
      });

      res.json({ success: true, data: formattedOrgs });
    } catch (err: any) {
      console.error("Error fetching startups:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch startups",
        error: err.message,
      });
    }
  },

  async getStartupStats(req: Request, res: Response): Promise<void> {
    try {
      const orgs: any[] = await RecruiterOrganization.find({ entity: "startup" }).lean();
      const users: any[] = await User.find({ role: "recruiter", entityType: "startup" }).lean();
      const total = Math.max(orgs.length, users.length);
      const active = orgs.filter((o) => o.accountStatus === "Active").length || total;
      const pending = orgs.filter((o) => o.verificationStatus === "Pending").length;
      const suspended = orgs.filter((o) => o.accountStatus === "Suspended").length;

      res.json({ success: true, data: { total, active, pending, suspended } });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch startup stats",
        error: err.message,
      });
    }
  },

  async updateStartupStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { accountStatus, verificationStatus } = req.body;
      const updateData: any = {};
      if (accountStatus) updateData.accountStatus = accountStatus;
      if (verificationStatus) updateData.verificationStatus = verificationStatus;

      let updated = await RecruiterOrganization.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      ).lean();
      if (!updated) {
        await User.findByIdAndUpdate(id, {
          $set: { status: accountStatus === "Suspended" ? "Locked" : "Active" },
        });
      }

      res.json({
        success: true,
        message: "Startup status updated successfully",
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update startup status",
        error: err.message,
      });
    }
  },

  async deleteStartup(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await RecruiterOrganization.findByIdAndUpdate(id, {
        $set: { accountStatus: "Suspended" },
      });
      res.json({ success: true, message: "Startup archived successfully" });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete startup",
        error: err.message,
      });
    }
  },

  // -------------------------------------------------------------------------
  // COMPANIES
  // -------------------------------------------------------------------------
  async getCompanies(req: Request, res: Response): Promise<void> {
    try {
      const orgs: any[] = await RecruiterOrganization.find({ entity: "company" })
        .sort({ createdAt: -1 })
        .lean();

      const companyUsers: any[] = await User.find({
        role: "recruiter",
        entityType: "company",
      }).lean();

      const userOrgIds = new Set(orgs.map((o) => o.ownerUserId?.toString()).filter(Boolean));
      const orphanUsers = companyUsers.filter((u) => !userOrgIds.has(u._id.toString()));

      const formatted = orgs.map((o) => ({
        id: o._id.toString(),
        name: o.name,
        logo: "🏢",
        contactPerson: o.ceoName || "HR Lead",
        contactRole: "Head of Talent Acquisition",
        email: o.ceoEmail || "careers@company.com",
        phone: o.phone || "+91 80 4000 0000",
        industry: o.industry || "Technology & Enterprise",
        location: o.headquarters || o.address || "Bengaluru, Karnataka",
        companySize: o.employees || "50-200",
        website: o.website || "https://company.com",
        description:
          o.description || o.bio || "Enterprise hiring partner on LetGetIn.",
        activeHiringPositions: 12,
        documents: o.documents || [],
        accountStatus: o.accountStatus || "Active",
        verificationStatus: o.verificationStatus || "Verified",
        registrationDate: o.createdAt
          ? new Date(o.createdAt).toISOString().split("T")[0]
          : "2026-06-10",
        recentActivity: o.recentActivity || [
          {
            id: `act-${o._id}`,
            action: "Company registered on LetGetIn",
            timestamp: o.createdAt
              ? new Date(o.createdAt).toLocaleString()
              : new Date().toLocaleString(),
          },
        ],
      }));

      orphanUsers.forEach((u) => {
        formatted.unshift({
          id: u._id.toString(),
          name: u.fullName || u.displayName || u.username || "New Company Ltd",
          logo: "🏢",
          contactPerson: u.fullName || u.displayName || u.username,
          contactRole: "Talent Acquisition Manager",
          email: u.email || "hr@company.com",
          phone: u.phone || "+91 80 2000 0000",
          industry: "Enterprise Software",
          location: "India",
          companySize: "50-200",
          website: "https://company.com",
          description: "Company account created on LetGetIn.",
          activeHiringPositions: 4,
          documents: [],
          accountStatus: "Active",
          verificationStatus: u.isEmailVerified ? "Verified" : "Pending",
          registrationDate: u.createdAt
            ? new Date(u.createdAt).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
          recentActivity: [
            {
              id: `act-${u._id}`,
              action: "Company account registered on LetGetIn",
              timestamp: u.createdAt
                ? new Date(u.createdAt).toLocaleString()
                : new Date().toLocaleString(),
            },
          ],
        });
      });

      res.json({ success: true, data: formatted });
    } catch (err: any) {
      console.error("Error fetching companies:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch companies",
        error: err.message,
      });
    }
  },

  async getCompanyStats(req: Request, res: Response): Promise<void> {
    try {
      const orgs: any[] = await RecruiterOrganization.find({ entity: "company" }).lean();
      const users: any[] = await User.find({ role: "recruiter", entityType: "company" }).lean();
      const total = Math.max(orgs.length, users.length);
      const active = orgs.filter((o) => o.accountStatus === "Active").length || total;
      const pending = orgs.filter((o) => o.verificationStatus === "Pending").length;
      const suspended = orgs.filter((o) => o.accountStatus === "Suspended").length;

      res.json({ success: true, data: { total, active, pending, suspended } });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch company stats",
        error: err.message,
      });
    }
  },

  async updateCompanyStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { accountStatus, verificationStatus } = req.body;
      const updateData: any = {};
      if (accountStatus) updateData.accountStatus = accountStatus;
      if (verificationStatus) updateData.verificationStatus = verificationStatus;

      let updated = await RecruiterOrganization.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      ).lean();
      if (!updated) {
        await User.findByIdAndUpdate(id, {
          $set: { status: accountStatus === "Suspended" ? "Locked" : "Active" },
        });
      }

      res.json({
        success: true,
        message: "Company status updated successfully",
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update company status",
        error: err.message,
      });
    }
  },

  async deleteCompany(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await RecruiterOrganization.findByIdAndUpdate(id, {
        $set: { accountStatus: "Suspended" },
      });
      res.json({ success: true, message: "Company archived successfully" });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete company",
        error: err.message,
      });
    }
  },

  // -------------------------------------------------------------------------
  // INSTITUTIONS
  // -------------------------------------------------------------------------
  async getInstitutions(req: Request, res: Response): Promise<void> {
    try {
      const orgs: any[] = await RecruiterOrganization.find({ entity: "institution" })
        .sort({ createdAt: -1 })
        .lean();

      const instUsers: any[] = await User.find({
        role: "recruiter",
        entityType: "institution",
      }).lean();

      const userOrgIds = new Set(orgs.map((o) => o.ownerUserId?.toString()).filter(Boolean));
      const orphanUsers = instUsers.filter((u) => !userOrgIds.has(u._id.toString()));

      const formatted = orgs.map((o) => ({
        id: o._id.toString(),
        name: o.name,
        logo: "🏛️",
        contactPerson: o.ceoName || o.executiveLeadership || "Dean of Placements",
        contactRole: "Dean of Career Development",
        email: o.ceoEmail || "placement@institution.edu",
        phone: o.phone || "+91 11 2000 0000",
        institutionType: o.orgType || "Central University",
        location: o.address || o.headquarters || "New Delhi, Delhi",
        website: o.website || "https://institution.edu",
        description:
          o.description ||
          o.mission ||
          "Premier educational and research institution on LetGetIn.",
        accreditation: o.accreditations || "NIRF Top 20 / NAAC A++",
        totalStudents: o.totalEnrollment || "5,000+ Students",
        documents: o.documents || [],
        accountStatus: o.accountStatus || "Active",
        verificationStatus: o.verificationStatus || "Verified",
        registrationDate: o.createdAt
          ? new Date(o.createdAt).toISOString().split("T")[0]
          : "2026-06-01",
        recentActivity: o.recentActivity || [
          {
            id: `act-${o._id}`,
            action: "Institution registered on LetGetIn",
            timestamp: o.createdAt
              ? new Date(o.createdAt).toLocaleString()
              : new Date().toLocaleString(),
          },
        ],
      }));

      orphanUsers.forEach((u) => {
        formatted.unshift({
          id: u._id.toString(),
          name: u.fullName || u.displayName || u.username || "New University",
          logo: "🏛️",
          contactPerson: u.fullName || u.displayName || u.username,
          contactRole: "Placement Coordinator",
          email: u.email || "placement@university.edu",
          phone: u.phone || "+91 11 3000 0000",
          institutionType: "Engineering College",
          location: "India",
          website: "https://university.edu",
          description: "Institution account registered on LetGetIn.",
          accreditation: "UGC Recognized",
          totalStudents: "2,500+ Students",
          documents: [],
          accountStatus: "Active",
          verificationStatus: u.isEmailVerified ? "Verified" : "Pending",
          registrationDate: u.createdAt
            ? new Date(u.createdAt).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
          recentActivity: [
            {
              id: `act-${u._id}`,
              action: "Institution registered on LetGetIn",
              timestamp: u.createdAt
                ? new Date(u.createdAt).toLocaleString()
                : new Date().toLocaleString(),
            },
          ],
        });
      });

      res.json({ success: true, data: formatted });
    } catch (err: any) {
      console.error("Error fetching institutions:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch institutions",
        error: err.message,
      });
    }
  },

  async getInstitutionStats(req: Request, res: Response): Promise<void> {
    try {
      const orgs: any[] = await RecruiterOrganization.find({ entity: "institution" }).lean();
      const users: any[] = await User.find({ role: "recruiter", entityType: "institution" }).lean();
      const total = Math.max(orgs.length, users.length);
      const active = orgs.filter((o) => o.accountStatus === "Active").length || total;
      const pending = orgs.filter((o) => o.verificationStatus === "Pending").length;
      const suspended = orgs.filter((o) => o.accountStatus === "Suspended").length;

      res.json({ success: true, data: { total, active, pending, suspended } });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch institution stats",
        error: err.message,
      });
    }
  },

  async updateInstitutionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { accountStatus, verificationStatus } = req.body;
      const updateData: any = {};
      if (accountStatus) updateData.accountStatus = accountStatus;
      if (verificationStatus) updateData.verificationStatus = verificationStatus;

      let updated = await RecruiterOrganization.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      ).lean();
      if (!updated) {
        await User.findByIdAndUpdate(id, {
          $set: { status: accountStatus === "Suspended" ? "Locked" : "Active" },
        });
      }

      res.json({
        success: true,
        message: "Institution status updated successfully",
        data: updated,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update institution status",
        error: err.message,
      });
    }
  },

  async deleteInstitution(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await RecruiterOrganization.findByIdAndUpdate(id, {
        $set: { accountStatus: "Suspended" },
      });
      res.json({ success: true, message: "Institution archived successfully" });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete institution",
        error: err.message,
      });
    }
  },

  async getPlatformStats(req: Request, res: Response): Promise<void> {
    try {
      const [candidates, startups, companies, institutions] = await Promise.all([
        User.countDocuments({ role: { $in: ["user", "candidate", "USER", null, undefined] } } as any),
        RecruiterOrganization.countDocuments({ entity: "startup" }),
        RecruiterOrganization.countDocuments({ entity: "company" }),
        RecruiterOrganization.countDocuments({ entity: "institution" }),
      ]);

      res.json({
        success: true,
        data: {
          candidates,
          startups,
          companies,
          institutions,
          totalUsers: candidates + startups + companies + institutions,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch platform stats",
        error: err.message,
      });
    }
  },
};

export default adminPlatformController;
