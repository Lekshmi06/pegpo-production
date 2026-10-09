import { Request, Response } from "express";
import * as institutionService from "../services/institution_service";

const getParam = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
};

/**
 * POST /api/institutions
 * Create a new institution and set caller as Admin
 */
export async function createInstitution(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const { name, institutionType, description, logo, contactEmail, contactPhone, website, address, settings } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ success: false, message: "Institution name is required." });
      return;
    }

    const result = await institutionService.createInstitution(req.user._id.toString(), {
      name,
      institutionType,
      description,
      logo,
      contactEmail,
      contactPhone,
      website,
      address,
      settings,
    });

    res.status(201).json({
      success: true,
      message: "Institution created successfully.",
      data: result,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create institution.",
    });
  }
}

/**
 * GET /api/institutions/my
 * Get all institutions the authenticated user belongs to
 */
export async function getMyInstitutions(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const institutions = await institutionService.getUserInstitutions(req.user._id.toString());
    res.json({
      success: true,
      data: institutions,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch institutions.",
    });
  }
}

/**
 * GET /api/institutions/:id
 * Get institution details by ID
 */
export async function getInstitution(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const institution = await institutionService.getInstitutionById(institutionId);

    res.json({
      success: true,
      data: {
        institution,
        membership: req.institutionMembership,
      },
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch institution.",
    });
  }
}

/**
 * PUT /api/institutions/:id
 * Update institution profile (Admin only)
 */
export async function updateInstitution(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const updated = await institutionService.updateInstitution(institutionId, req.body);

    res.json({
      success: true,
      message: "Institution updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update institution.",
    });
  }
}

/**
 * GET /api/institutions/:id/dashboard
 * Get Admin dashboard KPI metrics
 */
export async function getDashboardMetrics(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const data = await institutionService.getInstitutionDashboardMetrics(institutionId);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch dashboard metrics.",
    });
  }
}

/**
 * GET /api/institutions/:id/members
 * Get institution members list
 */
export async function getMembers(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const data = await institutionService.getInstitutionMembers(institutionId, {
      role,
      status,
      search,
    });

    res.json({
      success: true,
      data: data.members,
      total: data.total,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch institution members.",
    });
  }
}

/**
 * GET /api/institutions/:id/members/:memberId
 * Get single member details
 */
export async function getMember(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const memberId = getParam(req.params.memberId);

    if (!memberId) {
      res.status(400).json({ success: false, message: "Member ID is required." });
      return;
    }

    const member = await institutionService.getMemberById(
      institutionId,
      memberId,
      req.user._id.toString()
    );

    res.json({
      success: true,
      data: member,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch member details.",
    });
  }
}

/**
 * POST /api/institutions/:id/members
 * Add or invite member (Admin or authorized Sub-Admin)
 */
export async function addMember(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const { email, role, title, department, name, permissions, linkedLearners, status, notes } =
      req.body;

    if (!email || typeof email !== "string" || !email.trim()) {
      res.status(400).json({ success: false, message: "Member email is required." });
      return;
    }

    const membership = await institutionService.addOrInviteMember(
      institutionId,
      req.user._id.toString(),
      {
        email,
        role: role || "trainee",
        title,
        department,
        name,
        permissions,
        linkedLearners,
        status,
        notes,
      }
    );

    res.status(201).json({
      success: true,
      message:
        membership.status === "invited"
          ? "Member invitation created successfully."
          : "Member added successfully.",
      data: membership,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to add member.",
    });
  }
}

/**
 * PUT /api/institutions/:id/members/:memberId
 * Update member role, status, or details
 */
export async function updateMember(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const memberId = getParam(req.params.memberId);

    if (!memberId) {
      res.status(400).json({ success: false, message: "Member ID is required." });
      return;
    }

    const updated = await institutionService.updateMemberRole(
      institutionId,
      memberId,
      req.user._id.toString(),
      req.body
    );

    res.json({
      success: true,
      message: "Member updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update member.",
    });
  }
}

/**
 * DELETE /api/institutions/:id/members/:memberId
 * Remove member from institution
 */
export async function removeMember(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const memberId = getParam(req.params.memberId);

    if (!memberId) {
      res.status(400).json({ success: false, message: "Member ID is required." });
      return;
    }

    const result = await institutionService.removeMember(
      institutionId,
      memberId,
      req.user._id.toString()
    );
    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to remove member.",
    });
  }
}

/**
 * GET /api/institutions/invitation-info/:code
 * Public / Authenticated lookup of invitation details
 */
export async function getInvitationInfo(req: Request, res: Response): Promise<void> {
  try {
    const code = getParam(req.params.code);
    if (!code) {
      res.status(400).json({ success: false, message: "Invitation code is required." });
      return;
    }

    const info = await institutionService.getInvitationInfoByCode(code);
    res.json({
      success: true,
      data: info,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to retrieve invitation details.",
    });
  }
}

/**
 * POST /api/institutions/join
 * Authenticated acceptance of an invitation code
 */
export async function acceptInvitation(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required to accept invitation." });
      return;
    }

    const { invitationCode } = req.body;
    if (!invitationCode || typeof invitationCode !== "string") {
      res.status(400).json({ success: false, message: "Valid invitation code is required." });
      return;
    }

    const result = await institutionService.acceptInvitation(
      invitationCode,
      req.user._id.toString()
    );

    res.json({
      success: true,
      message: result.message,
      data: result.membership,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to accept invitation.",
    });
  }
}
