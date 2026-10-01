import mongoose from "mongoose";
import ResearchProject, {
  IResearchProject,
  CollaborationRole,
} from "../models/ResearchProject";
import ResearchCollaborationInvite, {
  IResearchCollaborationInvite,
  InvitationStatus,
} from "../models/ResearchCollaborationInvite";
import ManuscriptComment, { IManuscriptComment } from "../models/ManuscriptComment";
import ResearcherProfile from "../models/ResearcherProfile";
import Manuscript from "../models/Manuscript";

export interface ProjectTeamMember {
  researcherId: string;
  fullName: string;
  email: string;
  domain?: string;
  role: "owner" | CollaborationRole;
  joinedAt?: Date;
  invitedBy?: string;
}

const resolvePossibleResearcherIds = async (
  rawId: string | mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId[]> => {
  if (!mongoose.isValidObjectId(rawId)) return [];
  const objId = new mongoose.Types.ObjectId(rawId);
  const possible: mongoose.Types.ObjectId[] = [objId];

  const profile = await ResearcherProfile.findOne({
    $or: [{ _id: objId }, { userId: objId }],
  }).lean();

  if (profile) {
    if (!possible.some((id) => id.equals(profile._id as any))) {
      possible.push(profile._id as mongoose.Types.ObjectId);
    }
    if (profile.userId && !possible.some((id) => id.equals(profile.userId as any))) {
      possible.push(profile.userId as mongoose.Types.ObjectId);
    }
  }

  return possible;
};

export const collaborationService = {
  /**
   * Helper: Check if a researcher is the owner or an active collaborator on a project
   */
  getResearcherProjectRole: async (
    projectId: string,
    researcherId: string
  ): Promise<{ hasAccess: boolean; role?: "owner" | CollaborationRole }> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(researcherId)) {
      return { hasAccess: false };
    }

    const project = await ResearchProject.findById(projectId).lean();
    if (!project) return { hasAccess: false };

    const possibleIds = await resolvePossibleResearcherIds(researcherId);

    // 1. Direct owner match or linked user/profile owner match
    if (project.ownerId && possibleIds.some((id) => id.equals(project.ownerId!))) {
      return { hasAccess: true, role: "owner" };
    }

    // 2. Collaborator match
    const collaborator = project.collaborators?.find((c) =>
      possibleIds.some((id) => c.researcherId.equals(id))
    );

    if (collaborator) {
      return { hasAccess: true, role: collaborator.role };
    }

    // Never fall through to viewer
    return { hasAccess: false };
  },

  /**
   * Send a collaboration invite to a researcher by email
   */
  inviteCollaborator: async (
    projectId: string,
    inviterId: string,
    inviteeEmail: string,
    role: CollaborationRole = "co_author",
    message?: string
  ): Promise<IResearchCollaborationInvite> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(inviterId)) {
      throw new Error("Invalid project ID or inviter ID format");
    }

    const cleanEmail = inviteeEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      throw new Error("A valid collaborator email address is required");
    }

    const project = await ResearchProject.findById(projectId);
    if (!project) {
      throw new Error("Research project not found");
    }

    const inviterObjectId = new mongoose.Types.ObjectId(inviterId);
    const possibleInviterIds = await resolvePossibleResearcherIds(inviterId);

    // Permission check: Only owner or co_author can manage/invite collaborators
    const isOwner = Boolean(project.ownerId && possibleInviterIds.some((id) => id.equals(project.ownerId!)));
    const coAuthor = project.collaborators?.find(
      (c) => possibleInviterIds.some((id) => id.equals(c.researcherId)) && c.role === "co_author"
    );

    if (!isOwner && !coAuthor) {
      throw new Error(
        "Unauthorized: Contributors, reviewers, and viewers cannot manage or invite collaborators"
      );
    }

    // Check if target invitee is already registered on EduPye
    const targetProfile = await ResearcherProfile.findOne({
      $or: [
        { "contact.email": cleanEmail },
        { "contact.email": new RegExp(`^${cleanEmail}$`, "i") },
      ],
    }).lean();

    const targetResearcherId = targetProfile ? targetProfile._id : undefined;

    // Check: Cannot invite the project owner
    if (project.ownerId && targetResearcherId && project.ownerId.equals(targetResearcherId)) {
      throw new Error("Invalid invitation: Project owner is already lead PI on this project");
    }

    // Check: Cannot invite an existing active collaborator (Constraint 8)
    if (targetResearcherId) {
      const alreadyMember = project.collaborators?.some((c) =>
        c.researcherId.equals(targetResearcherId)
      );
      if (alreadyMember) {
        throw new Error(
          "Invalid invitation: Researcher is already a collaborator on this project"
        );
      }
    }

    // Check: Reject duplicate pending invite (Constraint 7)
    const existingPending = await ResearchCollaborationInvite.findOne({
      projectId: project._id,
      inviteeEmail: cleanEmail,
      status: "pending",
    });

    if (existingPending) {
      throw new Error(
        "Duplicate invitation: An active invitation for this email already exists"
      );
    }

    const invite = await ResearchCollaborationInvite.create({
      projectId: project._id,
      inviterId: inviterObjectId,
      inviteeEmail: cleanEmail,
      inviteeId: targetResearcherId,
      role,
      status: "pending",
      message: message?.trim() || "",
    });

    return invite;
  },

  /**
   * Get incoming invitations for an authenticated researcher
   */
  getIncomingInvitations: async (
    researcherId: string
  ): Promise<IResearchCollaborationInvite[]> => {
    if (!mongoose.isValidObjectId(researcherId)) return [];

    const profile = await ResearcherProfile.findById(researcherId).lean();
    const researcherEmail = profile?.contact?.email?.toLowerCase();

    const query: any = { status: "pending" };
    if (researcherEmail) {
      query.$or = [
        { inviteeId: new mongoose.Types.ObjectId(researcherId) },
        { inviteeEmail: researcherEmail },
      ];
    } else {
      query.inviteeId = new mongoose.Types.ObjectId(researcherId);
    }

    return ResearchCollaborationInvite.find(query)
      .populate("projectId", "title domain currentStage status description")
      .populate("inviterId", "fullName contact researchDomains avatarUrl")
      .sort({ createdAt: -1 })
      .lean() as unknown as IResearchCollaborationInvite[];
  },

  /**
   * Get outgoing (sent) invitations from a researcher or for a specific project
   */
  getOutgoingInvitations: async (
    researcherId: string,
    projectId?: string
  ): Promise<IResearchCollaborationInvite[]> => {
    if (!mongoose.isValidObjectId(researcherId)) return [];

    const query: any = {};
    if (projectId && mongoose.isValidObjectId(projectId)) {
      query.projectId = new mongoose.Types.ObjectId(projectId);
    } else {
      query.inviterId = new mongoose.Types.ObjectId(researcherId);
    }

    return ResearchCollaborationInvite.find(query)
      .populate("projectId", "title domain currentStage")
      .populate("inviteeId", "fullName contact researchDomains avatarUrl")
      .sort({ createdAt: -1 })
      .lean() as unknown as IResearchCollaborationInvite[];
  },

  /**
   * Respond to an invitation (Accept or Decline)
   */
  respondToInvitation: async (
    invitationId: string,
    researcherId: string,
    action: "accept" | "decline"
  ): Promise<IResearchCollaborationInvite> => {
    if (!mongoose.isValidObjectId(invitationId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid invitation or researcher ID format");
    }

    const invite = await ResearchCollaborationInvite.findById(invitationId);
    if (!invite) {
      throw new Error("Invitation not found");
    }

    // Constraint 6: Revoked invitation cannot be accepted
    if (invite.status === "revoked") {
      throw new Error(
        "Invitation error: This invitation has been revoked by the project owner"
      );
    }

    if (invite.status !== "pending") {
      throw new Error(`Invitation error: This invitation has already been ${invite.status}`);
    }

    const profile = await ResearcherProfile.findById(researcherId).lean();
    const researcherEmail = profile?.contact?.email?.toLowerCase();
    const researcherObjectId = new mongoose.Types.ObjectId(researcherId);

    // Constraint 9: Verify intended recipient
    const matchesId = invite.inviteeId && invite.inviteeId.equals(researcherObjectId);
    const matchesEmail =
      researcherEmail && invite.inviteeEmail.toLowerCase() === researcherEmail;

    if (!matchesId && !matchesEmail) {
      throw new Error(
        "Unauthorized: You are not the intended recipient of this invitation"
      );
    }

    if (action === "decline") {
      invite.status = "declined";
      invite.inviteeId = researcherObjectId;
      await invite.save();
      return invite;
    }

    // Accept invitation
    const project = await ResearchProject.findById(invite.projectId);
    if (!project) {
      throw new Error("Research project no longer exists");
    }

    // Check if already a collaborator (Constraint 8)
    const alreadyJoined = project.collaborators?.some((c) =>
      c.researcherId.equals(researcherObjectId)
    );

    if (!alreadyJoined) {
      if (!project.collaborators) project.collaborators = [];
      project.collaborators.push({
        researcherId: researcherObjectId,
        role: invite.role,
        joinedAt: new Date(),
        invitedBy: invite.inviterId,
      });
      await project.save();
    }

    invite.status = "accepted";
    invite.inviteeId = researcherObjectId;
    await invite.save();

    return invite;
  },

  /**
   * Revoke a pending invitation
   */
  revokeInvitation: async (
    invitationId: string,
    requesterId: string
  ): Promise<IResearchCollaborationInvite> => {
    if (!mongoose.isValidObjectId(invitationId) || !mongoose.isValidObjectId(requesterId)) {
      throw new Error("Invalid invitation or requester ID format");
    }

    const invite = await ResearchCollaborationInvite.findById(invitationId);
    if (!invite) throw new Error("Invitation not found");

    const project = await ResearchProject.findById(invite.projectId).lean();
    const possibleIds = await resolvePossibleResearcherIds(requesterId);

    const isOwner = Boolean(project?.ownerId && possibleIds.some((id) => id.equals(project.ownerId!)));
    const isInviter = possibleIds.some((id) => id.equals(invite.inviterId));

    if (!isOwner && !isInviter) {
      throw new Error("Unauthorized: Only the project owner or inviter can revoke invitations");
    }

    invite.status = "revoked";
    await invite.save();
    return invite;
  },

  /**
   * Remove a collaborator from a project or allow a collaborator to leave
   */
  removeCollaborator: async (
    projectId: string,
    requesterId: string,
    targetResearcherId: string
  ): Promise<IResearchProject> => {
    if (
      !mongoose.isValidObjectId(projectId) ||
      !mongoose.isValidObjectId(requesterId) ||
      !mongoose.isValidObjectId(targetResearcherId)
    ) {
      throw new Error("Invalid ID format");
    }

    const project = await ResearchProject.findById(projectId);
    if (!project) throw new Error("Research project not found");

    const possibleRequesterIds = await resolvePossibleResearcherIds(requesterId);
    const possibleTargetIds = await resolvePossibleResearcherIds(targetResearcherId);

    // Constraint 10: Project owner remains owner and cannot accidentally be removed
    if (project.ownerId && possibleTargetIds.some((id) => id.equals(project.ownerId!))) {
      throw new Error("Operation denied: Project owner cannot be removed from project");
    }

    const isOwner = Boolean(project.ownerId && possibleRequesterIds.some((id) => id.equals(project.ownerId!)));
    const isSelfLeaving = possibleRequesterIds.some((reqId) =>
      possibleTargetIds.some((tgtId) => reqId.equals(tgtId))
    );

    // Only owner can remove others; collaborators can only remove themselves
    if (!isOwner && !isSelfLeaving) {
      throw new Error("Unauthorized: Only the project owner can remove team members");
    }

    // Constraint 5: A removed collaborator immediately loses access
    project.collaborators = project.collaborators.filter(
      (c) => !possibleTargetIds.some((id) => c.researcherId.equals(id))
    );

    await project.save();
    return project;
  },

  /**
   * Update a collaborator's role in a project
   */
  updateCollaboratorRole: async (
    projectId: string,
    requesterId: string,
    targetResearcherId: string,
    newRole: CollaborationRole
  ): Promise<IResearchProject> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(requesterId)) {
      throw new Error("Invalid ID format");
    }

    const project = await ResearchProject.findById(projectId);
    if (!project) throw new Error("Research project not found");

    const possibleRequesterIds = await resolvePossibleResearcherIds(requesterId);
    const possibleTargetIds = await resolvePossibleResearcherIds(targetResearcherId);

    // Only owner can alter roles (Constraint 1)
    const isOwner = Boolean(project.ownerId && possibleRequesterIds.some((id) => id.equals(project.ownerId!)));
    if (!isOwner) {
      throw new Error("Unauthorized: Only the project owner can modify team roles");
    }

    if (project.ownerId && possibleTargetIds.some((id) => id.equals(project.ownerId!))) {
      throw new Error("Operation denied: Cannot change lead PI role");
    }

    const collaborator = project.collaborators.find((c) =>
      possibleTargetIds.some((id) => c.researcherId.equals(id))
    );

    if (!collaborator) {
      throw new Error("Collaborator not found on this project");
    }

    collaborator.role = newRole;
    await project.save();
    return project;
  },

  /**
   * List all team members on a project
   */
  getProjectCollaborators: async (
    projectId: string,
    requesterId: string
  ): Promise<{ projectId: string; currentUserRole?: "owner" | CollaborationRole; owner: any; collaborators: any[] }> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(requesterId)) {
      throw new Error("Invalid ID format");
    }

    const { hasAccess, role } = await collaborationService.getResearcherProjectRole(
      projectId,
      requesterId
    );

    // Constraint 4: Collaborator cannot access another collaborator's private project
    if (!hasAccess) {
      throw new Error("Unauthorized: You do not have access to this research project");
    }

    const project = await ResearchProject.findById(projectId)
      .populate("ownerId", "fullName contact researchDomains avatarUrl institution")
      .populate(
        "collaborators.researcherId",
        "fullName contact researchDomains avatarUrl institution"
      )
      .populate("collaborators.invitedBy", "fullName contact")
      .lean();

    if (!project) throw new Error("Project not found");

    return {
      projectId: project._id.toString(),
      currentUserRole: role,
      owner: project.ownerId,
      collaborators: project.collaborators || [],
    };
  },

  /**
   * List all projects where the researcher is either owner or collaborator
   */
  getResearcherCollaborativeProjects: async (
    researcherId: string
  ): Promise<IResearchProject[]> => {
    if (!mongoose.isValidObjectId(researcherId)) return [];

    const rId = new mongoose.Types.ObjectId(researcherId);

    return ResearchProject.find({
      $or: [{ ownerId: rId }, { "collaborators.researcherId": rId }],
    })
      .populate("ownerId", "fullName contact avatarUrl")
      .populate("collaborators.researcherId", "fullName contact avatarUrl")
      .sort({ updatedAt: -1 })
      .lean() as unknown as IResearchProject[];
  },

  // -----------------------------------------------------------------
  // Peer Review & Manuscript Comments
  // -----------------------------------------------------------------

  /**
   * Add a peer review comment to a manuscript / section
   */
  addManuscriptComment: async (
    manuscriptId: string,
    authorId: string,
    content: string,
    sectionId?: string,
    highlightedText?: string
  ): Promise<IManuscriptComment> => {
    if (!mongoose.isValidObjectId(manuscriptId) || !mongoose.isValidObjectId(authorId)) {
      throw new Error("Invalid manuscript or author ID format");
    }

    if (!content || !content.trim()) {
      throw new Error("Comment content cannot be empty");
    }

    const manuscript = await Manuscript.findById(manuscriptId).lean();
    if (!manuscript) throw new Error("Manuscript not found");

    // Check project access
    const { hasAccess } = await collaborationService.getResearcherProjectRole(
      manuscript.projectId.toString(),
      authorId
    );

    if (!hasAccess) {
      throw new Error(
        "Unauthorized: You must be a team member on this project to comment"
      );
    }

    const comment = await ManuscriptComment.create({
      manuscriptId: manuscript._id,
      sectionId:
        sectionId && mongoose.isValidObjectId(sectionId)
          ? new mongoose.Types.ObjectId(sectionId)
          : undefined,
      authorId: new mongoose.Types.ObjectId(authorId),
      content: content.trim(),
      highlightedText: highlightedText?.trim() || "",
      status: "open",
      replies: [],
    });

    return comment;
  },

  /**
   * Get all review comments for a manuscript
   */
  getManuscriptComments: async (
    manuscriptId: string,
    requesterId: string,
    status?: "open" | "resolved"
  ): Promise<IManuscriptComment[]> => {
    if (!mongoose.isValidObjectId(manuscriptId) || !mongoose.isValidObjectId(requesterId)) {
      throw new Error("Invalid ID format");
    }

    const manuscript = await Manuscript.findById(manuscriptId).lean();
    if (!manuscript) throw new Error("Manuscript not found");

    const { hasAccess } = await collaborationService.getResearcherProjectRole(
      manuscript.projectId.toString(),
      requesterId
    );

    if (!hasAccess) {
      throw new Error("Unauthorized: You do not have access to this manuscript");
    }

    const query: any = { manuscriptId: manuscript._id };
    if (status) query.status = status;

    return ManuscriptComment.find(query)
      .populate("authorId", "fullName contact avatarUrl")
      .populate("replies.authorId", "fullName contact avatarUrl")
      .populate("sectionId", "title sectionType order")
      .sort({ createdAt: -1 })
      .lean() as unknown as IManuscriptComment[];
  },

  /**
   * Toggle comment status between open and resolved
   */
  resolveComment: async (
    commentId: string,
    requesterId: string
  ): Promise<IManuscriptComment> => {
    if (!mongoose.isValidObjectId(commentId) || !mongoose.isValidObjectId(requesterId)) {
      throw new Error("Invalid ID format");
    }

    const comment = await ManuscriptComment.findById(commentId);
    if (!comment) throw new Error("Comment not found");

    const manuscript = await Manuscript.findById(comment.manuscriptId).lean();
    if (!manuscript) throw new Error("Manuscript not found");

    const { hasAccess } = await collaborationService.getResearcherProjectRole(
      manuscript.projectId.toString(),
      requesterId
    );

    if (!hasAccess) {
      throw new Error("Unauthorized: You do not have access to resolve this comment");
    }

    comment.status = comment.status === "open" ? "resolved" : "open";
    await comment.save();
    return comment;
  },

  /**
   * Post a reply to an existing comment thread
   */
  replyToComment: async (
    commentId: string,
    authorId: string,
    content: string
  ): Promise<IManuscriptComment> => {
    if (!mongoose.isValidObjectId(commentId) || !mongoose.isValidObjectId(authorId)) {
      throw new Error("Invalid ID format");
    }

    if (!content || !content.trim()) {
      throw new Error("Reply content cannot be empty");
    }

    const comment = await ManuscriptComment.findById(commentId);
    if (!comment) throw new Error("Comment not found");

    const manuscript = await Manuscript.findById(comment.manuscriptId).lean();
    if (!manuscript) throw new Error("Manuscript not found");

    const { hasAccess } = await collaborationService.getResearcherProjectRole(
      manuscript.projectId.toString(),
      authorId
    );

    if (!hasAccess) {
      throw new Error("Unauthorized: You do not have access to reply to this comment");
    }

    comment.replies.push({
      authorId: new mongoose.Types.ObjectId(authorId),
      content: content.trim(),
      createdAt: new Date(),
    });

    await comment.save();
    return comment;
  },
};
