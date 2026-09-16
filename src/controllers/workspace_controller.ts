import { Request, Response } from "express";
import mongoose from "mongoose";
import Note from "../models/Note";
import Folder from "../models/Folder";
import CalendarEvent from "../models/CalendarEvent";
import StudentProject from "../models/StudentProject";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";

// Helper to safely extract string param in Express 5
const getParamId = (req: Request): string => {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] : (raw as string) || "";
};

// Helper to resolve the active student's userId and studentProfileId
const resolveStudentIds = async (
  req: Request
): Promise<{ userId: mongoose.Types.ObjectId; studentProfileId?: mongoose.Types.ObjectId }> => {
  if (req.user?._id) {
    return {
      userId: req.user._id as mongoose.Types.ObjectId,
      studentProfileId: req.studentProfile?._id as mongoose.Types.ObjectId | undefined,
    };
  }

  const rawUserId =
    (req.headers["x-user-id"] as string) || (req.query.userId as string);
  if (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) {
    const user = await User.findById(rawUserId);
    if (user) {
      const profile = await StudentProfile.findOne({ userId: user._id });
      return {
        userId: user._id as mongoose.Types.ObjectId,
        studentProfileId: profile?._id as mongoose.Types.ObjectId | undefined,
      };
    }
  }

  const rawProfileId =
    (req.headers["x-student-profile-id"] as string) ||
    (req.query.studentProfileId as string);
  if (rawProfileId && mongoose.Types.ObjectId.isValid(rawProfileId)) {
    const profile = await StudentProfile.findById(rawProfileId);
    if (profile) {
      return {
        userId: profile.userId as mongoose.Types.ObjectId,
        studentProfileId: profile._id as mongoose.Types.ObjectId,
      };
    }
  }

  // Fallback in dev/local mode: find or create default student
  let profile = await StudentProfile.findOne();
  if (!profile) {
    let user = await User.findOne();
    if (!user) {
      user = await User.create({
        email: "student@edupye.com",
        name: "Student",
        userType: "student",
      });
    }
    profile = await StudentProfile.create({
      userId: user._id,
      name: user.name || "Student",
      goal: "School Curriculum Mastery",
      learningPath: "school",
    });
  }

  return {
    userId: profile.userId as mongoose.Types.ObjectId,
    studentProfileId: profile._id as mongoose.Types.ObjectId,
  };
};

// ==========================================
// 1. NOTES CONTROLLERS
// ==========================================

export const getNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = await resolveStudentIds(req);
    const { folderId, search, tag } = req.query;

    const filter: any = { userId };
    if (folderId && typeof folderId === "string" && mongoose.Types.ObjectId.isValid(folderId)) {
      filter.folderId = folderId;
    }
    if (tag) {
      filter.tags = tag;
    }
    if (search && typeof search === "string") {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [{ title: searchRegex }, { content: searchRegex }];
    }

    const notes = await Note.find(filter).sort({ isPinned: -1, updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error: any) {
    console.error("getNotes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notes",
      error: error?.message,
    });
  }
};

export const getNoteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid note ID" });
      return;
    }

    const { userId } = await resolveStudentIds(req);
    const note = await Note.findOne({ _id: id, userId });
    if (!note) {
      res.status(404).json({ success: false, message: "Note not found" });
      return;
    }

    res.status(200).json({ success: true, data: note });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to get note", error: error?.message });
  }
};

export const createNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, studentProfileId } = await resolveStudentIds(req);
    const { title, content, folderId, tags, isPinned } = req.body;

    const preview = content
      ? content.replace(/<[^>]*>/g, "").replace(/[#*_`\[\]]/g, "").slice(0, 120).trim() || "No text yet"
      : "No text yet";

    const newNote = await Note.create({
      userId,
      studentProfileId,
      folderId: folderId && typeof folderId === "string" && mongoose.Types.ObjectId.isValid(folderId) ? folderId : undefined,
      title: title?.trim() || "Untitled Note",
      content: content || "",
      preview,
      tags: Array.isArray(tags) ? tags : [],
      isPinned: Boolean(isPinned),
    });

    res.status(201).json({
      success: true,
      data: newNote,
      message: "Note created successfully",
    });
  } catch (error: any) {
    console.error("createNote error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create note",
      error: error?.message,
    });
  }
};

export const updateNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid note ID" });
      return;
    }

    const { userId } = await resolveStudentIds(req);
    const { title, content, folderId, tags, isPinned } = req.body;
    const updateData: any = {};

    if (title !== undefined) updateData.title = title.trim() || "Untitled Note";
    if (content !== undefined) {
      updateData.content = content;
      updateData.preview = content
        ? content.replace(/<[^>]*>/g, "").replace(/[#*_`\[\]]/g, "").slice(0, 120).trim() || "No text yet"
        : "No text yet";
    }
    if (folderId !== undefined) {
      updateData.folderId = folderId && typeof folderId === "string" && mongoose.Types.ObjectId.isValid(folderId) ? folderId : null;
    }
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
    if (isPinned !== undefined) updateData.isPinned = Boolean(isPinned);

    const updated = await Note.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!updated) {
      res.status(404).json({ success: false, message: "Note not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: updated,
      message: "Note updated successfully",
    });
  } catch (error: any) {
    console.error("updateNote error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update note",
      error: error?.message,
    });
  }
};

export const deleteNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid note ID" });
      return;
    }

    const { userId } = await resolveStudentIds(req);
    const deleted = await Note.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      res.status(404).json({ success: false, message: "Note not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: deleted,
      message: "Note deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to delete note", error: error?.message });
  }
};

// ==========================================
// 2. FOLDERS CONTROLLERS
// ==========================================

export const getFolders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = await resolveStudentIds(req);
    const folders = await Folder.find({ userId }).sort({ createdAt: -1 });

    // Attach note counts to each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (f) => {
        const count = await Note.countDocuments({ folderId: f._id });
        return {
          ...f.toObject(),
          notesCount: count,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: foldersWithCounts,
    });
  } catch (error: any) {
    console.error("getFolders error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch folders",
      error: error?.message,
    });
  }
};

export const createFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, studentProfileId } = await resolveStudentIds(req);
    const { name, title, desc, color, category } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, message: "Folder name is required" });
      return;
    }

    const folder = await Folder.create({
      userId,
      studentProfileId,
      name: name.trim(),
      title: title?.trim() || name.trim(),
      desc: desc?.trim() || "",
      color: color || "#2b4d7a",
      category: category || "notes",
    });

    res.status(201).json({
      success: true,
      data: { ...folder.toObject(), notesCount: 0 },
      message: "Folder created successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to create folder", error: error?.message });
  }
};

export const updateFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid folder ID" });
      return;
    }

    const { name, title, desc, color, category } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (title !== undefined) updateData.title = title.trim();
    if (desc !== undefined) updateData.desc = desc.trim();
    if (color !== undefined) updateData.color = color;
    if (category !== undefined) updateData.category = category;

    const folder = await Folder.findByIdAndUpdate(id, updateData, { new: true });
    if (!folder) {
      res.status(404).json({ success: false, message: "Folder not found" });
      return;
    }

    const notesCount = await Note.countDocuments({ folderId: folder._id });
    res.status(200).json({
      success: true,
      data: { ...folder.toObject(), notesCount },
      message: "Folder updated successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to update folder", error: error?.message });
  }
};

export const deleteFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid folder ID" });
      return;
    }

    const deleted = await Folder.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Folder not found" });
      return;
    }

    // Unlink notes from deleted folder
    await Note.updateMany({ folderId: id }, { $unset: { folderId: "" } });

    res.status(200).json({
      success: true,
      data: deleted,
      message: "Folder deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to delete folder", error: error?.message });
  }
};

// ==========================================
// 3. CALENDAR EVENTS CONTROLLERS
// ==========================================

export const getCalendarEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = await resolveStudentIds(req);
    const { date, eventType } = req.query;

    const filter: any = { userId };
    if (date && typeof date === "string") {
      filter.date = date;
    }
    if (eventType && typeof eventType === "string") {
      filter.eventType = eventType;
    }

    const events = await CalendarEvent.find(filter).sort({ date: 1, startTime: 1 });
    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to get calendar events", error: error?.message });
  }
};

export const createCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, studentProfileId } = await resolveStudentIds(req);
    const { title, description, eventType, date, startTime, endTime, location, color } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({ success: false, message: "Event title is required" });
      return;
    }

    const event = await CalendarEvent.create({
      userId,
      studentProfileId,
      title: title.trim(),
      description: description?.trim() || "",
      eventType: eventType || "task",
      date: date || new Date().toISOString().split("T")[0],
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      location: location || "",
      color: color || "#3b82f6",
      isCompleted: false,
    });

    res.status(201).json({
      success: true,
      data: event,
      message: "Calendar event created successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to create event", error: error?.message });
  }
};

export const updateCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid event ID" });
      return;
    }

    const updateData = { ...req.body };
    const event = await CalendarEvent.findByIdAndUpdate(id, updateData, { new: true });
    if (!event) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: event,
      message: "Event updated successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to update event", error: error?.message });
  }
};

export const deleteCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid event ID" });
      return;
    }

    const deleted = await CalendarEvent.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Event not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: deleted,
      message: "Event deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to delete event", error: error?.message });
  }
};

// ==========================================
// 4. PROJECTS CONTROLLERS
// ==========================================

export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = await resolveStudentIds(req);
    const projects = await StudentProject.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to get projects", error: error?.message });
  }
};

export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, studentProfileId } = await resolveStudentIds(req);
    const { name, title, content, status, dueDate, tags } = req.body;

    const project = await StudentProject.create({
      userId,
      studentProfileId,
      name: name?.trim() || "New Project",
      title: title?.trim() || "",
      content: content || "",
      status: status || "planning",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      tags: Array.isArray(tags) ? tags : [],
    });

    res.status(201).json({
      success: true,
      data: project,
      message: "Project created successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to create project", error: error?.message });
  }
};

export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid project ID" });
      return;
    }

    const updateData = { ...req.body };
    const project = await StudentProject.findByIdAndUpdate(id, updateData, { new: true });
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: project,
      message: "Project updated successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to update project", error: error?.message });
  }
};

export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: "Invalid project ID" });
      return;
    }

    const deleted = await StudentProject.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: deleted,
      message: "Project deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Failed to delete project", error: error?.message });
  }
};
