import { Request, Response } from "express";
import Task from "../models/Task";
import TaskActivity from "../models/TaskActivity";
import TaskComment from "../models/TaskComment";
import TaskSubscriber from "../models/TaskSubscriber";
import Tag from "../models/Tag";
import TaskTag from "../models/TaskTag";

class TaskService {
  async getTasks() {
    const tasks: any[] = await Task.find({}).sort({ taskNumber: -1 }).lean();
    return tasks.map((t) => ({
      ...t,
      id: t.id || t.taskNumber,
    }));
  }

  async getTask(id: string | number) {
    const numericId = Number(id);
    const query = isNaN(numericId)
      ? { _id: id }
      : { $or: [{ id: numericId }, { taskNumber: numericId }] };

    const task: any = await Task.findOne(query).lean();
    if (!task) {
      const err: any = new Error(`Task with ID ${id} not found`);
      err.status = 404;
      throw err;
    }

    return {
      ...task,
      id: task.id || task.taskNumber,
    };
  }

  async createTask(dto: any, userId = 1) {
    const highestTask: any = await Task.findOne().sort({ taskNumber: -1 }).lean();
    const taskNumber = (highestTask?.taskNumber || 0) + 1;

    const newTask = await Task.create({
      id: taskNumber,
      taskNumber,
      title: dto.title,
      description: dto.description || null,
      status: dto.status || "OPEN",
      priority: dto.priority || "NORMAL",
      visibility: dto.visibility || "ALL_USERS",
      createdById: userId,
      assignedToId: dto.assignedToId || null,
      parentTaskId: dto.parentTaskId || null,
    });

    await TaskActivity.create({
      taskId: taskNumber,
      userId,
      type: "CREATED",
      oldValue: null,
      newValue: null,
      comment: null,
      createdAt: new Date(),
    });

    return newTask.toJSON();
  }

  async updateTask(id: string | number, dto: any, userId = 1) {
    const task = await this.getTask(id);
    const taskId = task.id;

    const updateFields: any = {};
    if (dto.title !== undefined) updateFields.title = dto.title;
    if (dto.description !== undefined) updateFields.description = dto.description;
    if (dto.status !== undefined) updateFields.status = dto.status;
    if (dto.priority !== undefined) updateFields.priority = dto.priority;
    if (dto.visibility !== undefined) updateFields.visibility = dto.visibility;
    if (dto.assignedToId !== undefined) updateFields.assignedToId = dto.assignedToId;
    if (dto.parentTaskId !== undefined) updateFields.parentTaskId = dto.parentTaskId;

    const updatedTask: any = await Task.findOneAndUpdate(
      { $or: [{ id: taskId }, { taskNumber: taskId }] },
      { $set: updateFields },
      { new: true }
    ).lean();

    if (dto.priority !== undefined && dto.priority !== task.priority) {
      await TaskActivity.create({
        taskId,
        userId,
        type: "PRIORITY_CHANGED",
        oldValue: task.priority,
        newValue: dto.priority,
        comment: null,
        createdAt: new Date(),
      });
    }

    if (dto.status !== undefined && dto.status !== task.status) {
      await TaskActivity.create({
        taskId,
        userId,
        type: "STATUS_CHANGED",
        oldValue: task.status,
        newValue: dto.status,
        comment: null,
        createdAt: new Date(),
      });
    }

    if (dto.assignedToId !== undefined && dto.assignedToId !== task.assignedToId) {
      await TaskActivity.create({
        taskId,
        userId,
        type: "ASSIGNED",
        oldValue: task.assignedToId !== null ? String(task.assignedToId) : null,
        newValue: dto.assignedToId !== null ? String(dto.assignedToId) : null,
        comment: null,
        createdAt: new Date(),
      });
    }

    return {
      ...updatedTask,
      id: updatedTask?.id || updatedTask?.taskNumber,
    };
  }

  async deleteTask(id: string | number) {
    const task = await this.getTask(id);
    const taskId = task.id;

    await Task.updateMany({ parentTaskId: taskId }, { $set: { parentTaskId: null } });

    await TaskActivity.deleteMany({ taskId });
    await TaskComment.deleteMany({ taskId });
    await TaskSubscriber.deleteMany({ taskId });
    await TaskTag.deleteMany({ taskId });

    await Task.deleteOne({ $or: [{ id: taskId }, { taskNumber: taskId }] });

    return { message: `Task with ID ${taskId} deleted successfully` };
  }

  async getActivities(taskId: string | number) {
    const numericTaskId = Number(taskId);
    return TaskActivity.find({ taskId: numericTaskId }).sort({ createdAt: 1 }).lean();
  }

  async createComment(taskId: string | number, dto: any, userId = 1) {
    const task = await this.getTask(taskId);
    const numericTaskId = task.id;

    const highest: any = await TaskComment.findOne().sort({ id: -1 }).lean();
    const commentId = (highest?.id || 0) + 1;

    const comment = await TaskComment.create({
      id: commentId,
      taskId: numericTaskId,
      userId,
      content: dto.content,
    });

    await TaskActivity.create({
      taskId: numericTaskId,
      userId,
      type: "COMMENT_ADDED",
      oldValue: null,
      newValue: null,
      comment: dto.content,
      createdAt: new Date(),
    });

    return comment.toJSON();
  }

  async getComments(taskId: string | number) {
    const task = await this.getTask(taskId);
    return TaskComment.find({ taskId: task.id }).sort({ createdAt: 1 }).lean();
  }

  async deleteComment(taskId: string | number, commentId: string | number) {
    const task = await this.getTask(taskId);
    const numCommentId = Number(commentId);

    const comment: any = await TaskComment.findOne({
      taskId: task.id,
      $or: [{ id: numCommentId }, { _id: isNaN(numCommentId) ? commentId : null }],
    });

    if (!comment) {
      const err: any = new Error(`Comment with ID ${commentId} not found for task ${taskId}`);
      err.status = 404;
      throw err;
    }

    await TaskComment.deleteOne({ _id: comment._id });
    return { message: `Comment with ID ${commentId} deleted successfully` };
  }

  async addSubscriber(taskId: string | number, dto: any, actorUserId = 1) {
    const task = await this.getTask(taskId);
    const numericTaskId = task.id;
    const subUserId = Number(dto.userId);

    const existing = await TaskSubscriber.findOne({ taskId: numericTaskId, userId: subUserId });
    if (existing) {
      return existing.toJSON();
    }

    const subscriber = await TaskSubscriber.create({
      taskId: numericTaskId,
      userId: subUserId,
      createdAt: new Date(),
    });

    await TaskActivity.create({
      taskId: numericTaskId,
      userId: actorUserId,
      type: "SUBSCRIBER_ADDED",
      oldValue: null,
      newValue: String(subUserId),
      comment: null,
      createdAt: new Date(),
    });

    return subscriber.toJSON();
  }

  async getSubscribers(taskId: string | number) {
    const task = await this.getTask(taskId);
    return TaskSubscriber.find({ taskId: task.id }).lean();
  }

  async removeSubscriber(taskId: string | number, userId: string | number, actorUserId = 1) {
    const task = await this.getTask(taskId);
    const numericTaskId = task.id;
    const subUserId = Number(userId);

    const subscriber = await TaskSubscriber.findOne({ taskId: numericTaskId, userId: subUserId });
    if (!subscriber) {
      const err: any = new Error(`User ${userId} is not subscribed to task ${taskId}`);
      err.status = 404;
      throw err;
    }

    await TaskSubscriber.deleteOne({ _id: subscriber._id });

    await TaskActivity.create({
      taskId: numericTaskId,
      userId: actorUserId,
      type: "SUBSCRIBER_REMOVED",
      oldValue: String(subUserId),
      newValue: null,
      comment: null,
      createdAt: new Date(),
    });

    return { message: `User ${userId} unsubscribed from task ${taskId} successfully` };
  }

  async createTag(dto: any) {
    const existing = await Tag.findOne({ name: dto.name.trim() });
    if (existing) {
      const err: any = new Error(`Tag "${dto.name}" already exists`);
      err.status = 409;
      throw err;
    }

    const highest: any = await Tag.findOne().sort({ id: -1 }).lean();
    const tagId = (highest?.id || 0) + 1;

    const tag = await Tag.create({
      id: tagId,
      name: dto.name.trim(),
      description: dto.description || null,
    });

    return tag.toJSON();
  }

  async getTags() {
    return Tag.find({}).sort({ name: 1 }).lean();
  }

  async addTagToTask(taskId: string | number, dto: any, actorUserId = 1) {
    const task = await this.getTask(taskId);
    const numericTaskId = task.id;
    const tagId = Number(dto.tagId);

    const tag: any = await Tag.findOne({
      $or: [{ id: tagId }, { _id: isNaN(tagId) ? dto.tagId : null }],
    });
    if (!tag) {
      const err: any = new Error(`Tag with ID ${dto.tagId} not found`);
      err.status = 404;
      throw err;
    }

    const existing = await TaskTag.findOne({ taskId: numericTaskId, tagId: tag.id || tagId });
    if (!existing) {
      await TaskTag.create({ taskId: numericTaskId, tagId: tag.id || tagId });

      await TaskActivity.create({
        taskId: numericTaskId,
        userId: actorUserId,
        type: "TAG_ADDED",
        oldValue: null,
        newValue: tag.name,
        comment: null,
        createdAt: new Date(),
      });
    }

    return { taskId: numericTaskId, tagId: tag.id || tagId };
  }

  async getTaskTags(taskId: string | number) {
    const task = await this.getTask(taskId);
    return TaskTag.find({ taskId: task.id }).lean();
  }

  async removeTagFromTask(taskId: string | number, tagId: string | number, actorUserId = 1) {
    const task = await this.getTask(taskId);
    const numericTaskId = task.id;
    const numTagId = Number(tagId);

    const taskTag = await TaskTag.findOne({
      taskId: numericTaskId,
      tagId: numTagId,
    });

    if (!taskTag) {
      const err: any = new Error(`Tag ${tagId} is not attached to task ${taskId}`);
      err.status = 404;
      throw err;
    }

    await TaskTag.deleteOne({ _id: taskTag._id });

    await TaskActivity.create({
      taskId: numericTaskId,
      userId: actorUserId,
      type: "TAG_REMOVED",
      oldValue: String(tagId),
      newValue: null,
      comment: null,
      createdAt: new Date(),
    });

    return { message: `Tag ${tagId} removed from task ${taskId} successfully` };
  }
}

const taskService = new TaskService();

export const adminTaskController = {
  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const tasks = await taskService.getTasks();
      res.json(tasks);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },

  async getTask(req: Request, res: Response): Promise<void> {
    try {
      const task = await taskService.getTask(req.params.id as string);
      res.json(task);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },

  async createTask(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.id || 1;
      const task = await taskService.createTask(req.body, userId);
      res.status(201).json(task);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.id || 1;
      const task = await taskService.updateTask(req.params.id as string, req.body, userId);
      res.json(task);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const result = await taskService.deleteTask(req.params.id as string);
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async getActivities(req: Request, res: Response): Promise<void> {
    try {
      const activities = await taskService.getActivities(req.params.id as string);
      res.json(activities);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },

  async getComments(req: Request, res: Response): Promise<void> {
    try {
      const comments = await taskService.getComments(req.params.taskId as string);
      res.json(comments);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },

  async createComment(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req.user as any)?.id || 1;
      const comment = await taskService.createComment(req.params.taskId as string, req.body, userId);
      res.status(201).json(comment);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const result = await taskService.deleteComment(
        req.params.taskId as string,
        req.params.commentId as string
      );
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async getSubscribers(req: Request, res: Response): Promise<void> {
    try {
      const subscribers = await taskService.getSubscribers(req.params.taskId as string);
      res.json(subscribers);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },

  async addSubscriber(req: Request, res: Response): Promise<void> {
    try {
      const actorUserId = (req.user as any)?.id || 1;
      const subscriber = await taskService.addSubscriber(
        req.params.taskId as string,
        req.body,
        actorUserId
      );
      res.status(201).json(subscriber);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async removeSubscriber(req: Request, res: Response): Promise<void> {
    try {
      const actorUserId = (req.user as any)?.id || 1;
      const result = await taskService.removeSubscriber(
        req.params.taskId as string,
        req.params.userId as string,
        actorUserId
      );
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async getTags(req: Request, res: Response): Promise<void> {
    try {
      const tags = await taskService.getTags();
      res.json(tags);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },

  async createTag(req: Request, res: Response): Promise<void> {
    try {
      const tag = await taskService.createTag(req.body);
      res.status(201).json(tag);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async getTaskTags(req: Request, res: Response): Promise<void> {
    try {
      const tags = await taskService.getTaskTags(req.params.taskId as string);
      res.json(tags);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },

  async addTagToTask(req: Request, res: Response): Promise<void> {
    try {
      const actorUserId = (req.user as any)?.id || 1;
      const result = await taskService.addTagToTask(
        req.params.taskId as string,
        req.body,
        actorUserId
      );
      res.status(201).json(result);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },

  async removeTagFromTask(req: Request, res: Response): Promise<void> {
    try {
      const actorUserId = (req.user as any)?.id || 1;
      const result = await taskService.removeTagFromTask(
        req.params.taskId as string,
        req.params.tagId as string,
        actorUserId
      );
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  },
};

export default adminTaskController;
