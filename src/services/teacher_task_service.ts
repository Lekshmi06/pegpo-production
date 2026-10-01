import mongoose from "mongoose";
import TeacherTask, { ITeacherTask } from "../models/TeacherTask";

export interface ListTasksFilter {
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  taskType?: string;
}

export const listTasks = async (
  teacherId: string | mongoose.Types.ObjectId,
  filters?: ListTasksFilter
): Promise<ITeacherTask[]> => {
  const query: any = {
    teacherId: new mongoose.Types.ObjectId(teacherId.toString()),
  };

  if (filters?.date) {
    query.date = filters.date;
  } else if (filters?.startDate || filters?.endDate) {
    query.date = {};
    if (filters.startDate) query.date.$gte = filters.startDate;
    if (filters.endDate) query.date.$lte = filters.endDate;
  }

  if (filters?.status) {
    query.status = filters.status;
  }

  if (filters?.taskType) {
    query.taskType = filters.taskType;
  }

  return await TeacherTask.find(query)
    .populate("classSectionId", "name classLevel section board")
    .populate("teachingContextId", "subject classLevel section")
    .sort({ date: 1, startTime: 1, createdAt: -1 });
};

export const getUpcomingTasks = async (
  teacherId: string | mongoose.Types.ObjectId,
  limit: number = 4
): Promise<ITeacherTask[]> => {
  const todayStr = new Date().toISOString().split("T")[0];
  const teacherObjId = new mongoose.Types.ObjectId(teacherId.toString());

  // First search for tasks from today onwards
  let tasks = await TeacherTask.find({
    teacherId: teacherObjId,
    date: { $gte: todayStr },
  })
    .populate("classSectionId", "name classLevel section board")
    .populate("teachingContextId", "subject classLevel section")
    .sort({ date: 1, startTime: 1 })
    .limit(limit);

  // If fewer than limit found, backfill with remaining pending tasks
  if (tasks.length < limit) {
    const existingIds = tasks.map((t) => t._id);
    const additional = await TeacherTask.find({
      teacherId: teacherObjId,
      _id: { $nin: existingIds },
      status: { $nin: ["completed", "Completed"] },
    })
      .populate("classSectionId", "name classLevel section board")
      .populate("teachingContextId", "subject classLevel section")
      .sort({ date: -1, createdAt: -1 })
      .limit(limit - tasks.length);

    tasks = [...tasks, ...additional];
  }

  return tasks;
};

export const getTaskById = async (
  teacherId: string | mongoose.Types.ObjectId,
  taskId: string
): Promise<ITeacherTask | null> => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) return null;

  return await TeacherTask.findOne({
    _id: new mongoose.Types.ObjectId(taskId),
    teacherId: new mongoose.Types.ObjectId(teacherId.toString()),
  })
    .populate("classSectionId", "name classLevel section board")
    .populate("teachingContextId", "subject classLevel section");
};

export const createTask = async (
  teacherId: string | mongoose.Types.ObjectId,
  data: Partial<ITeacherTask>
): Promise<ITeacherTask> => {
  if (!data.title || !data.title.trim()) {
    throw new Error("Task title is required");
  }

  let formattedDate = data.date ? data.date.trim() : "";
  if (!formattedDate) {
    formattedDate = new Date().toISOString().split("T")[0];
  }

  const teacherObjId = new mongoose.Types.ObjectId(teacherId.toString());

  const task = await TeacherTask.create({
    teacherId: teacherObjId,
    title: data.title.trim(),
    description: data.description?.trim() || "",
    date: formattedDate,
    startTime: data.startTime?.trim() || undefined,
    endTime: data.endTime?.trim() || undefined,
    taskType: data.taskType || "General",
    priority: data.priority || "Normal",
    status: data.status || "pending",
    teachingContextId: data.teachingContextId
      ? new mongoose.Types.ObjectId(data.teachingContextId.toString())
      : undefined,
    classSectionId: data.classSectionId
      ? new mongoose.Types.ObjectId(data.classSectionId.toString())
      : undefined,
  });

  return (await getTaskById(teacherId, task._id.toString())) || task;
};

export const updateTask = async (
  teacherId: string | mongoose.Types.ObjectId,
  taskId: string,
  data: Partial<ITeacherTask>
): Promise<ITeacherTask | null> => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error("Invalid task ID");
  }

  const existing = await TeacherTask.findOne({
    _id: new mongoose.Types.ObjectId(taskId),
    teacherId: new mongoose.Types.ObjectId(teacherId.toString()),
  });

  if (!existing) {
    return null;
  }

  if (data.title !== undefined) existing.title = data.title.trim();
  if (data.description !== undefined) existing.description = data.description.trim();
  if (data.date !== undefined) existing.date = data.date.trim();
  if (data.startTime !== undefined) existing.startTime = data.startTime?.trim() || undefined;
  if (data.endTime !== undefined) existing.endTime = data.endTime?.trim() || undefined;
  if (data.taskType !== undefined) existing.taskType = data.taskType;
  if (data.priority !== undefined) existing.priority = data.priority;
  if (data.status !== undefined) existing.status = data.status;

  if (data.teachingContextId !== undefined) {
    existing.teachingContextId = data.teachingContextId
      ? new mongoose.Types.ObjectId(data.teachingContextId.toString())
      : undefined;
  }
  if (data.classSectionId !== undefined) {
    existing.classSectionId = data.classSectionId
      ? new mongoose.Types.ObjectId(data.classSectionId.toString())
      : undefined;
  }

  await existing.save();
  return await getTaskById(teacherId, taskId);
};

export const deleteTask = async (
  teacherId: string | mongoose.Types.ObjectId,
  taskId: string
): Promise<boolean> => {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return false;
  }

  const result = await TeacherTask.deleteOne({
    _id: new mongoose.Types.ObjectId(taskId),
    teacherId: new mongoose.Types.ObjectId(teacherId.toString()),
  });

  return result.deletedCount > 0;
};
