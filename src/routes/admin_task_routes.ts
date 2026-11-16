import { Router } from "express";
import adminTaskController from "../controllers/admin_task_controller";
import { requireAdminAuth } from "../middlewares/admin_module_middleware";

const router = Router();

// Root-level task endpoints (when mounted at /api/tasks)
router.get("/", adminTaskController.getTasks);
router.post("/", requireAdminAuth, adminTaskController.createTask);
router.get("/:id", adminTaskController.getTask);
router.patch("/:id", requireAdminAuth, adminTaskController.updateTask);
router.delete("/:id", requireAdminAuth, adminTaskController.deleteTask);
router.get("/:id/activities", adminTaskController.getActivities);
router.get("/:taskId/comments", adminTaskController.getComments);
router.post("/:taskId/comments", requireAdminAuth, adminTaskController.createComment);
router.delete("/:taskId/comments/:commentId", requireAdminAuth, adminTaskController.deleteComment);
router.get("/:taskId/subscribers", adminTaskController.getSubscribers);
router.post("/:taskId/subscribers", requireAdminAuth, adminTaskController.addSubscriber);
router.delete("/:taskId/subscribers/:userId", requireAdminAuth, adminTaskController.removeSubscriber);
router.get("/:taskId/tags", adminTaskController.getTaskTags);
router.post("/:taskId/tags", requireAdminAuth, adminTaskController.addTagToTask);
router.delete("/:taskId/tags/:tagId", requireAdminAuth, adminTaskController.removeTagFromTask);

// Taskmite nested endpoints (when mounted at /api/taskmite or legacy /tasks)
router.get("/tasks", adminTaskController.getTasks);
router.get("/tasks/:id", adminTaskController.getTask);
router.get("/tasks/:id/activities", adminTaskController.getActivities);
router.get("/tasks/:taskId/comments", adminTaskController.getComments);
router.get("/tasks/:taskId/subscribers", adminTaskController.getSubscribers);
router.get("/tasks/:taskId/tags", adminTaskController.getTaskTags);

router.post("/tasks", requireAdminAuth, adminTaskController.createTask);
router.patch("/tasks/:id", requireAdminAuth, adminTaskController.updateTask);
router.delete("/tasks/:id", requireAdminAuth, adminTaskController.deleteTask);

router.post("/tasks/:taskId/comments", requireAdminAuth, adminTaskController.createComment);
router.delete("/tasks/:taskId/comments/:commentId", requireAdminAuth, adminTaskController.deleteComment);

router.post("/tasks/:taskId/subscribers", requireAdminAuth, adminTaskController.addSubscriber);
router.delete("/tasks/:taskId/subscribers/:userId", requireAdminAuth, adminTaskController.removeSubscriber);

router.get("/tags", adminTaskController.getTags);
router.post("/tags", requireAdminAuth, adminTaskController.createTag);
router.post("/tasks/:taskId/tags", requireAdminAuth, adminTaskController.addTagToTask);
router.delete("/tasks/:taskId/tags/:tagId", requireAdminAuth, adminTaskController.removeTagFromTask);

export default router;

