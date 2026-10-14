import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import studentRoutes from "./routes/student_routes";
import teacherRoutes from "./routes/teacher_routes";
import teachingContextRoutes from "./routes/teaching_context_routes";
import lessonPlanRoutes from "./routes/lesson_plan_routes";
import lessonPlanTemplateRoutes from "./routes/lesson_plan_template_routes";
import curriculumRoutes from "./routes/curriculum_routes";
import sourceRoutes from "./routes/source_routes";
import authRoutes from "./routes/auth_routes";
import testRoutes from "./routes/test_routes";
import aiRoutes from "./routes/ai_routes";
import workspaceRoutes from "./routes/workspace_routes";
import competitiveRoutes from "./routes/competitive_exam_routes";


import path from "path";
import assessmentRoutes from "./routes/assessment_routes";
import researcherRoutes from "./routes/researcher_routes";
import researchPaperRoutes from "./routes/research_paper_routes";


import classSectionRoutes from "./routes/class_section_routes";
import teacherTaskRoutes from "./routes/teacher_task_routes";
import teacherMaterialRoutes from "./routes/teacher_material_routes";
import studentRecognitionRoutes from "./routes/student_recognition_routes";
import courseRoutes from "./routes/course_routes";
import learnerCourseRoutes from "./routes/learner_course_routes";
import institutionRoutes from "./routes/institution_routes";
import ssoRoutes from "./routes/sso_routes";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Content-Security-Policy: restrict iframe embedding strictly to verified School and College ERP origins
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' http://localhost:3001 http://localhost:3002 http://localhost:5173"
  );
  next();
});

app.use("/uploads", express.static(path.resolve("uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/sso", ssoRoutes);
app.use("/api/institutions", institutionRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/learner", learnerCourseRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/researchers", researcherRoutes);
app.use("/api/researcher", researcherRoutes);
app.use("/api/research", researchPaperRoutes);
app.use("/api/teaching-contexts", teachingContextRoutes);
app.use("/api/class-sections", classSectionRoutes);
app.use("/api/student-recognition", studentRecognitionRoutes);
app.use("/api/student-recognitions", studentRecognitionRoutes);
app.use("/api/teacher-tasks", teacherTaskRoutes);
app.use("/api/curriculums", curriculumRoutes);
app.use("/api/lesson-plans", lessonPlanRoutes);
app.use("/api/lesson-plan-templates", lessonPlanTemplateRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/teacher/materials", teacherMaterialRoutes);
app.use("/api/materials", teacherMaterialRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/competitive", competitiveRoutes);
app.use("/api", sourceRoutes);

import mongoose from "mongoose";

app.get("/api/health", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.json({
    success: true,
    server: "running",
    database: isDbConnected ? "connected" : "disconnected",
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "EduPay backend is running!",
  });
});

import { validateSSOConfigurationOnStartup } from "./services/sso_service";

const startServer = async (): Promise<void> => {
  validateSSOConfigurationOnStartup();
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

export { app, startServer };
export default app;

const isDirectRun =
  Boolean(process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js")));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  startServer();
}