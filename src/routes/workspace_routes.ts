import { Router } from "express";
import {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
} from "../controllers/workspace_controller";
import { authenticateStudent } from "../middlewares/auth_middleware";

const router = Router();

// Apply student authentication (supports Bearer token, x-user-id, x-student-profile-id, and dev fallback)
router.use(authenticateStudent);

// Notes Routes
router.get("/notes", getNotes);
router.get("/notes/:id", getNoteById);
router.post("/notes", createNote);
router.put("/notes/:id", updateNote);
router.delete("/notes/:id", deleteNote);

// Folders Routes
router.get("/folders", getFolders);
router.post("/folders", createFolder);
router.put("/folders/:id", updateFolder);
router.delete("/folders/:id", deleteFolder);

// Calendar Routes
router.get("/calendar", getCalendarEvents);
router.post("/calendar", createCalendarEvent);
router.put("/calendar/:id", updateCalendarEvent);
router.delete("/calendar/:id", deleteCalendarEvent);

// Projects Routes
router.get("/projects", getProjects);
router.post("/projects", createProject);
router.put("/projects/:id", updateProject);
router.delete("/projects/:id", deleteProject);

export default router;
