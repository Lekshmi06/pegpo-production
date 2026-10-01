import { Request, Response } from "express";
import * as teacherTaskService from "../services/teacher_task_service";

const resolveTeacherId = (req: Request): string => {
  if (req.teacherProfile?._id) {
    return req.teacherProfile._id.toString();
  }
  const headerId = req.headers["x-teacher-profile-id"] as string;
  if (headerId) return headerId;
  const queryId = req.query.teacherProfileId as string;
  if (queryId) return queryId;
  throw new Error("Teacher profile not identified");
};

export const getTeacherTasksHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherId = resolveTeacherId(req);
    const { date, startDate, endDate, status, taskType } = req.query;

    const tasks = await teacherTaskService.listTasks(teacherId, {
      date: typeof date === "string" ? date : undefined,
      startDate: typeof startDate === "string" ? startDate : undefined,
      endDate: typeof endDate === "string" ? endDate : undefined,
      status: typeof status === "string" ? status : undefined,
      taskType: typeof taskType === "string" ? taskType : undefined,
    });

    res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch teacher tasks",
    });
  }
};

export const getUpcomingTeacherTasksHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherId = resolveTeacherId(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 4;

    const tasks = await teacherTaskService.getUpcomingTasks(teacherId, limit);

    res.status(200).json({
      success: true,
      data: tasks,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch upcoming tasks",
    });
  }
};

export const getTeacherTaskByIdHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherId = resolveTeacherId(req);
    const taskId = req.params.id as string;

    const task = await teacherTaskService.getTaskById(teacherId, taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        message: "Task not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch task",
    });
  }
};

export const createTeacherTaskHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherId = resolveTeacherId(req);
    const task = await teacherTaskService.createTask(teacherId, req.body);

    res.status(201).json({
      success: true,
      data: task,
      message: "Task created successfully",
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to create task",
    });
  }
};

export const updateTeacherTaskHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherId = resolveTeacherId(req);
    const taskId = req.params.id as string;

    const updated = await teacherTaskService.updateTask(teacherId, taskId, req.body);
    if (!updated) {
      res.status(404).json({
        success: false,
        message: "Task not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: updated,
      message: "Task updated successfully",
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to update task",
    });
  }
};

export const deleteTeacherTaskHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherId = resolveTeacherId(req);
    const taskId = req.params.id as string;

    const deleted = await teacherTaskService.deleteTask(teacherId, taskId);
    if (!deleted) {
      res.status(404).json({
        success: false,
        message: "Task not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to delete task",
    });
  }
};
