import { Router } from "express";
import researchUpload from "../config/research_upload";
import {
  searchPapersController,
  savePaperController,
  getLibraryPapersController,
  getPaperByIdController,
  toggleStarPaperController,
  uploadPaperPdfController,
  addPaperToProjectController,
  listProjectsController,
  getProjectByIdController,
  createProjectController,
  removePaperFromProjectController,
  getProjectNotesController,
  createProjectNoteController,
  updateProjectNoteController,
  deleteProjectNoteController,
  comparePapersController,
  getAllNotesController,
  queryResearchAIController,
} from "../controllers/research_paper_controller";
import {
  createManuscriptController,
  listManuscriptsController,
  getManuscriptByIdController,
  updateManuscriptController,
  deleteManuscriptController,
  createSectionController,
  getSectionsController,
  updateSectionController,
  deleteSectionController,
  reorderSectionsController,
  manuscriptAiAssistController,
} from "../controllers/manuscript_controller";
import {
  inviteCollaboratorController,
  getIncomingInvitationsController,
  getOutgoingInvitationsController,
  respondToInvitationController,
  revokeInvitationController,
  getProjectCollaboratorsController,
  getProjectRoleController,
  removeCollaboratorController,
  updateCollaboratorRoleController,
  getCollaborativeProjectsController,
  addManuscriptCommentController,
  getManuscriptCommentsController,
  resolveCommentController,
  replyToCommentController,
} from "../controllers/collaboration_controller";
import {
  createTaskController,
  listProjectTasksController,
  getTaskByIdController,
  updateTaskController,
  updateTaskStatusController,
  updateTaskAssigneeController,
  deleteTaskController,
  getProjectTaskSummaryController,
} from "../controllers/research_task_controller";
import {
  createCalendarEventController,
  getProjectCalendarDataController,
  getProjectEventsController,
  getAllProjectsCalendarController,
  getCalendarEventByIdController,
  updateCalendarEventController,
  deleteCalendarEventController,
} from "../controllers/research_calendar_controller";
import {
  getResearchFoldersController,
  createResearchFolderController,
  getResearchFolderByIdController,
  updateResearchFolderController,
  deleteResearchFolderController,
} from "../controllers/research_folder_controller";
import {
  uploadResearchDocumentController,
  getResearchDocumentsController,
  getResearchDocumentByIdController,
  updateResearchDocumentController,
  deleteResearchDocumentController,
} from "../controllers/research_document_controller";

const router = Router();

// Academic Literature Discovery
router.get("/discover", searchPapersController);

// Library Management
router.post("/papers/save", savePaperController);
router.get("/papers", getLibraryPapersController);
router.post("/papers/compare", comparePapersController);
router.get("/papers/:id", getPaperByIdController);
router.patch("/papers/:id/star", toggleStarPaperController);
router.post("/papers/upload", researchUpload.single("file"), uploadPaperPdfController);
router.post("/papers/:id/project", addPaperToProjectController);

// Research Projects
router.get("/projects", listProjectsController);
router.post("/projects", createProjectController);
router.get("/projects/:id", getProjectByIdController);
router.delete("/projects/:id/papers/:paperId", removePaperFromProjectController);

// Project Research Notes & Hypotheses
router.get("/notes", getAllNotesController);
router.get("/projects/:id/notes", getProjectNotesController);
router.post("/projects/:id/notes", createProjectNoteController);
router.put("/notes/:noteId", updateProjectNoteController);
router.delete("/notes/:noteId", deleteProjectNoteController);

// Single Unified Research AI Query Gateway
router.post("/ai/query", queryResearchAIController);

// Research Manuscripts & Structured Writing
router.post("/manuscripts", createManuscriptController);
router.get("/manuscripts", listManuscriptsController);
router.get("/manuscripts/:id", getManuscriptByIdController);
router.put("/manuscripts/:id", updateManuscriptController);
router.delete("/manuscripts/:id", deleteManuscriptController);

// Manuscript Sections & Ordering
router.post("/manuscripts/:id/sections", createSectionController);
router.get("/manuscripts/:id/sections", getSectionsController);
router.put("/manuscript-sections/:sectionId", updateSectionController);
router.delete("/manuscript-sections/:sectionId", deleteSectionController);
router.put("/manuscripts/:id/sections/reorder", reorderSectionsController);

// Manuscript AI Writing Assistance
router.post("/manuscripts/:id/ai-assist", manuscriptAiAssistController);

// Peer Collaboration & Co-Authoring
router.post("/collaboration/invite", inviteCollaboratorController);
router.get("/collaboration/invitations/incoming", getIncomingInvitationsController);
router.get("/collaboration/invitations/outgoing", getOutgoingInvitationsController);
router.post("/collaboration/invitations/:id/respond", respondToInvitationController);
router.post("/collaboration/invitations/:id/revoke", revokeInvitationController);
router.get("/collaboration/projects/:projectId/collaborators", getProjectCollaboratorsController);
router.get("/collaboration/projects/:projectId/role", getProjectRoleController);
router.delete("/collaboration/projects/:projectId/collaborators/:researcherId", removeCollaboratorController);
router.patch("/collaboration/projects/:projectId/collaborators/:researcherId", updateCollaboratorRoleController);
router.get("/collaboration/projects", getCollaborativeProjectsController);

// Collaborative Annotations & Peer Review Discussion Threads
router.post("/collaboration/comments", addManuscriptCommentController);
router.get("/collaboration/comments", getManuscriptCommentsController);
router.post("/collaboration/comments/:id/resolve", resolveCommentController);
router.post("/collaboration/comments/:id/reply", replyToCommentController);

// Project-Scoped Academic Research Kanban & Tasks
router.post("/projects/:projectId/tasks", createTaskController);
router.get("/projects/:projectId/tasks", listProjectTasksController);
router.get("/projects/:projectId/tasks/summary", getProjectTaskSummaryController);
router.get("/tasks/:taskId", getTaskByIdController);
router.put("/tasks/:taskId", updateTaskController);
router.delete("/tasks/:taskId", deleteTaskController);
router.patch("/tasks/:taskId/status", updateTaskStatusController);
router.patch("/tasks/:taskId/assignee", updateTaskAssigneeController);

// Academic Research Calendar & Timeline (Milestones, Meetings, Deadlines & Task Dates)
router.post("/projects/:projectId/calendar/events", createCalendarEventController);
router.get("/projects/:projectId/calendar/events", getProjectEventsController);
router.get("/projects/:projectId/calendar", getProjectCalendarDataController);
router.get("/calendar/all", getAllProjectsCalendarController);
router.get("/calendar/events/:eventId", getCalendarEventByIdController);
router.put("/calendar/events/:eventId", updateCalendarEventController);
router.delete("/calendar/events/:eventId", deleteCalendarEventController);

// User-Specific Research Folders
router.get("/folders", getResearchFoldersController);
router.post("/folders", createResearchFolderController);
router.get("/folders/:id", getResearchFolderByIdController);
router.put("/folders/:id", updateResearchFolderController);
router.delete("/folders/:id", deleteResearchFolderController);

// User-Specific Research Documents & Uploads
router.get("/documents", getResearchDocumentsController);
router.post("/documents/upload", researchUpload.single("file"), uploadResearchDocumentController);
router.get("/documents/:id", getResearchDocumentByIdController);
router.patch("/documents/:id", updateResearchDocumentController);
router.delete("/documents/:id", deleteResearchDocumentController);

export default router;



