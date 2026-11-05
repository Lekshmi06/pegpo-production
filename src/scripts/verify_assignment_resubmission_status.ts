import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Request, Response } from "express";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import User from "../models/User";
import TeacherProfile from "../models/TeacherProfile";
import StudentProfile from "../models/StudentProfile";
import ClassSection from "../models/ClassSection";
import StudentMembership from "../models/StudentMembership";
import Assignment from "../models/Assignment";
import AssignmentSubmission from "../models/AssignmentSubmission";
import AssignmentService from "../services/assignment_service";
import {
  submitAssignmentController,
  handleControllerError,
} from "../controllers/assignment_controller";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
  }
}

/**
 * Creates a mock Express Response object to capture HTTP status codes and JSON payloads.
 */
function createMockResponse(): {
  res: Response;
  getStatus: () => number;
  getBody: () => any;
} {
  let statusCode = 200;
  let responseBody: any = null;

  const mockRes = {
    status(code: number) {
      statusCode = code;
      return mockRes;
    },
    json(body: any) {
      responseBody = body;
      return mockRes;
    },
  } as unknown as Response;

  return {
    res: mockRes,
    getStatus: () => statusCode,
    getBody: () => responseBody,
  };
}

async function runAssignmentResubmissionVerification() {
  console.log("===============================================================");
  console.log("ASSIGNMENT RESUBMISSION HTTP STATUS (STEP 4) VERIFICATION");
  console.log("===============================================================\n");

  // ==========================================================================
  // SECTION 1: UNIT-LEVEL ERROR MAPPING VERIFICATION
  // ==========================================================================
  console.log("--- Section 1: Controller Error-Handling Unit Tests ---");

  // Test 1: Evaluated resubmission error maps to HTTP 409
  {
    const mock = createMockResponse();
    const evaluatedError = new Error(
      "This submission has already been evaluated and graded. Resubmissions are not permitted."
    );
    handleControllerError(mock.res, evaluatedError, "Failed to submit assignment.");

    assert(mock.getStatus() === 409, "Evaluated resubmission error returns HTTP 409 Conflict");
    assert(
      mock.getBody()?.success === false,
      "Response payload contains success: false"
    );
    assert(
      mock.getBody()?.message ===
        "This submission has already been evaluated and graded. Resubmissions are not permitted.",
      "Response payload strictly preserves the domain error message"
    );
  }

  // Test 2: Unrelated unexpected error returns HTTP 500
  {
    const mock = createMockResponse();
    const unexpectedError = new Error("Database cluster connection dropped abruptly.");
    handleControllerError(mock.res, unexpectedError, "Failed to submit assignment.");

    assert(mock.getStatus() === 500, "Unrelated internal error returns HTTP 500");
    assert(mock.getBody()?.success === false, "500 error returns success: false");
    assert(
      mock.getBody()?.message === "A server error occurred while processing your request.",
      "500 error sanitizes error details to prevent internal stack leak"
    );
  }

  // Test 3: Standard 404, 403, and 400 errors remain mapped correctly
  {
    const notFoundMock = createMockResponse();
    handleControllerError(notFoundMock.res, new Error("Assignment not found."));
    assert(notFoundMock.getStatus() === 404, "Not found error returns HTTP 404");

    const forbiddenMock = createMockResponse();
    handleControllerError(forbiddenMock.res, new Error("Access denied: You are not enrolled."));
    assert(forbiddenMock.getStatus() === 403, "Access denied error returns HTTP 403");

    const badRequestMock = createMockResponse();
    handleControllerError(badRequestMock.res, new Error("Assignment title is required."));
    assert(badRequestMock.getStatus() === 400, "Validation error returns HTTP 400");
  }

  // ==========================================================================
  // SECTION 2: CONTROLLER DISPATCH TESTS (MOCK SERVICE CALLS)
  // ==========================================================================
  console.log("\n--- Section 2: Controller Dispatch Tests ---");

  const originalSubmit = AssignmentService.submitAssignment;

  try {
    const dummyStudent = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      name: "Test Student",
    };

    // Test 4: submitAssignmentController returns 409 when service rejects evaluated submission
    {
      AssignmentService.submitAssignment = async () => {
        throw new Error(
          "This submission has already been evaluated and graded. Resubmissions are not permitted."
        );
      };

      const mock = createMockResponse();
      const mockReq = {
        user: { userType: "student" },
        studentProfile: dummyStudent,
        params: { id: new mongoose.Types.ObjectId().toHexString() },
        body: { content: "Resubmission attempt" },
      } as unknown as Request;

      await submitAssignmentController(mockReq, mock.res);

      assert(mock.getStatus() === 409, "Controller returns HTTP 409 on evaluated resubmission");
      assert(
        mock.getBody()?.message ===
          "This submission has already been evaluated and graded. Resubmissions are not permitted.",
        "Controller response contains exact rejection message"
      );
    }

    // Test 5: submitAssignmentController returns 201 on normal submission
    {
      const dummySubmission = {
        _id: new mongoose.Types.ObjectId(),
        status: "submitted",
        isLate: false,
      };

      AssignmentService.submitAssignment = async () => dummySubmission as any;

      const mock = createMockResponse();
      const mockReq = {
        user: { userType: "student" },
        studentProfile: dummyStudent,
        params: { id: new mongoose.Types.ObjectId().toHexString() },
        body: { content: "Initial valid submission" },
      } as unknown as Request;

      await submitAssignmentController(mockReq, mock.res);

      assert(mock.getStatus() === 201, "Normal eligible submission returns HTTP 201");
      assert(mock.getBody()?.success === true, "Normal submission returns success: true");
    }

    // Test 6: submitAssignmentController returns 200 on draft submission
    {
      const dummyDraft = {
        _id: new mongoose.Types.ObjectId(),
        status: "draft",
        isLate: false,
      };

      AssignmentService.submitAssignment = async () => dummyDraft as any;

      const mock = createMockResponse();
      const mockReq = {
        user: { userType: "student" },
        studentProfile: dummyStudent,
        params: { id: new mongoose.Types.ObjectId().toHexString() },
        body: { content: "Draft in progress", isDraft: true },
      } as unknown as Request;

      await submitAssignmentController(mockReq, mock.res);

      assert(mock.getStatus() === 200, "Draft submission returns HTTP 200");
    }

    // Test 7: submitAssignmentController returns 500 on unexpected service exception
    {
      AssignmentService.submitAssignment = async () => {
        throw new Error("Unexpected database fault: socket closed");
      };

      const mock = createMockResponse();
      const mockReq = {
        user: { userType: "student" },
        studentProfile: dummyStudent,
        params: { id: new mongoose.Types.ObjectId().toHexString() },
        body: { content: "Payload" },
      } as unknown as Request;

      await submitAssignmentController(mockReq, mock.res);

      assert(mock.getStatus() === 500, "Unexpected service exception returns HTTP 500");
      assert(
        mock.getBody()?.message === "A server error occurred while processing your request.",
        "Error message is masked to prevent internal stack leak"
      );
    }
  } finally {
    AssignmentService.submitAssignment = originalSubmit;
  }

  // ==========================================================================
  // SECTION 3: REAL DATABASE INTEGRATION & END-TO-END FLOW
  // ==========================================================================
  console.log("\n--- Section 3: Real Database End-to-End Assignment Resubmission Flow ---");

  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) {
    console.warn("MONGODB_URI not configured; skipping Section 3 real DB integration.");
  } else {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB for real database integration testing.\n");

    const cleanupIds = {
      users: [] as mongoose.Types.ObjectId[],
      teachers: [] as mongoose.Types.ObjectId[],
      students: [] as mongoose.Types.ObjectId[],
      sections: [] as mongoose.Types.ObjectId[],
      memberships: [] as mongoose.Types.ObjectId[],
      assignments: [] as mongoose.Types.ObjectId[],
      submissions: [] as mongoose.Types.ObjectId[],
    };

    try {
      const ts = Date.now();

      // 1. Setup Teacher User and Profile
      const teacherUser = (await User.create({
        email: `teacher_resub_${ts}@edupye.test`,
        password: "hashedpassword123",
        role: "teacher",
        userType: "teacher",
        status: "active",
      } as any)) as any;
      cleanupIds.users.push(teacherUser._id);

      const teacherProfile = (await TeacherProfile.create({
        userId: teacherUser._id,
        name: "Professor Resubmission Test",
        department: "Computer Science",
      } as any)) as any;
      cleanupIds.teachers.push(teacherProfile._id);

      // 2. Setup Student User and Profile
      const studentUser = (await User.create({
        email: `student_resub_${ts}@edupye.test`,
        password: "hashedpassword123",
        role: "student",
        userType: "student",
        status: "active",
      } as any)) as any;
      cleanupIds.users.push(studentUser._id);

      const studentProfile = (await StudentProfile.create({
        userId: studentUser._id,
        name: "Student Resubmission Tester",
        enrollmentNumber: `EN_${ts}`,
      } as any)) as any;
      cleanupIds.students.push(studentProfile._id);

      // 3. Setup Class Section & Enrollment
      const classSection = (await ClassSection.create({
        name: `CS-Section-${ts}`,
        classLevel: "10",
        section: "A",
        board: "CBSE",
        academicYear: "2026-2027",
        type: "institution",
        isActive: true,
      } as any)) as any;
      cleanupIds.sections.push(classSection._id);

      const membership = (await StudentMembership.create({
        studentProfileId: studentProfile._id,
        classSectionId: classSection._id,
        status: "active",
      } as any)) as any;
      cleanupIds.memberships.push(membership._id);

      // 4. Create Published Assignment
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future
      const assignment = (await Assignment.create({
        teacherId: teacherProfile._id,
        teacherName: teacherProfile.name,
        classSectionId: classSection._id,
        title: "Algorithms Analysis Assignment",
        subject: "Computer Science",
        description: "Analyze Big-O runtime complexity of sorting algorithms.",
        type: "assignment",
        targetType: "all",
        dueDate,
        dueTime: "23:59",
        totalMarks: 100,
        passingMarks: 40,
        status: "published",
        allowLateSubmission: true,
        publishedAt: new Date(),
        attachments: [],
      } as any)) as any;
      cleanupIds.assignments.push(assignment._id);

      // 5. Test Step A: Student submits for the first time via submitAssignmentController
      {
        const mock = createMockResponse();
        const mockReq = {
          user: { userType: "student" },
          studentProfile,
          params: { id: assignment._id.toHexString() },
          body: {
            content: "Initial analysis of QuickSort vs MergeSort",
            isDraft: false,
          },
        } as unknown as Request;

        await submitAssignmentController(mockReq, mock.res);

        assert(mock.getStatus() === 201, "First-time submission via controller returns HTTP 201");
        assert(mock.getBody()?.success === true, "First-time submission body success is true");
        assert(
          mock.getBody()?.data?.status === "submitted",
          "Initial submission status is 'submitted'"
        );

        cleanupIds.submissions.push(mock.getBody()?.data?._id);
      }

      // 6. Test Step B: Student resubmits while non-evaluated -> Allowed and succeeds with 201
      {
        const mock = createMockResponse();
        const mockReq = {
          user: { userType: "student" },
          studentProfile,
          params: { id: assignment._id.toHexString() },
          body: {
            content: "Updated analysis including TimSort comparisons",
            isDraft: false,
            comment: "Adding TimSort details",
          },
        } as unknown as Request;

        await submitAssignmentController(mockReq, mock.res);

        assert(
          mock.getStatus() === 201,
          "Allowed resubmission of non-evaluated submission returns HTTP 201"
        );
        const sub = await AssignmentSubmission.findOne({
          assignmentId: assignment._id,
          studentProfileId: studentProfile._id,
        });
        assert(
          Boolean(sub?.submissionHistory && sub.submissionHistory.length >= 1),
          "Prior submission attempt is archived in submissionHistory"
        );
      }

      // 7. Test Step C: Teacher evaluates and grades the submission
      {
        const subBefore = await AssignmentSubmission.findOne({
          assignmentId: assignment._id,
          studentProfileId: studentProfile._id,
        });
        assert(!!subBefore, "Submission exists in database prior to evaluation");

        await AssignmentService.evaluateSubmission(
          teacherProfile,
          assignment._id.toHexString(),
          subBefore!._id.toHexString(),
          {
            marksAwarded: 88,
            feedback: "Excellent complexity analysis and empirical comparison.",
          }
        );

        const evaluatedSub = await AssignmentSubmission.findById(subBefore!._id);
        assert(
          evaluatedSub?.status === "evaluated",
          "Submission status transitioned to 'evaluated'"
        );
        assert(
          evaluatedSub?.evaluation?.marksAwarded === 88,
          "Marks awarded are recorded accurately"
        );
      }

      // 8. Test Step D: Student attempts to resubmit evaluated submission -> Controller MUST return HTTP 409
      {
        const mock = createMockResponse();
        const mockReq = {
          user: { userType: "student" },
          studentProfile,
          params: { id: assignment._id.toHexString() },
          body: {
            content: "Unauthorized attempt to overwrite evaluated submission",
            isDraft: false,
          },
        } as unknown as Request;

        await submitAssignmentController(mockReq, mock.res);

        assert(
          mock.getStatus() === 409,
          "Resubmitting evaluated submission returns HTTP 409 Conflict"
        );
        assert(
          mock.getBody()?.success === false,
          "Evaluated resubmission rejection has success: false"
        );
        assert(
          mock.getBody()?.message ===
            "This submission has already been evaluated and graded. Resubmissions are not permitted.",
          "Evaluated resubmission error message matches business specification"
        );
      }

      // 9. Test Step E: Database integrity check - evaluated data remains intact
      {
        const finalSub = await AssignmentSubmission.findOne({
          assignmentId: assignment._id,
          studentProfileId: studentProfile._id,
        });
        assert(
          finalSub?.status === "evaluated",
          "Evaluated submission in DB was not overwritten or corrupted"
        );
        assert(
          finalSub?.evaluation?.marksAwarded === 88,
          "Original marks (88) preserved after rejected resubmission"
        );
      }
    } finally {
      // Clean up all created test documents
      await AssignmentSubmission.deleteMany({ _id: { $in: cleanupIds.submissions } });
      await Assignment.deleteMany({ _id: { $in: cleanupIds.assignments } });
      await StudentMembership.deleteMany({ _id: { $in: cleanupIds.memberships } });
      await ClassSection.deleteMany({ _id: { $in: cleanupIds.sections } });
      await StudentProfile.deleteMany({ _id: { $in: cleanupIds.students } });
      await TeacherProfile.deleteMany({ _id: { $in: cleanupIds.teachers } });
      await User.deleteMany({ _id: { $in: cleanupIds.users } });
      await mongoose.disconnect();
      console.log("\nCleaned up all test artifacts from database and disconnected.");
    }
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log("\n===============================================================");
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log("===============================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAssignmentResubmissionVerification().catch((err) => {
  console.error("Unhandled error during verification:", err);
  process.exit(1);
});
