import { Request, Response } from "express";
import mongoose from "mongoose";
import { researchTaskService } from "../services/research_task_service";
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

  if (mongoose.Types.ObjectId.isValid(clean)) {
    const objId = new mongoose.Types.ObjectId(clean);

    const profile = await ResearcherProfile.findById(objId);
    if (profile) return profile._id.toString();

    const profileByUser = await ResearcherProfile.findOne({ userId: objId });
    if (profileByUser) return profileByUser._id.toString();

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

export const createTaskController = async (req: Request, res: Response): Promise<void> => {
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
    const task = await researchTaskService.createTask(projectId, researcherId, req.body);

    res.status(201).json({
      success: true,
      message: "Research task created successfully",
      data: task,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to create task";
    const statusCode = msg.includes("Unauthorized")
      ? 403
      : msg.includes("Invalid") || msg.includes("required")
      ? 400
      : msg.includes("not found")
      ? 404
      : 500;

    res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
};

export const listProjectTasksController = async (req: Request, res: Response): Promise<void> => {
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
    const { status, researchStage, priority, assigneeId, overdue, dueFilter, dueDate } = req.query;

    const filters = {
      status: typeof status === "string" ? (status as any) : undefined,
      researchStage: typeof researchStage === "string" ? (researchStage as any) : undefined,
      priority: typeof priority === "string" ? (priority as any) : undefined,
      assigneeId: typeof assigneeId === "string" ? assigneeId : undefined,
      overdue: typeof overdue === "string" ? overdue : undefined,
      dueFilter: typeof dueFilter === "string" ? (dueFilter as any) : undefined,
      dueDate: typeof dueDate === "string" ? dueDate : undefined,
    };

    const tasks = await researchTaskService.listProjectTasks(projectId, researcherId, filters);

    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to retrieve project tasks";
    const statusCode = msg.includes("Unauthorized")
      ? 403
      : msg.includes("not found")
      ? 404
      : 500;

    res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
};

export const getTaskByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const taskId = String(req.params.taskId);
    const task = await researchTaskService.getTaskById(taskId, researcherId);

    res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to get task";
    const statusCode = msg.includes("Unauthorized")
      ? 403
      : msg.includes("not found")
      ? 404
      : 500;

    res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
};

export const updateTaskController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const taskId = String(req.params.taskId);
    const updated = await researchTaskService.updateTask(taskId, researcherId, req.body);

    res.status(200).json({
      success: true,
      message: "Research task updated successfully",
      data: updated,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to update task";
    const statusCode = msg.includes("Unauthorized")
      ? 403
      : msg.includes("Invalid") || msg.includes("required")
      ? 400
      : msg.includes("not found")
      ? 404
      : 500;

    res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
};

export const updateTaskStatusController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const taskId = String(req.params.taskId);
    const { status } = req.body;

    if (!status) {
      res.status(400).json({
        success: false,
        message: "Status field is required",
      });
      return;
    }

    const updated = await researchTaskService.updateTaskStatus(taskId, researcherId, status);

    res.status(200).json({
      success: true,
      message: "Task status updated successfully",
      data: updated,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to update task status";
    const statusCode = msg.includes("Unauthorized")
      ? 403
      : msg.includes("not found")
      ? 404
      : 400;

    res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
};

export const updateTaskAssigneeController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const taskId = String(req.params.taskId);
    const { assigneeId } = req.body;

    const updated = await researchTaskService.updateTaskAssignee(
      taskId,
      researcherId,
      assigneeId !== undefined ? assigneeId : null
    );

    res.status(200).json({
      success: true,
      message: "Task assignee updated successfully",
      data: updated,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to update task assignee";
    const statusCode = msg.includes("Unauthorized")
      ? 403
      : msg.includes("Invalid")
      ? 400
      : msg.includes("not found")
      ? 404
      : 500;

    res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
};

export const deleteTaskController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Authentication required: Researcher identity header missing",
      });
      return;
    }

    const taskId = String(req.params.taskId);
    await researchTaskService.deleteTask(taskId, researcherId);

    res.status(200).json({
      success: true,
      message: "Research task deleted successfully",
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to delete task";
    const statusCode = msg.includes("Unauthorized")
      ? 403
      : msg.includes("not found")
      ? 404
      : 500;

    res.status(statusCode).json({
      success: false,
      message: msg,
    });
  }
};

export const getProjectTaskSummaryController = async (req: Request, res: Response): Promise<void> => {
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
    const summary = await researchTaskService.getProjectTaskSummary(projectId, researcherId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to get project task summary",
    });
  }
};
