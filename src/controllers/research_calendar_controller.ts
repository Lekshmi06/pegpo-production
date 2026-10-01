import { Request, Response } from "express";
import mongoose from "mongoose";
import { researchCalendarService } from "../services/research_calendar_service";
import User from "../models/User";
import ResearcherProfile from "../models/ResearcherProfile";

/**
 * Robust async researcher ID resolution from headers, token, email, query, or body
 */
const resolveResearcherId = async (req: Request): Promise<string | undefined> => {
  if (req.researcherProfile?._id) {
    return req.researcherProfile._id.toString();
  }
  if (req.user?._id) {
    const p = await ResearcherProfile.findOne({ userId: req.user._id });
    if (p) return p._id.toString();
    return req.user._id.toString();
  }

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

  if (clean.includes("@")) {
    const user = await User.findOne({ email: clean.toLowerCase() });
    if (user) {
      const profile = await ResearcherProfile.findOne({ userId: user._id });
      if (profile) return profile._id.toString();
      return user._id.toString();
    }
  }

  if (mongoose.isValidObjectId(clean)) {
    const profile = await ResearcherProfile.findById(clean);
    if (profile) return profile._id.toString();

    const byUser = await ResearcherProfile.findOne({
      userId: new mongoose.Types.ObjectId(clean),
    });
    if (byUser) return byUser._id.toString();

    const user = await User.findById(clean);
    if (user) return user._id.toString();

    return clean;
  }

  return undefined;
};

/**
 * POST /api/research/projects/:projectId/calendar/events
 */
export const createCalendarEventController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity could not be verified",
      });
      return;
    }

    const projectId = String(req.params.projectId);
    const {
      title,
      description,
      type,
      startDate,
      endDate,
      allDay,
      location,
      assigneeId,
      relatedTaskId,
      relatedPaperIds,
      relatedNoteIds,
      relatedManuscriptId,
    } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({
        success: false,
        message: "Event title is required",
      });
      return;
    }

    if (!startDate) {
      res.status(400).json({
        success: false,
        message: "Event start date is required",
      });
      return;
    }

    const event = await researchCalendarService.createEvent(
      projectId,
      researcherId,
      {
        title,
        description,
        type,
        startDate,
        endDate,
        allDay,
        location,
        assigneeId,
        relatedTaskId,
        relatedPaperIds,
        relatedNoteIds,
        relatedManuscriptId,
      }
    );

    res.status(201).json({
      success: true,
      data: event,
      message: "Research calendar event created successfully",
    });
  } catch (error: any) {
    const message = error.message || "Failed to create calendar event";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
      ? 404
      : 400;
    res.status(status).json({ success: false, message });
  }
};

/**
 * GET /api/research/projects/:projectId/calendar
 * Combined view: existing tasks with due dates + standalone events
 */
export const getProjectCalendarDataController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity could not be verified",
      });
      return;
    }

    const projectId = String(req.params.projectId);
    const { startDate, endDate, type, assigneeId, search, includeTasks, includeEvents } =
      req.query;

    const data = await researchCalendarService.getProjectCalendarData(
      projectId,
      researcherId,
      {
        startDate: startDate as string,
        endDate: endDate as string,
        type: type as string,
        assigneeId: assigneeId as string,
        search: search as string,
        includeTasks: includeTasks === "false" ? false : true,
        includeEvents: includeEvents === "false" ? false : true,
      }
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    const message = error.message || "Failed to fetch project calendar data";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
      ? 404
      : 400;
    res.status(status).json({ success: false, message });
  }
};

/**
 * GET /api/research/projects/:projectId/calendar/events
 */
export const getProjectEventsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity could not be verified",
      });
      return;
    }

    const projectId = String(req.params.projectId);
    const { startDate, endDate, type, assigneeId, search } = req.query;

    const events = await researchCalendarService.getProjectEvents(
      projectId,
      researcherId,
      {
        startDate: startDate as string,
        endDate: endDate as string,
        type: type as string,
        assigneeId: assigneeId as string,
        search: search as string,
      }
    );

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    const message = error.message || "Failed to fetch calendar events";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
      ? 404
      : 400;
    res.status(status).json({ success: false, message });
  }
};

/**
 * GET /api/research/calendar/all
 * Combined calendar data across all projects the researcher belongs to
 */
export const getAllProjectsCalendarController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity could not be verified",
      });
      return;
    }

    const { startDate, endDate, type, assigneeId, search, includeTasks, includeEvents } =
      req.query;

    const data = await researchCalendarService.getAllProjectsCalendarData(
      researcherId,
      {
        startDate: startDate as string,
        endDate: endDate as string,
        type: type as string,
        assigneeId: assigneeId as string,
        search: search as string,
        includeTasks: includeTasks === "false" ? false : true,
        includeEvents: includeEvents === "false" ? false : true,
      }
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    const message = error.message || "Failed to fetch all projects calendar data";
    res.status(500).json({ success: false, message });
  }
};

/**
 * GET /api/research/calendar/events/:eventId
 */
export const getCalendarEventByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity could not be verified",
      });
      return;
    }

    const eventId = String(req.params.eventId);
    const event = await researchCalendarService.getEventById(eventId, researcherId);

    res.status(200).json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    const message = error.message || "Failed to fetch calendar event";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
      ? 404
      : 400;
    res.status(status).json({ success: false, message });
  }
};

/**
 * PUT /api/research/calendar/events/:eventId
 */
export const updateCalendarEventController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity could not be verified",
      });
      return;
    }

    const eventId = String(req.params.eventId);
    const updated = await researchCalendarService.updateEvent(
      eventId,
      researcherId,
      req.body
    );

    res.status(200).json({
      success: true,
      data: updated,
      message: "Calendar event updated successfully",
    });
  } catch (error: any) {
    const message = error.message || "Failed to update calendar event";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
      ? 404
      : 400;
    res.status(status).json({ success: false, message });
  }
};

/**
 * DELETE /api/research/calendar/events/:eventId
 */
export const deleteCalendarEventController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity could not be verified",
      });
      return;
    }

    const eventId = String(req.params.eventId);
    const result = await researchCalendarService.deleteEvent(eventId, researcherId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    const message = error.message || "Failed to delete calendar event";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("not found")
      ? 404
      : 400;
    res.status(status).json({ success: false, message });
  }
};
