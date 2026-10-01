import mongoose from "mongoose";
import ResearchTask, {
  IResearchTask,
  TaskStatus,
  ResearchStage,
  TaskPriority,
} from "../models/ResearchTask";
import ResearchProject from "../models/ResearchProject";
import ResearcherProfile from "../models/ResearcherProfile";
import { collaborationService } from "./collaboration_service";

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  researchStage?: ResearchStage;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: Date | string;
  paperIds?: string[];
  noteIds?: string[];
  manuscriptId?: string;
  manuscriptSectionId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  researchStage?: ResearchStage;
  priority?: TaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | string | null;
  paperIds?: string[];
  noteIds?: string[];
  manuscriptId?: string | null;
  manuscriptSectionId?: string | null;
}

export interface TaskFilterOptions {
  status?: TaskStatus;
  researchStage?: ResearchStage;
  priority?: TaskPriority;
  assigneeId?: string;
  overdue?: boolean | string;
  dueFilter?: "all" | "overdue" | "today" | "this_week";
  dueDate?: string;
}

/**
 * Helper to resolve all associated IDs for a researcher (both profile ID and user ID)
 */
const resolveResearcherPossibleIds = async (
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

/**
 * Helper to verify if a candidate researcher is a legitimate member (owner or collaborator) of the project
 */
const verifyProjectMember = async (
  project: any,
  candidateResearcherId: string | mongoose.Types.ObjectId
): Promise<boolean> => {
  if (!candidateResearcherId || !mongoose.isValidObjectId(candidateResearcherId)) {
    return false;
  }
  const possibleCandidateIds = await resolveResearcherPossibleIds(candidateResearcherId);

  // Check owner
  if (project.ownerId && possibleCandidateIds.some((id) => id.equals(project.ownerId))) {
    return true;
  }

  // Check collaborators
  const isCollab = project.collaborators?.some((c: any) =>
    possibleCandidateIds.some((id) => id.equals(c.researcherId))
  );

  return Boolean(isCollab);
};

export const researchTaskService = {
  /**
   * Create a new research task within a project
   */
  createTask: async (
    projectId: string,
    researcherId: string,
    input: CreateTaskInput
  ): Promise<IResearchTask> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid project ID or researcher ID format");
    }

    if (!input.title || !input.title.trim()) {
      throw new Error("Task title is required");
    }

    const project = await ResearchProject.findById(projectId);
    if (!project) {
      throw new Error("Research project not found");
    }

    // Role verification
    const roleInfo = await collaborationService.getResearcherProjectRole(projectId, researcherId);
    if (!roleInfo.hasAccess || !roleInfo.role) {
      throw new Error("Unauthorized: You are not a member of this research project");
    }

    // Reviewers and viewers are strictly read-only
    if (roleInfo.role === "reviewer" || roleInfo.role === "viewer") {
      throw new Error("Unauthorized: Reviewers and viewers have read-only access and cannot create tasks");
    }

    // Assignee verification: Assignee must be a project member (owner or collaborator)
    let assigneeObjId: mongoose.Types.ObjectId | undefined;
    if (input.assigneeId && input.assigneeId.trim()) {
      const isMember = await verifyProjectMember(project, input.assigneeId);
      if (!isMember) {
        throw new Error("Invalid assignee: Assigned researcher must be a registered member of this project");
      }
      assigneeObjId = new mongoose.Types.ObjectId(input.assigneeId);
    }

    const creatorObjId = new mongoose.Types.ObjectId(researcherId);
    const initialStatus = input.status || "backlog";
    const completedAt = initialStatus === "done" ? new Date() : null;

    const task = await ResearchTask.create({
      projectId: project._id,
      ownerId: project.ownerId || creatorObjId,
      createdBy: creatorObjId,
      title: input.title.trim(),
      description: input.description?.trim() || "",
      status: initialStatus,
      researchStage: input.researchStage || "literature_review",
      priority: input.priority || "medium",
      assigneeId: assigneeObjId,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      paperIds: (input.paperIds || [])
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
      noteIds: (input.noteIds || [])
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
      manuscriptId:
        input.manuscriptId && mongoose.isValidObjectId(input.manuscriptId)
          ? new mongoose.Types.ObjectId(input.manuscriptId)
          : undefined,
      manuscriptSectionId:
        input.manuscriptSectionId && mongoose.isValidObjectId(input.manuscriptSectionId)
          ? new mongoose.Types.ObjectId(input.manuscriptSectionId)
          : undefined,
      completedAt,
    });

    const populated = await ResearchTask.findById(task._id)
      .populate("assigneeId", "fullName contact avatarUrl")
      .populate("createdBy", "fullName contact avatarUrl")
      .populate("paperIds", "title authors year venue")
      .populate("noteIds", "title noteType")
      .populate("manuscriptId", "title citationStyle")
      .populate("manuscriptSectionId", "title sectionType order");

    return populated!;
  },

  /**
   * List tasks for a project with rich filtering
   */
  listProjectTasks: async (
    projectId: string,
    researcherId: string,
    filters: TaskFilterOptions = {}
  ): Promise<any[]> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid project ID or researcher ID format");
    }

    const project = await ResearchProject.findById(projectId).lean();
    if (!project) {
      throw new Error("Research project not found");
    }

    // Role check: non-members cannot access project tasks
    const roleInfo = await collaborationService.getResearcherProjectRole(projectId, researcherId);
    if (!roleInfo.hasAccess) {
      throw new Error("Unauthorized: You do not have access to tasks on this project");
    }

    const query: any = { projectId: new mongoose.Types.ObjectId(projectId) };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.researchStage) {
      query.researchStage = filters.researchStage;
    }

    if (filters.priority) {
      query.priority = filters.priority;
    }

    if (filters.assigneeId && mongoose.isValidObjectId(filters.assigneeId)) {
      const possibleAssigneeIds = await resolveResearcherPossibleIds(filters.assigneeId);
      query.assigneeId = { $in: possibleAssigneeIds };
    }

    // Due date and overdue filters
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const endOfWeek = new Date(startOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    const isOverdueRequested =
      filters.dueFilter === "overdue" ||
      filters.overdue === true ||
      filters.overdue === "true";

    if (isOverdueRequested) {
      query.dueDate = { $lt: now };
      query.status = { $ne: "done" };
    } else if (filters.dueFilter === "today") {
      query.dueDate = { $gte: startOfToday, $lte: endOfToday };
    } else if (filters.dueFilter === "this_week") {
      query.dueDate = { $gte: startOfToday, $lte: endOfWeek };
    } else if (filters.dueDate) {
      const targetDate = new Date(filters.dueDate);
      if (!isNaN(targetDate.getTime())) {
        const startTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        const endTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
        query.dueDate = { $gte: startTarget, $lte: endTarget };
      }
    }

    const tasks = await ResearchTask.find(query)
      .populate("assigneeId", "fullName contact avatarUrl")
      .populate("createdBy", "fullName contact avatarUrl")
      .populate("paperIds", "title authors year venue")
      .populate("noteIds", "title noteType")
      .populate("manuscriptId", "title citationStyle")
      .populate("manuscriptSectionId", "title sectionType order")
      .sort({ createdAt: -1 })
      .lean();

    return tasks.map((t: any) => {
      const isOverdue =
        t.dueDate && new Date(t.dueDate) < now && t.status !== "done";
      return {
        ...t,
        isOverdue: Boolean(isOverdue),
      };
    });
  },

  /**
   * Get single task by ID
   */
  getTaskById: async (taskId: string, researcherId: string): Promise<any> => {
    if (!mongoose.isValidObjectId(taskId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid task ID or researcher ID format");
    }

    const task = await ResearchTask.findById(taskId)
      .populate("assigneeId", "fullName contact avatarUrl")
      .populate("createdBy", "fullName contact avatarUrl")
      .populate("paperIds", "title authors year venue")
      .populate("noteIds", "title noteType")
      .populate("manuscriptId", "title citationStyle")
      .populate("manuscriptSectionId", "title sectionType order")
      .lean();

    if (!task) {
      throw new Error("Research task not found");
    }

    // Role check on parent project
    const roleInfo = await collaborationService.getResearcherProjectRole(
      task.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess) {
      throw new Error("Unauthorized: You do not have permission to view tasks on this project");
    }

    const now = new Date();
    const isOverdue =
      task.dueDate && new Date(task.dueDate) < now && task.status !== "done";

    return {
      ...task,
      isOverdue: Boolean(isOverdue),
    };
  },

  /**
   * Update full or partial fields on a task
   */
  updateTask: async (
    taskId: string,
    researcherId: string,
    input: UpdateTaskInput
  ): Promise<IResearchTask> => {
    if (!mongoose.isValidObjectId(taskId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid task ID or researcher ID format");
    }

    const task = await ResearchTask.findById(taskId);
    if (!task) {
      throw new Error("Research task not found");
    }

    const project = await ResearchProject.findById(task.projectId);
    if (!project) {
      throw new Error("Research project not found");
    }

    const roleInfo = await collaborationService.getResearcherProjectRole(
      task.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess || !roleInfo.role) {
      throw new Error("Unauthorized: You are not a member of this research project");
    }

    if (roleInfo.role === "reviewer" || roleInfo.role === "viewer") {
      throw new Error("Unauthorized: Reviewers and viewers cannot modify tasks");
    }

    const possibleRequesterIds = await resolveResearcherPossibleIds(researcherId);

    // Contributor permission check:
    // Contributors can only update tasks they created or tasks assigned to them
    if (roleInfo.role === "contributor") {
      const isCreator = possibleRequesterIds.some((id) => id.equals(task.createdBy));
      const isAssignee =
        task.assigneeId && possibleRequesterIds.some((id) => id.equals(task.assigneeId!));

      if (!isCreator && !isAssignee) {
        throw new Error(
          "Unauthorized: Contributors can only edit tasks they created or are assigned to"
        );
      }
    }

    // If updating assignee, verify permission and membership
    if (input.assigneeId !== undefined) {
      if (input.assigneeId === null || input.assigneeId.trim() === "") {
        task.assigneeId = undefined;
      } else {
        const isMember = await verifyProjectMember(project, input.assigneeId);
        if (!isMember) {
          throw new Error("Invalid assignee: Assigned researcher must be a member of this project");
        }
        task.assigneeId = new mongoose.Types.ObjectId(input.assigneeId);
      }
    }

    if (input.title !== undefined) {
      if (!input.title.trim()) throw new Error("Task title cannot be empty");
      task.title = input.title.trim();
    }

    if (input.description !== undefined) {
      task.description = input.description?.trim() || "";
    }

    if (input.researchStage !== undefined) {
      task.researchStage = input.researchStage;
    }

    if (input.priority !== undefined) {
      task.priority = input.priority;
    }

    if (input.dueDate !== undefined) {
      task.dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
    }

    if (input.paperIds !== undefined) {
      task.paperIds = input.paperIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    if (input.noteIds !== undefined) {
      task.noteIds = input.noteIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    if (input.manuscriptId !== undefined) {
      task.manuscriptId =
        input.manuscriptId && mongoose.isValidObjectId(input.manuscriptId)
          ? new mongoose.Types.ObjectId(input.manuscriptId)
          : undefined;
    }

    if (input.manuscriptSectionId !== undefined) {
      task.manuscriptSectionId =
        input.manuscriptSectionId && mongoose.isValidObjectId(input.manuscriptSectionId)
          ? new mongoose.Types.ObjectId(input.manuscriptSectionId)
          : undefined;
    }

    // Status & Completion handling
    if (input.status !== undefined && input.status !== task.status) {
      task.status = input.status;
      if (input.status === "done") {
        task.completedAt = new Date();
      } else {
        task.completedAt = null;
      }
    }

    await task.save();

    const populated = await ResearchTask.findById(task._id)
      .populate("assigneeId", "fullName contact avatarUrl")
      .populate("createdBy", "fullName contact avatarUrl")
      .populate("paperIds", "title authors year venue")
      .populate("noteIds", "title noteType")
      .populate("manuscriptId", "title citationStyle")
      .populate("manuscriptSectionId", "title sectionType order");

    return populated!;
  },

  /**
   * Update task status (Kanban drag and drop movement)
   */
  updateTaskStatus: async (
    taskId: string,
    researcherId: string,
    newStatus: TaskStatus
  ): Promise<IResearchTask> => {
    if (!mongoose.isValidObjectId(taskId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid task ID or researcher ID format");
    }

    const task = await ResearchTask.findById(taskId);
    if (!task) {
      throw new Error("Research task not found");
    }

    const roleInfo = await collaborationService.getResearcherProjectRole(
      task.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess || !roleInfo.role) {
      throw new Error("Unauthorized: You are not a member of this research project");
    }

    if (roleInfo.role === "reviewer" || roleInfo.role === "viewer") {
      throw new Error("Unauthorized: Reviewers and viewers cannot modify task status");
    }

    const possibleRequesterIds = await resolveResearcherPossibleIds(researcherId);

    // Contributor can move tasks they created or tasks assigned to them
    if (roleInfo.role === "contributor") {
      const isCreator = possibleRequesterIds.some((id) => id.equals(task.createdBy));
      const isAssignee =
        task.assigneeId && possibleRequesterIds.some((id) => id.equals(task.assigneeId!));

      if (!isCreator && !isAssignee) {
        throw new Error(
          "Unauthorized: Contributors can only move tasks they created or are assigned to"
        );
      }
    }

    task.status = newStatus;
    if (newStatus === "done") {
      task.completedAt = new Date();
    } else {
      task.completedAt = null;
    }

    await task.save();

    const populated = await ResearchTask.findById(task._id)
      .populate("assigneeId", "fullName contact avatarUrl")
      .populate("createdBy", "fullName contact avatarUrl")
      .populate("paperIds", "title authors year venue")
      .populate("noteIds", "title noteType")
      .populate("manuscriptId", "title citationStyle")
      .populate("manuscriptSectionId", "title sectionType order");

    return populated!;
  },

  /**
   * Update task assignee
   */
  updateTaskAssignee: async (
    taskId: string,
    researcherId: string,
    newAssigneeId?: string | null
  ): Promise<IResearchTask> => {
    if (!mongoose.isValidObjectId(taskId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid task ID or researcher ID format");
    }

    const task = await ResearchTask.findById(taskId);
    if (!task) {
      throw new Error("Research task not found");
    }

    const project = await ResearchProject.findById(task.projectId);
    if (!project) {
      throw new Error("Research project not found");
    }

    const roleInfo = await collaborationService.getResearcherProjectRole(
      task.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess || !roleInfo.role) {
      throw new Error("Unauthorized: You are not a member of this research project");
    }

    // Only Owner and Co-author can assign/reassign
    if (roleInfo.role !== "owner" && roleInfo.role !== "co_author") {
      throw new Error("Unauthorized: Only project owners and co-authors can assign tasks");
    }

    if (newAssigneeId && newAssigneeId.trim()) {
      const isMember = await verifyProjectMember(project, newAssigneeId);
      if (!isMember) {
        throw new Error("Invalid assignee: Assigned researcher must be a member of this project");
      }
      task.assigneeId = new mongoose.Types.ObjectId(newAssigneeId);
    } else {
      task.assigneeId = undefined;
    }

    await task.save();

    const populated = await ResearchTask.findById(task._id)
      .populate("assigneeId", "fullName contact avatarUrl")
      .populate("createdBy", "fullName contact avatarUrl")
      .populate("paperIds", "title authors year venue")
      .populate("noteIds", "title noteType")
      .populate("manuscriptId", "title citationStyle")
      .populate("manuscriptSectionId", "title sectionType order");

    return populated!;
  },

  /**
   * Delete a research task
   */
  deleteTask: async (taskId: string, researcherId: string): Promise<boolean> => {
    if (!mongoose.isValidObjectId(taskId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid task ID or researcher ID format");
    }

    const task = await ResearchTask.findById(taskId);
    if (!task) {
      throw new Error("Research task not found");
    }

    const roleInfo = await collaborationService.getResearcherProjectRole(
      task.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess || !roleInfo.role) {
      throw new Error("Unauthorized: You are not a member of this research project");
    }

    const possibleRequesterIds = await resolveResearcherPossibleIds(researcherId);

    // Permission check for deletion:
    // Owner & Co-Author can delete any task
    // Contributor can delete ONLY if they created the task
    // Reviewer & Viewer cannot delete
    if (roleInfo.role === "owner" || roleInfo.role === "co_author") {
      // Allowed
    } else if (roleInfo.role === "contributor") {
      const isCreator = possibleRequesterIds.some((id) => id.equals(task.createdBy));
      if (!isCreator) {
        throw new Error("Unauthorized: Contributors cannot delete tasks created by other members");
      }
    } else {
      throw new Error("Unauthorized: Reviewers and viewers cannot delete tasks");
    }

    await ResearchTask.findByIdAndDelete(taskId);
    return true;
  },

  /**
   * Get task summary counts for a project (useful for Dashboard and project overview)
   */
  getProjectTaskSummary: async (
    projectId: string,
    researcherId: string
  ): Promise<{
    total: number;
    active: number;
    dueSoon: number;
    overdue: number;
    completed: number;
  }> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(researcherId)) {
      return { total: 0, active: 0, dueSoon: 0, overdue: 0, completed: 0 };
    }

    const roleInfo = await collaborationService.getResearcherProjectRole(projectId, researcherId);
    if (!roleInfo.hasAccess) {
      return { total: 0, active: 0, dueSoon: 0, overdue: 0, completed: 0 };
    }

    const projObjId = new mongoose.Types.ObjectId(projectId);
    const tasks = await ResearchTask.find({ projectId: projObjId }).lean();

    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    let active = 0;
    let dueSoon = 0;
    let overdue = 0;
    let completed = 0;

    for (const t of tasks) {
      if (t.status === "done") {
        completed++;
      } else {
        active++;
        if (t.dueDate) {
          const d = new Date(t.dueDate);
          if (d < now) {
            overdue++;
          } else if (d <= threeDaysFromNow) {
            dueSoon++;
          }
        }
      }
    }

    return {
      total: tasks.length,
      active,
      dueSoon,
      overdue,
      completed,
    };
  },
};
