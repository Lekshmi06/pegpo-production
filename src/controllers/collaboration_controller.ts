import { Request, Response } from "express";
import mongoose from "mongoose";
import { collaborationService } from "../services/collaboration_service";
import User from "../models/User";
import ResearcherProfile from "../models/ResearcherProfile";

/**
 * Helper to resolve researcher ID from request headers, Bearer tokens, or auth context
 */
const resolveResearcherId = async (req: Request): Promise<string | undefined> => {
  // 1. Direct attachment from auth middleware
  if (req.researcherProfile?._id) {
    return req.researcherProfile._id.toString();
  }
  if (req.user?._id) {
    const p = await ResearcherProfile.findOne({ userId: req.user._id });
    if (p) return p._id.toString();
    return req.user._id.toString();
  }

  // 2. Parse candidate identity from headers/query/body
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : undefined;

  const rawCandidate =
    (req.headers["x-researcher-id"] as string) ||
    (req.headers["x-researcher-profile-id"] as string) ||
    (req.headers["x-user-id"] as string) ||
    bearerToken ||
    (req.headers["x-user-email"] as string) ||
    (req.query.researcherId as string) ||
    (req.query.userId as string) ||
    req.body?.researcherId ||
    req.body?.userId ||
    undefined;

  if (!rawCandidate || typeof rawCandidate !== "string") {
    return undefined;
  }

  const clean = rawCandidate.trim();
  if (!clean) return undefined;

  // 3. If candidate is an email address
  if (clean.includes("@")) {
    const user = await User.findOne({ email: clean.toLowerCase() });
    if (user) {
      let profile = await ResearcherProfile.findOne({ userId: user._id });
      if (!profile) {
        profile = await ResearcherProfile.create({
          userId: user._id,
          fullName: user.name || clean.split("@")[0],
          contact: { email: user.email },
          onboardingCompleted: false,
          onboardingStep: 1,
        });
      }
      return profile._id.toString();
    }
    const profile = await ResearcherProfile.findOne({ "contact.email": clean.toLowerCase() });
    if (profile) return profile._id.toString();
  }

  // 4. If candidate is a valid ObjectId
  if (mongoose.Types.ObjectId.isValid(clean)) {
    const objId = new mongoose.Types.ObjectId(clean);

    // Is it directly a ResearcherProfile ID?
    const profile = await ResearcherProfile.findById(objId);
    if (profile) {
      return profile._id.toString();
    }

    // Is it a User ID with a linked ResearcherProfile?
    const profileByUser = await ResearcherProfile.findOne({ userId: objId });
    if (profileByUser) {
      return profileByUser._id.toString();
    }

    // Is it a valid User ID without a ResearcherProfile yet? Auto-initialize profile
    const user = await User.findById(objId);
    if (user) {
      const newProfile = await ResearcherProfile.create({
        userId: user._id,
        fullName: user.name || user.email.split("@")[0],
        contact: { email: user.email },
        onboardingCompleted: false,
        onboardingStep: 1,
      });
      return newProfile._id.toString();
    }

    return clean;
  }

  return clean;
};

export const inviteCollaboratorController = async (req: Request, res: Response): Promise<void> => {
  try {
    const inviterId = await resolveResearcherId(req);
    if (!inviterId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const { projectId, email, role, message } = req.body;
    if (!projectId || !email) {
      res.status(400).json({
        success: false,
        message: "projectId and email are required fields",
      });
      return;
    }

    const invite = await collaborationService.inviteCollaborator(
      String(projectId),
      inviterId,
      String(email),
      role || "co_author",
      message ? String(message) : undefined
    );

    res.status(201).json({
      success: true,
      message: "Collaboration invitation sent successfully",
      data: invite,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to send collaboration invite",
    });
  }
};

export const getIncomingInvitationsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const invitations = await collaborationService.getIncomingInvitations(researcherId);

    res.status(200).json({
      success: true,
      count: invitations.length,
      data: invitations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve incoming invitations",
    });
  }
};

export const getOutgoingInvitationsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const invitations = await collaborationService.getOutgoingInvitations(
      researcherId,
      projectId
    );

    res.status(200).json({
      success: true,
      count: invitations.length,
      data: invitations,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve outgoing invitations",
    });
  }
};

export const respondToInvitationController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const id = String(req.params.id);
    const { action } = req.body;

    if (!["accept", "decline"].includes(action)) {
      res.status(400).json({
        success: false,
        message: "Action must be either 'accept' or 'decline'",
      });
      return;
    }

    const invite = await collaborationService.respondToInvitation(id, researcherId, action);

    res.status(200).json({
      success: true,
      message: `Invitation ${action}ed successfully`,
      data: invite,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to respond to invitation",
    });
  }
};

export const revokeInvitationController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const id = String(req.params.id);
    const invite = await collaborationService.revokeInvitation(id, researcherId);

    res.status(200).json({
      success: true,
      message: "Invitation revoked successfully",
      data: invite,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to revoke invitation",
    });
  }
};

export const getProjectCollaboratorsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const projectId = String(req.params.projectId);
    const result = await collaborationService.getProjectCollaborators(projectId, researcherId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to retrieve collaborators",
    });
  }
};

export const getProjectRoleController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const projectId = String(req.params.projectId);
    const result = await collaborationService.getResearcherProjectRole(projectId, researcherId);

    res.status(200).json({
      success: true,
      data: {
        projectId,
        hasAccess: result.hasAccess,
        role: result.role || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to resolve project role",
    });
  }
};

export const removeCollaboratorController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requesterId = await resolveResearcherId(req);
    if (!requesterId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const projectId = String(req.params.projectId);
    const targetResearcherId = String(req.params.researcherId);
    const project = await collaborationService.removeCollaborator(
      projectId,
      requesterId,
      targetResearcherId
    );

    res.status(200).json({
      success: true,
      message: "Collaborator removed successfully",
      data: project,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to remove collaborator",
    });
  }
};

export const updateCollaboratorRoleController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const requesterId = await resolveResearcherId(req);
    if (!requesterId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const projectId = String(req.params.projectId);
    const targetResearcherId = String(req.params.researcherId);
    const { role } = req.body;

    if (!role) {
      res.status(400).json({
        success: false,
        message: "Role is required",
      });
      return;
    }

    const project = await collaborationService.updateCollaboratorRole(
      projectId,
      requesterId,
      targetResearcherId,
      role
    );

    res.status(200).json({
      success: true,
      message: "Collaborator role updated successfully",
      data: project,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to update collaborator role",
    });
  }
};

export const getCollaborativeProjectsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const projects = await collaborationService.getResearcherCollaborativeProjects(researcherId);

    res.status(200).json({
      success: true,
      count: projects.length,
      data: projects,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve collaborative projects",
    });
  }
};

export const addManuscriptCommentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authorId = await resolveResearcherId(req);
    if (!authorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const { manuscriptId, sectionId, highlightedText, quote, content } = req.body;
    if (!manuscriptId || !content) {
      res.status(400).json({
        success: false,
        message: "manuscriptId and content are required fields",
      });
      return;
    }

    const comment = await collaborationService.addManuscriptComment(
      String(manuscriptId),
      authorId,
      String(content),
      sectionId ? String(sectionId) : undefined,
      (highlightedText || quote) ? String(highlightedText || quote) : undefined
    );

    res.status(201).json({
      success: true,
      message: "Manuscript annotation added successfully",
      data: comment,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to add manuscript comment",
    });
  }
};

export const getManuscriptCommentsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const manuscriptId = req.query.manuscriptId ? String(req.query.manuscriptId) : undefined;
    const statusQuery = req.query.status ? String(req.query.status) : undefined;
    const status = (statusQuery === "open" || statusQuery === "resolved") ? statusQuery : undefined;

    if (!manuscriptId) {
      res.status(400).json({
        success: false,
        message: "manuscriptId query parameter is required",
      });
      return;
    }

    const comments = await collaborationService.getManuscriptComments(
      manuscriptId,
      researcherId,
      status
    );

    res.status(200).json({
      success: true,
      count: comments.length,
      data: comments,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to retrieve manuscript comments",
    });
  }
};

export const resolveCommentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const id = String(req.params.id);
    const comment = await collaborationService.resolveComment(id, researcherId);

    res.status(200).json({
      success: true,
      message: "Comment resolved successfully",
      data: comment,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to resolve comment",
    });
  }
};

export const replyToCommentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authorId = await resolveResearcherId(req);
    if (!authorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const id = String(req.params.id);
    const { content } = req.body;

    if (!content) {
      res.status(400).json({
        success: false,
        message: "Content is required for reply",
      });
      return;
    }

    const reply = await collaborationService.replyToComment(id, authorId, String(content));

    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      data: reply,
    });
  } catch (error: any) {
    const isUnauthorized =
      error?.message?.includes("Unauthorized") || error?.message?.includes("Forbidden");
    const statusCode = isUnauthorized ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to reply to comment",
    });
  }
};
