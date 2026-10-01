import mongoose from "mongoose";
import ResearchCalendarEvent, {
  IResearchCalendarEvent,
  ResearchCalendarEventType,
} from "../models/ResearchCalendarEvent";
import ResearchTask, { IResearchTask } from "../models/ResearchTask";
import ResearchProject from "../models/ResearchProject";
import ResearcherProfile from "../models/ResearcherProfile";
import { collaborationService } from "./collaboration_service";

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  type?: ResearchCalendarEventType;
  startDate: Date | string;
  endDate?: Date | string;
  allDay?: boolean;
  location?: string;
  assigneeId?: string;
  relatedTaskId?: string;
  relatedPaperIds?: string[];
  relatedNoteIds?: string[];
  relatedManuscriptId?: string;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string;
  type?: ResearchCalendarEventType;
  startDate?: Date | string;
  endDate?: Date | string | null;
  allDay?: boolean;
  location?: string | null;
  assigneeId?: string | null;
  relatedTaskId?: string | null;
  relatedPaperIds?: string[];
  relatedNoteIds?: string[];
  relatedManuscriptId?: string | null;
}

export interface CalendarQueryOptions {
  startDate?: string | Date;
  endDate?: string | Date;
  type?: string;
  assigneeId?: string;
  search?: string;
  includeTasks?: boolean;
  includeEvents?: boolean;
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
 * Helper to verify if a candidate researcher is a member of the project
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

export const researchCalendarService = {
  /**
   * Create a new standalone research calendar event (milestone, meeting, deadline, etc.)
   */
  createEvent: async (
    projectId: string,
    researcherId: string,
    input: CreateCalendarEventInput
  ): Promise<IResearchCalendarEvent> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid project ID or researcher ID format");
    }

    if (!input.title || !input.title.trim()) {
      throw new Error("Event title is required");
    }

    if (!input.startDate) {
      throw new Error("Event start date is required");
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
      throw new Error("Unauthorized: Reviewers and viewers have read-only access and cannot create events");
    }

    // Assignee verification: must be a project member
    let assigneeObjId: mongoose.Types.ObjectId | undefined;
    if (input.assigneeId && input.assigneeId.trim()) {
      const isMember = await verifyProjectMember(project, input.assigneeId);
      if (!isMember) {
        throw new Error("Invalid assignee: Assigned researcher must be a registered member of this project");
      }
      assigneeObjId = new mongoose.Types.ObjectId(input.assigneeId);
    }

    // Related task verification if supplied: must belong to the same project
    let relatedTaskObjId: mongoose.Types.ObjectId | undefined;
    if (input.relatedTaskId && mongoose.isValidObjectId(input.relatedTaskId)) {
      const task = await ResearchTask.findOne({
        _id: input.relatedTaskId,
        projectId: project._id,
      });
      if (task) {
        relatedTaskObjId = task._id as mongoose.Types.ObjectId;
      }
    }

    const creatorObjId = new mongoose.Types.ObjectId(researcherId);
    const startDate = new Date(input.startDate);
    const endDate = input.endDate ? new Date(input.endDate) : undefined;

    const event = await ResearchCalendarEvent.create({
      projectId: project._id,
      ownerId: project.ownerId || creatorObjId,
      createdBy: creatorObjId,
      title: input.title.trim(),
      description: input.description?.trim() || "",
      type: input.type || "milestone",
      startDate,
      endDate,
      allDay: Boolean(input.allDay),
      location: input.location?.trim() || "",
      assigneeId: assigneeObjId,
      relatedTaskId: relatedTaskObjId,
      relatedPaperIds: (input.relatedPaperIds || [])
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
      relatedNoteIds: (input.relatedNoteIds || [])
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
      relatedManuscriptId:
        input.relatedManuscriptId && mongoose.isValidObjectId(input.relatedManuscriptId)
          ? new mongoose.Types.ObjectId(input.relatedManuscriptId)
          : undefined,
    });

    return event;
  },

  /**
   * Get a single calendar event by ID
   */
  getEventById: async (
    eventId: string,
    researcherId: string
  ): Promise<IResearchCalendarEvent> => {
    if (!mongoose.isValidObjectId(eventId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid event ID or researcher ID format");
    }

    const event = await ResearchCalendarEvent.findById(eventId)
      .populate("assigneeId", "fullName email contact affiliation")
      .populate("createdBy", "fullName email contact")
      .populate("relatedTaskId", "title status priority researchStage dueDate")
      .populate("relatedPaperIds", "title authors year venue")
      .populate("relatedNoteIds", "title noteType content")
      .populate("relatedManuscriptId", "title targetJournal status");

    if (!event) {
      throw new Error("Calendar event not found");
    }

    // Role verification
    const roleInfo = await collaborationService.getResearcherProjectRole(
      event.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess) {
      throw new Error("Unauthorized: You do not have access to this event's project");
    }

    return event;
  },

  /**
   * Update an existing research calendar event
   */
  updateEvent: async (
    eventId: string,
    researcherId: string,
    input: UpdateCalendarEventInput
  ): Promise<IResearchCalendarEvent> => {
    if (!mongoose.isValidObjectId(eventId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid event ID or researcher ID format");
    }

    const event = await ResearchCalendarEvent.findById(eventId);
    if (!event) {
      throw new Error("Calendar event not found");
    }

    const project = await ResearchProject.findById(event.projectId);
    if (!project) {
      throw new Error("Research project not found");
    }

    const roleInfo = await collaborationService.getResearcherProjectRole(
      event.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess || !roleInfo.role) {
      throw new Error("Unauthorized: You do not have access to this project");
    }

    if (roleInfo.role === "reviewer" || roleInfo.role === "viewer") {
      throw new Error("Unauthorized: Reviewers and viewers have read-only access and cannot edit events");
    }

    const researcherPossibleIds = await resolveResearcherPossibleIds(researcherId);

    // Contributor role check: can only edit events created by them or assigned to them
    if (roleInfo.role === "contributor") {
      const isCreator = researcherPossibleIds.some((id) => id.equals(event.createdBy));
      const isAssignee = event.assigneeId
        ? researcherPossibleIds.some((id) => id.equals(event.assigneeId!))
        : false;

      if (!isCreator && !isAssignee) {
        throw new Error("Unauthorized: Contributors can only edit events they created or are assigned to");
      }
    }

    // Assignee validation if provided
    if (input.assigneeId !== undefined) {
      if (input.assigneeId && input.assigneeId.trim()) {
        const isMember = await verifyProjectMember(project, input.assigneeId);
        if (!isMember) {
          throw new Error("Invalid assignee: Assigned researcher must be a registered member of this project");
        }
        event.assigneeId = new mongoose.Types.ObjectId(input.assigneeId);
      } else {
        event.assigneeId = undefined;
      }
    }

    if (input.title !== undefined) {
      if (!input.title.trim()) {
        throw new Error("Event title cannot be empty");
      }
      event.title = input.title.trim();
    }

    if (input.description !== undefined) {
      event.description = input.description.trim();
    }

    if (input.type !== undefined) {
      event.type = input.type;
    }

    if (input.startDate !== undefined) {
      event.startDate = new Date(input.startDate);
    }

    if (input.endDate !== undefined) {
      event.endDate = input.endDate ? new Date(input.endDate) : undefined;
    }

    if (input.allDay !== undefined) {
      event.allDay = Boolean(input.allDay);
    }

    if (input.location !== undefined) {
      event.location = input.location ? input.location.trim() : "";
    }

    if (input.relatedTaskId !== undefined) {
      if (input.relatedTaskId && mongoose.isValidObjectId(input.relatedTaskId)) {
        const task = await ResearchTask.findOne({
          _id: input.relatedTaskId,
          projectId: project._id,
        });
        event.relatedTaskId = task ? (task._id as mongoose.Types.ObjectId) : undefined;
      } else {
        event.relatedTaskId = undefined;
      }
    }

    if (input.relatedPaperIds !== undefined) {
      event.relatedPaperIds = input.relatedPaperIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    if (input.relatedNoteIds !== undefined) {
      event.relatedNoteIds = input.relatedNoteIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    }

    if (input.relatedManuscriptId !== undefined) {
      event.relatedManuscriptId =
        input.relatedManuscriptId && mongoose.isValidObjectId(input.relatedManuscriptId)
          ? new mongoose.Types.ObjectId(input.relatedManuscriptId)
          : undefined;
    }

    await event.save();
    return event;
  },

  /**
   * Delete a research calendar event
   */
  deleteEvent: async (
    eventId: string,
    researcherId: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!mongoose.isValidObjectId(eventId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid event ID or researcher ID format");
    }

    const event = await ResearchCalendarEvent.findById(eventId);
    if (!event) {
      throw new Error("Calendar event not found");
    }

    const roleInfo = await collaborationService.getResearcherProjectRole(
      event.projectId.toString(),
      researcherId
    );
    if (!roleInfo.hasAccess || !roleInfo.role) {
      throw new Error("Unauthorized: You do not have access to this project");
    }

    if (roleInfo.role === "reviewer" || roleInfo.role === "viewer") {
      throw new Error("Unauthorized: Reviewers and viewers cannot delete events");
    }

    // Contributor can only delete events they created
    if (roleInfo.role === "contributor") {
      const researcherPossibleIds = await resolveResearcherPossibleIds(researcherId);
      const isCreator = researcherPossibleIds.some((id) => id.equals(event.createdBy));
      if (!isCreator) {
        throw new Error("Unauthorized: Contributors can only delete events they created");
      }
    }

    await ResearchCalendarEvent.findByIdAndDelete(eventId);
    return { success: true, message: "Calendar event successfully deleted" };
  },

  /**
   * Get combined calendar data for a specific project:
   * Returns { tasks: [...], events: [...] }
   * - tasks: existing ResearchTasks that have a dueDate
   * - events: standalone ResearchCalendarEvents (milestones, meetings, etc.)
   */
  getProjectCalendarData: async (
    projectId: string,
    researcherId: string,
    options: CalendarQueryOptions = {}
  ): Promise<{
    tasks: IResearchTask[];
    events: IResearchCalendarEvent[];
  }> => {
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid project ID or researcher ID format");
    }

    // Role verification
    const roleInfo = await collaborationService.getResearcherProjectRole(projectId, researcherId);
    if (!roleInfo.hasAccess) {
      throw new Error("Unauthorized: You are not a member of this research project");
    }

    const projectObjId = new mongoose.Types.ObjectId(projectId);

    // 1. Build date range filter if provided
    let dateFilter: any = {};
    if (options.startDate || options.endDate) {
      dateFilter = {};
      if (options.startDate) {
        dateFilter.$gte = new Date(options.startDate);
      }
      if (options.endDate) {
        dateFilter.$lte = new Date(options.endDate);
      }
    }

    // 2. Fetch standalone calendar events
    let events: IResearchCalendarEvent[] = [];
    if (options.includeEvents !== false) {
      const eventQuery: any = { projectId: projectObjId };

      if (Object.keys(dateFilter).length > 0) {
        eventQuery.startDate = dateFilter;
      }

      if (options.type && options.type !== "all" && options.type !== "task_deadline") {
        eventQuery.type = options.type;
      }

      if (options.assigneeId && mongoose.isValidObjectId(options.assigneeId)) {
        eventQuery.assigneeId = new mongoose.Types.ObjectId(options.assigneeId);
      }

      if (options.search && options.search.trim()) {
        const regex = new RegExp(options.search.trim(), "i");
        eventQuery.$or = [{ title: regex }, { description: regex }, { location: regex }];
      }

      events = await ResearchCalendarEvent.find(eventQuery)
        .sort({ startDate: 1 })
        .populate("assigneeId", "fullName email contact affiliation")
        .populate("createdBy", "fullName email contact")
        .populate("relatedTaskId", "title status priority researchStage")
        .populate("relatedPaperIds", "title authors year venue")
        .populate("relatedNoteIds", "title noteType")
        .populate("relatedManuscriptId", "title status")
        .lean();
    }

    // 3. Fetch ResearchTasks with dueDate (Only if includeTasks !== false)
    let tasks: IResearchTask[] = [];
    if (options.includeTasks !== false && options.type !== "meeting" && options.type !== "milestone") {
      const taskQuery: any = {
        projectId: projectObjId,
        dueDate: { $exists: true, $ne: null },
      };

      if (Object.keys(dateFilter).length > 0) {
        taskQuery.dueDate = dateFilter;
      }

      if (options.assigneeId && mongoose.isValidObjectId(options.assigneeId)) {
        taskQuery.assigneeId = new mongoose.Types.ObjectId(options.assigneeId);
      }

      if (options.search && options.search.trim()) {
        const regex = new RegExp(options.search.trim(), "i");
        taskQuery.$or = [{ title: regex }, { description: regex }];
      }

      tasks = await ResearchTask.find(taskQuery)
        .sort({ dueDate: 1 })
        .populate("assigneeId", "fullName email contact affiliation")
        .populate("paperIds", "title authors year venue")
        .populate("noteIds", "title noteType")
        .populate("manuscriptId", "title status")
        .lean();
    }

    return { tasks, events };
  },

  /**
   * Get combined calendar data across all projects the researcher belongs to
   */
  getAllProjectsCalendarData: async (
    researcherId: string,
    options: CalendarQueryOptions = {}
  ): Promise<{
    tasks: IResearchTask[];
    events: IResearchCalendarEvent[];
  }> => {
    if (!mongoose.isValidObjectId(researcherId)) {
      throw new Error("Invalid researcher ID format");
    }

    const possibleIds = await resolveResearcherPossibleIds(researcherId);

    // Find all projects where researcher is owner or collaborator
    const accessibleProjects = await ResearchProject.find({
      $or: [
        { ownerId: { $in: possibleIds } },
        { "collaborators.researcherId": { $in: possibleIds } },
      ],
    }).select("_id title domain");

    const projectIds = accessibleProjects.map((p) => p._id);

    if (projectIds.length === 0) {
      return { tasks: [], events: [] };
    }

    let dateFilter: any = {};
    if (options.startDate || options.endDate) {
      dateFilter = {};
      if (options.startDate) {
        dateFilter.$gte = new Date(options.startDate);
      }
      if (options.endDate) {
        dateFilter.$lte = new Date(options.endDate);
      }
    }

    // Standalone events
    let events: IResearchCalendarEvent[] = [];
    if (options.includeEvents !== false) {
      const eventQuery: any = { projectId: { $in: projectIds } };
      if (Object.keys(dateFilter).length > 0) {
        eventQuery.startDate = dateFilter;
      }
      if (options.type && options.type !== "all" && options.type !== "task_deadline") {
        eventQuery.type = options.type;
      }
      if (options.assigneeId && mongoose.isValidObjectId(options.assigneeId)) {
        eventQuery.assigneeId = new mongoose.Types.ObjectId(options.assigneeId);
      }

      events = await ResearchCalendarEvent.find(eventQuery)
        .sort({ startDate: 1 })
        .populate("projectId", "title domain")
        .populate("assigneeId", "fullName email contact affiliation")
        .populate("createdBy", "fullName email contact")
        .populate("relatedTaskId", "title status priority researchStage")
        .populate("relatedPaperIds", "title authors year venue")
        .populate("relatedNoteIds", "title noteType")
        .populate("relatedManuscriptId", "title status")
        .lean();
    }

    // Tasks with due dates
    let tasks: IResearchTask[] = [];
    if (options.includeTasks !== false && options.type !== "meeting" && options.type !== "milestone") {
      const taskQuery: any = {
        projectId: { $in: projectIds },
        dueDate: { $exists: true, $ne: null },
      };
      if (Object.keys(dateFilter).length > 0) {
        taskQuery.dueDate = dateFilter;
      }
      if (options.assigneeId && mongoose.isValidObjectId(options.assigneeId)) {
        taskQuery.assigneeId = new mongoose.Types.ObjectId(options.assigneeId);
      }

      tasks = await ResearchTask.find(taskQuery)
        .sort({ dueDate: 1 })
        .populate("projectId", "title domain")
        .populate("assigneeId", "fullName email contact affiliation")
        .populate("paperIds", "title authors year venue")
        .populate("noteIds", "title noteType")
        .populate("manuscriptId", "title status")
        .lean();
    }

    return { tasks, events };
  },

  /**
   * Get standalone events list for a project
   */
  getProjectEvents: async (
    projectId: string,
    researcherId: string,
    options: CalendarQueryOptions = {}
  ): Promise<IResearchCalendarEvent[]> => {
    const { events } = await researchCalendarService.getProjectCalendarData(
      projectId,
      researcherId,
      { ...options, includeTasks: false, includeEvents: true }
    );
    return events;
  },
};
