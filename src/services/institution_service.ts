import mongoose from "mongoose";
import Institution, {
  IInstitution,
  InstitutionType,
  InstitutionStatus,
} from "../models/Institution";
import InstitutionMembership, {
  IInstitutionMembership,
  InstitutionRole,
  MembershipStatus,
} from "../models/InstitutionMembership";
import User, { IUser } from "../models/User";

export interface CreateInstitutionInput {
  name: string;
  institutionType?: InstitutionType;
  description?: string;
  logo?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  settings?: {
    allowMemberInvites?: boolean;
    defaultBatchNaming?: string;
    industryOrField?: string;
    companySize?: string;
  };
  adminTitle?: string;
}

export interface UpdateInstitutionInput {
  name?: string;
  institutionType?: InstitutionType;
  description?: string;
  logo?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  status?: InstitutionStatus;
  settings?: {
    allowMemberInvites?: boolean;
    defaultBatchNaming?: string;
    industryOrField?: string;
    companySize?: string;
  };
}

export interface AddMemberInput {
  email: string;
  role: InstitutionRole;
  title?: string;
  department?: string;
  team?: string;
  managerId?: string;
  onboardingStatus?: "not_started" | "in_progress" | "completed";
  name?: string;
  permissions?: string[];
  linkedLearners?: string[];
  status?: MembershipStatus;
  notes?: string;
}

export interface UpdateMemberInput {
  role?: InstitutionRole;
  status?: MembershipStatus;
  title?: string;
  department?: string;
  team?: string;
  managerId?: string;
  onboardingStatus?: "not_started" | "in_progress" | "completed";
  permissions?: string[];
  linkedLearners?: string[];
  notes?: string;
}

export function generateInvitationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `INV-${random}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Generate a unique URL slug from institution name
 */
export async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "institution";

  let slug = baseSlug;
  let counter = 1;

  while (await Institution.findOne({ slug })) {
    slug = `${baseSlug}-${counter}-${Math.floor(100 + Math.random() * 900)}`;
    counter++;
  }

  return slug;
}

/**
 * Create a new Institution and establish the creator as the initial Admin.
 */
export async function createInstitution(
  ownerId: string,
  input: CreateInstitutionInput
): Promise<{ institution: IInstitution; membership: IInstitutionMembership }> {
  if (!input.name || !input.name.trim()) {
    throw new Error("Institution name is required.");
  }

  const cleanName = input.name.trim();

  // Prevent duplicate company/institution creation from repeated submissions by same owner
  const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existingSameName = await Institution.findOne({
    owner: new mongoose.Types.ObjectId(ownerId),
    name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    status: { $ne: "suspended" },
  });

  if (existingSameName) {
    const error: any = new Error(
      "An organization with this name has already been registered for your account."
    );
    error.statusCode = 409;
    throw error;
  }

  const slug = await generateUniqueSlug(cleanName);

  const institution = await Institution.create({
    name: cleanName,
    slug,
    institutionType: input.institutionType || "training_institute",
    description: input.description?.trim(),
    logo: input.logo?.trim(),
    contactEmail: input.contactEmail?.trim().toLowerCase(),
    contactPhone: input.contactPhone?.trim(),
    website: input.website?.trim(),
    address: input.address || {},
    owner: new mongoose.Types.ObjectId(ownerId),
    status: "active",
    settings: input.settings || {
      allowMemberInvites: true,
      defaultBatchNaming: input.institutionType === "company" ? "Training Cohort" : "Batch",
    },
  });

  // Automatically create Admin membership for the creator/owner
  const membership = await InstitutionMembership.create({
    institutionId: institution._id,
    userId: new mongoose.Types.ObjectId(ownerId),
    role: "admin",
    status: "active",
    title:
      input.adminTitle?.trim() ||
      (input.institutionType === "company"
        ? "Company Administrator"
        : "Institution Owner & Administrator"),
    joinedAt: new Date(),
  });

  return { institution, membership };
}

/**
 * Retrieve all institutions where the given user has an active membership.
 */
export async function getUserInstitutions(
  userId: string
): Promise<Array<{ institution: IInstitution; membership: any }>> {
  const memberships = await InstitutionMembership.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: "active",
  })
    .populate<{ institutionId: IInstitution }>("institutionId")
    .sort({ createdAt: -1 });

  return memberships
    .filter((m) => m.institutionId !== null && m.institutionId !== undefined)
    .map((m) => ({
      institution: m.institutionId,
      membership: m,
    }));
}

/**
 * Retrieve institution details by ID.
 */
export async function getInstitutionById(institutionId: string): Promise<IInstitution> {
  const institution = await Institution.findById(institutionId).populate(
    "owner",
    "name email userType"
  );
  if (!institution) {
    throw new Error("Institution not found.");
  }
  return institution;
}

/**
 * Update institution profile details.
 */
export async function updateInstitution(
  institutionId: string,
  input: UpdateInstitutionInput
): Promise<IInstitution> {
  const institution = await Institution.findById(institutionId);
  if (!institution) {
    throw new Error("Institution not found.");
  }

  if (input.name !== undefined) institution.name = input.name.trim();
  if (input.institutionType !== undefined) institution.institutionType = input.institutionType;
  if (input.description !== undefined) institution.description = input.description.trim();
  if (input.logo !== undefined) institution.logo = input.logo.trim();
  if (input.contactEmail !== undefined)
    institution.contactEmail = input.contactEmail.trim().toLowerCase();
  if (input.contactPhone !== undefined) institution.contactPhone = input.contactPhone.trim();
  if (input.website !== undefined) institution.website = input.website.trim();
  if (input.address !== undefined) institution.address = input.address;
  if (input.status !== undefined) institution.status = input.status;
  if (input.settings !== undefined) {
    institution.settings = { ...institution.settings, ...input.settings };
  }

  await institution.save();
  return institution;
}

/**
 * Retrieve KPI metrics for the Institution Admin Dashboard.
 */
export async function getInstitutionDashboardMetrics(institutionId: string) {
  const institution = await Institution.findById(institutionId);
  if (!institution) {
    throw new Error("Institution not found.");
  }

  const instObjectId = new mongoose.Types.ObjectId(institutionId);

  const [totalMembers, totalTrainees, totalTrainers, totalAdmins, recentMembers] =
    await Promise.all([
      InstitutionMembership.countDocuments({ institutionId: instObjectId, status: "active" }),
      InstitutionMembership.countDocuments({
        institutionId: instObjectId,
        role: "trainee",
        status: "active",
      }),
      InstitutionMembership.countDocuments({
        institutionId: instObjectId,
        role: "trainer",
        status: "active",
      }),
      InstitutionMembership.countDocuments({
        institutionId: instObjectId,
        role: { $in: ["admin", "subadmin"] },
        status: "active",
      }),
      InstitutionMembership.find({ institutionId: instObjectId, status: "active" })
        .sort({ createdAt: -1 })
        .limit(6)
        .populate<{ userId: IUser }>("userId", "name email userType"),
    ]);

  return {
    institution: {
      _id: institution._id,
      name: institution.name,
      slug: institution.slug,
      institutionType: institution.institutionType,
      logo: institution.logo,
      description: institution.description,
      contactEmail: institution.contactEmail,
      contactPhone: institution.contactPhone,
      website: institution.website,
      status: institution.status,
      createdAt: institution.createdAt,
    },
    metrics: {
      totalMembers,
      totalTrainees,
      totalTrainers,
      totalAdmins,
    },
    recentMembers,
  };
}

/**
 * Retrieve members for an institution with role and status filtering.
 */
export async function getInstitutionMembers(
  institutionId: string,
  filter: {
    role?: string;
    status?: string;
    search?: string;
  } = {}
) {
  const query: Record<string, any> = {
    institutionId: new mongoose.Types.ObjectId(institutionId),
  };

  if (filter.role && filter.role !== "all") {
    query.role = filter.role;
  }

  if (filter.status && filter.status !== "all") {
    query.status = filter.status;
  }

  const members = await InstitutionMembership.find(query)
    .populate<{ userId: IUser }>("userId", "name email userType")
    .populate<{ linkedLearners: IUser[] }>("linkedLearners", "name email userType")
    .populate<{ invitedBy: IUser }>("invitedBy", "name email")
    .populate<{ managerId: IUser }>("managerId", "name email")
    .sort({ createdAt: -1 });

  // Optional in-memory search for populated user name/email/title/dept/team
  let filtered = members;
  if (filter.search && filter.search.trim()) {
    const s = filter.search.toLowerCase().trim();
    filtered = members.filter((m) => {
      const u = m.userId;
      if (!u) return false;
      const matchName = u.name?.toLowerCase().includes(s);
      const matchEmail = u.email?.toLowerCase().includes(s);
      const matchTitle = m.title?.toLowerCase().includes(s);
      const matchDept = m.department?.toLowerCase().includes(s);
      const matchTeam = m.team?.toLowerCase().includes(s);
      return Boolean(matchName || matchEmail || matchTitle || matchDept || matchTeam);
    });
  }

  return {
    members: filtered,
    total: filtered.length,
  };
}

/**
 * Retrieve single member details with role-scoped authorization checks.
 */
export async function getMemberById(
  institutionId: string,
  memberId: string,
  actorUserId: string
): Promise<IInstitutionMembership> {
  const member = await InstitutionMembership.findOne({
    _id: new mongoose.Types.ObjectId(memberId),
    institutionId: new mongoose.Types.ObjectId(institutionId),
  })
    .populate<{ userId: IUser }>("userId", "name email userType")
    .populate<{ linkedLearners: IUser[] }>("linkedLearners", "name email userType")
    .populate<{ invitedBy: IUser }>("invitedBy", "name email")
    .populate<{ managerId: IUser }>("managerId", "name email");

  if (!member) {
    const error: any = new Error("Member not found in this institution.");
    error.statusCode = 404;
    throw error;
  }

  // Retrieve actor's membership
  const actorMembership = await InstitutionMembership.findOne({
    institutionId: new mongoose.Types.ObjectId(institutionId),
    userId: new mongoose.Types.ObjectId(actorUserId),
    status: "active",
  });

  if (!actorMembership) {
    const error: any = new Error("Forbidden: You do not have active membership in this institution.");
    error.statusCode = 403;
    throw error;
  }

  // Role visibility constraints
  if (actorMembership.role === "trainee") {
    if (member.userId._id.toString() !== actorUserId.toString()) {
      const error: any = new Error("Forbidden: Trainees can only view their own membership profile.");
      error.statusCode = 403;
      throw error;
    }
  } else if (actorMembership.role === "parent") {
    const isSelf = member.userId._id.toString() === actorUserId.toString();
    const isLinkedLearner =
      Array.isArray(actorMembership.linkedLearners) &&
      actorMembership.linkedLearners.some((lId) => lId.toString() === member.userId._id.toString());

    if (!isSelf && !isLinkedLearner) {
      const error: any = new Error("Forbidden: Parents can only access their own profile and linked learners.");
      error.statusCode = 403;
      throw error;
    }
  }

  return member as any;
}

/**
 * Add or invite a member to an institution.
 * Prevents duplicate memberships.
 */
export async function addOrInviteMember(
  institutionId: string,
  actorId: string,
  input: AddMemberInput
): Promise<IInstitutionMembership> {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);
  const normalizedEmail = input.email.trim().toLowerCase();

  // 1. Verify actor's privileges
  const actorMembership = await InstitutionMembership.findOne({
    institutionId: instObjectId,
    userId: new mongoose.Types.ObjectId(actorId),
    status: "active",
  });

  if (!actorMembership) {
    const error: any = new Error("Forbidden: Active institution membership required to invite members.");
    error.statusCode = 403;
    throw error;
  }

  if (actorMembership.role === "subadmin") {
    const hasPermission =
      Array.isArray(actorMembership.permissions) &&
      (actorMembership.permissions.includes("manage_members") ||
        actorMembership.permissions.includes("manage_employees") ||
        actorMembership.permissions.includes("invite_members") ||
        actorMembership.permissions.includes("invite_employees"));

    if (!hasPermission) {
      const error: any = new Error("Forbidden: Sub-Admin lacks permission to invite members.");
      error.statusCode = 403;
      throw error;
    }

    if (input.role === "admin") {
      const error: any = new Error("Forbidden: Sub-Administrators cannot assign the Administrator role.");
      error.statusCode = 403;
      throw error;
    }
  } else if (actorMembership.role !== "admin") {
    const error: any = new Error("Forbidden: Only Administrators and authorized Sub-Administrators can invite members.");
    error.statusCode = 403;
    throw error;
  }

  // 2. Locate or provision EduPye user account
  let targetUser = await User.findOne({ email: normalizedEmail });
  if (!targetUser) {
    let resolvedUserType: any = "student";
    if (input.role === "trainer") resolvedUserType = "teacher";
    else if (input.role === "admin" || input.role === "subadmin") resolvedUserType = "institution";
    else if (input.role === "parent") resolvedUserType = "personal";

    targetUser = await User.create({
      email: normalizedEmail,
      name: input.name?.trim() || normalizedEmail.split("@")[0],
      userType: resolvedUserType,
    });
  }

  // 3. Check for existing membership (Duplicate prevention)
  const existingMembership = await InstitutionMembership.findOne({
    institutionId: instObjectId,
    userId: targetUser._id,
  });

  if (existingMembership) {
    const error: any = new Error("User is already a member of this institution.");
    error.statusCode = 409;
    throw error;
  }

  const invitationCode = generateInvitationCode();
  const initialStatus = input.status || "active";

  // 4. Create membership
  const membership = await InstitutionMembership.create({
    institutionId: instObjectId,
    userId: targetUser._id,
    role: input.role || "trainee",
    status: initialStatus,
    title:
      input.title?.trim() ||
      (input.role === "trainer"
        ? "Instructor"
        : input.role === "parent"
        ? "Parent / Guardian"
        : "Trainee"),
    department: input.department?.trim(),
    team: input.team?.trim(),
    managerId: input.managerId ? new mongoose.Types.ObjectId(input.managerId) : undefined,
    onboardingStatus: input.onboardingStatus || "not_started",
    permissions: input.role === "subadmin" && Array.isArray(input.permissions) ? input.permissions : [],
    linkedLearners:
      input.role === "parent" && Array.isArray(input.linkedLearners)
        ? input.linkedLearners.map((id) => new mongoose.Types.ObjectId(id))
        : [],
    invitationCode,
    notes: input.notes?.trim(),
    invitedBy: new mongoose.Types.ObjectId(actorId),
    joinedAt: initialStatus === "active" ? new Date() : undefined,
  });

  await membership.populate<{ userId: IUser }>("userId", "name email userType");
  await membership.populate<{ linkedLearners: IUser[] }>("linkedLearners", "name email userType");
  await membership.populate<{ managerId: IUser }>("managerId", "name email");
  return membership;
}

/**
 * Update a member's role, status, title, permissions, or linked learners.
 */
export async function updateMemberRole(
  institutionId: string,
  memberId: string,
  actorIdOrInput: string | UpdateMemberInput,
  maybeInput?: UpdateMemberInput
): Promise<IInstitutionMembership> {
  let actorId: string | undefined;
  let input: UpdateMemberInput;

  if (typeof actorIdOrInput === "string") {
    actorId = actorIdOrInput;
    input = maybeInput || {};
  } else {
    actorId = undefined;
    input = actorIdOrInput || {};
  }

  const membership = await InstitutionMembership.findOne({
    _id: new mongoose.Types.ObjectId(memberId),
    institutionId: new mongoose.Types.ObjectId(institutionId),
  });

  if (!membership) {
    const error: any = new Error("Membership not found in this institution.");
    error.statusCode = 404;
    throw error;
  }

  // Owner safeguards
  const institution = await Institution.findById(institutionId);
  if (
    institution &&
    institution.owner.toString() === membership.userId.toString() &&
    input.role !== undefined &&
    input.role !== "admin"
  ) {
    const error: any = new Error("Cannot demote the institution owner.");
    error.statusCode = 403;
    throw error;
  }

  if (
    institution &&
    institution.owner.toString() === membership.userId.toString() &&
    input.status !== undefined &&
    input.status !== "active"
  ) {
    const error: any = new Error("Cannot suspend or deactivate the institution owner.");
    error.statusCode = 403;
    throw error;
  }

  // Actor authorization check if actorId provided
  if (actorId) {
    const actorMembership = await InstitutionMembership.findOne({
      institutionId: new mongoose.Types.ObjectId(institutionId),
      userId: new mongoose.Types.ObjectId(actorId),
      status: "active",
    });

    if (!actorMembership) {
      const error: any = new Error("Forbidden: Active membership required.");
      error.statusCode = 403;
      throw error;
    }

    if (actorMembership.role === "subadmin") {
      const hasPermission =
        Array.isArray(actorMembership.permissions) &&
        (actorMembership.permissions.includes("manage_members") ||
          actorMembership.permissions.includes("manage_employees"));

      if (!hasPermission) {
        const error: any = new Error("Forbidden: Sub-Admin lacks 'manage_members' permission.");
        error.statusCode = 403;
        throw error;
      }

      if (membership.role === "admin" || input.role === "admin") {
        const error: any = new Error("Forbidden: Sub-Admins cannot modify or assign Admin roles.");
        error.statusCode = 403;
        throw error;
      }
    } else if (actorMembership.role !== "admin") {
      const error: any = new Error("Forbidden: Only Administrators can update member details.");
      error.statusCode = 403;
      throw error;
    }
  }

  if (input.role !== undefined) membership.role = input.role;
  if (input.status !== undefined) {
    membership.status = input.status;
    if (input.status === "active" && !membership.joinedAt) {
      membership.joinedAt = new Date();
    }
  }
  if (input.title !== undefined) membership.title = input.title.trim();
  if (input.department !== undefined) membership.department = input.department.trim();
  if (input.team !== undefined) membership.team = input.team.trim();
  if (input.managerId !== undefined) {
    membership.managerId = input.managerId ? new mongoose.Types.ObjectId(input.managerId) : undefined;
  }
  if (input.onboardingStatus !== undefined) {
    membership.onboardingStatus = input.onboardingStatus;
  }
  if (input.permissions !== undefined && membership.role === "subadmin") {
    membership.permissions = input.permissions;
  }
  if (input.linkedLearners !== undefined && membership.role === "parent") {
    membership.linkedLearners = input.linkedLearners.map((id) => new mongoose.Types.ObjectId(id));
  }
  if (input.notes !== undefined) membership.notes = input.notes.trim();

  await membership.save();
  await membership.populate<{ userId: IUser }>("userId", "name email userType");
  await membership.populate<{ linkedLearners: IUser[] }>("linkedLearners", "name email userType");
  await membership.populate<{ managerId: IUser }>("managerId", "name email");
  return membership as any;
}

/**
 * Remove a member from the institution.
 */
export async function removeMember(
  institutionId: string,
  memberId: string,
  actorId?: string
): Promise<{ success: boolean; message: string }> {
  const membership = await InstitutionMembership.findOne({
    _id: new mongoose.Types.ObjectId(memberId),
    institutionId: new mongoose.Types.ObjectId(institutionId),
  });

  if (!membership) {
    const error: any = new Error("Membership not found.");
    error.statusCode = 404;
    throw error;
  }

  // Owner safeguards first
  const institution = await Institution.findById(institutionId);
  if (institution && institution.owner.toString() === membership.userId.toString()) {
    const error: any = new Error("Cannot remove the institution owner.");
    error.statusCode = 403;
    throw error;
  }

  if (actorId) {
    const actorMembership = await InstitutionMembership.findOne({
      institutionId: new mongoose.Types.ObjectId(institutionId),
      userId: new mongoose.Types.ObjectId(actorId),
      status: "active",
    });

    if (!actorMembership) {
      const error: any = new Error("Forbidden: Active membership required.");
      error.statusCode = 403;
      throw error;
    }

    if (actorMembership.role === "subadmin") {
      const hasPermission =
        Array.isArray(actorMembership.permissions) &&
        actorMembership.permissions.includes("manage_members");

      if (!hasPermission) {
        const error: any = new Error("Forbidden: Sub-Admin lacks permission to remove members.");
        error.statusCode = 403;
        throw error;
      }

      if (membership.role === "admin") {
        const error: any = new Error("Forbidden: Sub-Admins cannot remove Administrators.");
        error.statusCode = 403;
        throw error;
      }
    } else if (actorMembership.role !== "admin") {
      const error: any = new Error("Forbidden: Only Administrators can remove members.");
      error.statusCode = 403;
      throw error;
    }
  }

  await InstitutionMembership.findByIdAndDelete(membership._id);
  return { success: true, message: "Member removed successfully." };
}

/**
 * Retrieve invitation details by invitation code (for acceptance screen).
 */
export async function getInvitationInfoByCode(invitationCode: string) {
  const cleanCode = invitationCode.trim();
  const membership = await InstitutionMembership.findOne({
    invitationCode: cleanCode,
  })
    .populate<{ institutionId: IInstitution }>("institutionId")
    .populate<{ userId: IUser }>("userId", "email name")
    .populate<{ invitedBy: IUser }>("invitedBy", "name email");

  if (!membership || !membership.institutionId) {
    const error: any = new Error("Invalid or expired invitation code.");
    error.statusCode = 404;
    throw error;
  }

  return {
    code: cleanCode,
    invitationCode: cleanCode,
    status: membership.status,
    role: membership.role,
    title: membership.title,
    department: membership.department,
    invitedEmail: (membership.userId as any)?.email,
    invitedUser: {
      _id: (membership.userId as any)?._id,
      name: (membership.userId as any)?.name,
      email: (membership.userId as any)?.email,
    },
    institution: {
      _id: membership.institutionId._id,
      name: membership.institutionId.name,
      slug: membership.institutionId.slug,
      institutionType: membership.institutionId.institutionType,
      logo: membership.institutionId.logo,
      description: membership.institutionId.description,
    },
    invitedBy: membership.invitedBy
      ? { name: (membership.invitedBy as any).name, email: (membership.invitedBy as any).email }
      : undefined,
  };
}

/**
 * Accept an institution invitation. Transitions status from 'invited' to 'active'.
 */
export async function acceptInvitation(
  invitationCode: string,
  userId: string
): Promise<{ success: boolean; message: string; membership: IInstitutionMembership }> {
  const cleanCode = invitationCode.trim();
  const membership = await InstitutionMembership.findOne({
    invitationCode: cleanCode,
  });

  if (!membership) {
    const error: any = new Error("Invalid or expired invitation code.");
    error.statusCode = 404;
    throw error;
  }

  if (membership.status === "active") {
    return {
      success: true,
      message: "You are already an active member of this institution.",
      membership,
    };
  }

  const currentUser = await User.findById(userId);
  const invitedUser = await User.findById(membership.userId);

  // If the user's email matches the invited user's email, associate properly
  if (currentUser && invitedUser) {
    if (currentUser.email.toLowerCase() !== invitedUser.email.toLowerCase()) {
      const error: any = new Error(
        `This invitation was issued for ${invitedUser.email}. You are currently logged in as ${currentUser.email}.`
      );
      error.statusCode = 403;
      throw error;
    }
    // Re-bind to authenticated user's ID
    membership.userId = currentUser._id as any;
  }

  membership.status = "active";
  membership.joinedAt = new Date();
  membership.invitationCode = undefined;
  await membership.save();

  await membership.populate<{ userId: IUser }>("userId", "name email userType");
  return {
    success: true,
    message: "Successfully joined the institution!",
    membership,
  };
}

/**
 * Revoke/cancel a pending invitation.
 */
export async function revokeInvitation(
  institutionId: string,
  memberId: string,
  actorId: string
): Promise<{ success: boolean; message: string }> {
  return removeMember(institutionId, memberId, actorId);
}
