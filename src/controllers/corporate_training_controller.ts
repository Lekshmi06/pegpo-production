import { Request, Response } from "express";
import * as corporateService from "../services/corporate_training_service";

const getParam = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
};

// ==========================================
// 1. DASHBOARD & METRICS
// ==========================================

export async function getCompanyDashboard(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const data = await corporateService.getCorporateDashboardMetrics(institutionId);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch corporate dashboard metrics.",
    });
  }
}

// ==========================================
// 2. DEPARTMENTS & TEAMS
// ==========================================

export async function getDepartments(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const departments = await corporateService.getDepartments(institutionId);

    res.json({
      success: true,
      data: departments,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch departments.",
    });
  }
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const { name, description, headId, teams } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ success: false, message: "Department name is required." });
      return;
    }

    const dept = await corporateService.createDepartment(institutionId, {
      name,
      description,
      headId,
      teams,
    });

    res.status(201).json({
      success: true,
      message: "Department created successfully.",
      data: dept,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create department.",
    });
  }
}

export async function updateDepartment(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const deptId = getParam(req.params.departmentId);

    if (!deptId) {
      res.status(400).json({ success: false, message: "Department ID is required." });
      return;
    }

    const dept = await corporateService.updateDepartment(institutionId, deptId, req.body);

    res.json({
      success: true,
      message: "Department updated successfully.",
      data: dept,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update department.",
    });
  }
}

export async function deleteDepartment(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const deptId = getParam(req.params.departmentId);

    if (!deptId) {
      res.status(400).json({ success: false, message: "Department ID is required." });
      return;
    }

    const result = await corporateService.deleteDepartment(institutionId, deptId);
    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to delete department.",
    });
  }
}

// ==========================================
// 3. TRAINING PROGRAMS
// ==========================================

export async function getTrainingPrograms(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const programs = await corporateService.getTrainingPrograms(institutionId, {
      status,
      category,
      search,
    });

    res.json({
      success: true,
      data: programs,
      total: programs.length,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch training programs.",
    });
  }
}

export async function getTrainingProgram(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const programId = getParam(req.params.programId);

    if (!programId) {
      res.status(400).json({ success: false, message: "Program ID is required." });
      return;
    }

    const program = await corporateService.getTrainingProgramById(institutionId, programId);
    res.json({
      success: true,
      data: program,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch training program.",
    });
  }
}

export async function createTrainingProgram(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const {
      title,
      description,
      category,
      courses,
      assignedEmployees,
      assignedDepartments,
      dueDate,
      estimatedDurationHours,
      status,
    } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ success: false, message: "Program title is required." });
      return;
    }

    const program = await corporateService.createTrainingProgram(
      institutionId,
      req.user._id.toString(),
      {
        title,
        description,
        category,
        courses: Array.isArray(courses) ? courses : [],
        assignedEmployees,
        assignedDepartments,
        dueDate,
        estimatedDurationHours,
        status,
      }
    );

    res.status(201).json({
      success: true,
      message: "Training program created successfully.",
      data: program,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create training program.",
    });
  }
}

export async function updateTrainingProgram(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const programId = getParam(req.params.programId);

    if (!programId) {
      res.status(400).json({ success: false, message: "Program ID is required." });
      return;
    }

    const updated = await corporateService.updateTrainingProgram(
      institutionId,
      programId,
      req.body
    );

    res.json({
      success: true,
      message: "Training program updated successfully.",
      data: updated,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update training program.",
    });
  }
}

export async function deleteTrainingProgram(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const programId = getParam(req.params.programId);

    if (!programId) {
      res.status(400).json({ success: false, message: "Program ID is required." });
      return;
    }

    const result = await corporateService.deleteTrainingProgram(institutionId, programId);
    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to delete training program.",
    });
  }
}

export async function assignProgram(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const programId = getParam(req.params.programId);
    const { employeeIds, departments } = req.body;

    if (!programId) {
      res.status(400).json({ success: false, message: "Program ID is required." });
      return;
    }

    const result = await corporateService.assignProgram(
      institutionId,
      programId,
      Array.isArray(employeeIds) ? employeeIds : [],
      Array.isArray(departments) ? departments : []
    );

    res.json({
      success: true,
      message: `Training program assigned to ${result.assignedCount} employees.`,
      data: result.program,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to assign training program.",
    });
  }
}

// ==========================================
// 4. EMPLOYEE TRAINING PROGRESS
// ==========================================

export async function getEmployeeProgress(req: Request, res: Response): Promise<void> {
  try {
    const institutionId = getParam(req.params.id) || req.institutionId || "";
    const employeeUserId = getParam(req.params.userId);

    if (!employeeUserId) {
      res.status(400).json({ success: false, message: "Employee user ID is required." });
      return;
    }

    // Trainees can only view their own progress unless caller is staff (admin/subadmin/trainer)
    if (
      req.institutionMembership?.role === "trainee" &&
      req.user?._id.toString() !== employeeUserId
    ) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You may only view your own training progress.",
      });
      return;
    }

    const progress = await corporateService.getEmployeeTrainingProgress(
      institutionId,
      employeeUserId
    );

    res.json({
      success: true,
      data: progress,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch employee training progress.",
    });
  }
}
