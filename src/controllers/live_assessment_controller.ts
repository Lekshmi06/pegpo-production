import { Request, Response } from "express";
import mongoose from "mongoose";
import TuitionLiveAssessment, {
  ILiveAssessmentAnswer,
  ILiveAssessmentQuestion,
} from "../models/TuitionLiveAssessment";
import TuitionHomework from "../models/TuitionHomework";
import LiveClassSession from "../models/LiveClassSession";
import TuitionProgram from "../models/TuitionProgram";

export async function publishAssessment(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      sessionId,
      programId,
      type = "quiz",
      title,
      instructions,
      timeLimitMinutes = 0,
      totalPoints = 100,
      questions = [],
    } = req.body;

    if (!sessionId || !title) {
      return res.status(400).json({
        success: false,
        message: "Missing required assessment parameters: sessionId and title",
      });
    }

    // Resolve canonical programId if not directly supplied
    let resolvedProgramId = programId;
    if (!resolvedProgramId) {
      const liveSession = await LiveClassSession.findById(sessionId);
      if (liveSession?.batchId) {
        resolvedProgramId = liveSession.batchId.toString();
      } else if (liveSession?.tuitionSessionId) {
        resolvedProgramId = liveSession.tuitionSessionId.toString();
      }
    }

    let homeworkId: mongoose.Types.ObjectId | undefined = undefined;

    // If type is assignment and we have a valid program, link to TuitionHomework
    if (type === "assignment" && resolvedProgramId && mongoose.Types.ObjectId.isValid(resolvedProgramId)) {
      try {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7); // Default 7 days

        const homework = await TuitionHomework.create({
          programId: new mongoose.Types.ObjectId(resolvedProgramId),
          assignedBy: new mongoose.Types.ObjectId(user._id),
          teacherName: user.name || "Teacher",
          title,
          description: instructions || `In-meeting assignment from live session ${sessionId}`,
          dueDate,
          attachments: [],
          totalPoints: Number(totalPoints) || 100,
          submissions: [],
        });
        homeworkId = homework._id as mongoose.Types.ObjectId;
      } catch (hwErr) {
        console.warn("[LiveAssessment] Could not auto-create linked TuitionHomework:", hwErr);
      }
    }

    const formattedQuestions: ILiveAssessmentQuestion[] = questions.map((q: any, idx: number) => ({
      id: q.id || `q-${Date.now()}-${idx}`,
      question: q.question,
      options: Array.isArray(q.options) ? q.options : [],
      correctOptionIndex: typeof q.correctOptionIndex === "number" ? q.correctOptionIndex : undefined,
      points: Number(q.points) > 0 ? Number(q.points) : 1,
    }));

    const assessment = await TuitionLiveAssessment.create({
      sessionId: sessionId.toString(),
      programId: resolvedProgramId && mongoose.Types.ObjectId.isValid(resolvedProgramId)
        ? new mongoose.Types.ObjectId(resolvedProgramId)
        : undefined,
      homeworkId,
      type,
      title: title.trim(),
      instructions: instructions?.trim(),
      timeLimitMinutes: Number(timeLimitMinutes) || 0,
      totalPoints: Number(totalPoints) || 100,
      status: "active",
      questions: formattedQuestions,
      submissions: [],
      publishedBy: user._id.toString(),
      publishedByName: user.name || "Teacher",
    });

    return res.status(201).json({
      success: true,
      message: `${type.toUpperCase()} published successfully`,
      assessment,
    });
  } catch (err: any) {
    console.error("[LiveAssessment] publishAssessment error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function submitAssessment(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const assessmentId = req.params.assessmentId as string;
    const { answers = [] } = req.body;

    const assessment = await TuitionLiveAssessment.findById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }

    if (assessment.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "This assessment has been closed by the instructor",
      });
    }

    const studentId = user._id.toString();
    const studentName = user.name || "Student";

    // Auto-grade MCQs
    let calculatedScore = 0;
    let totalPossible = 0;

    const formattedAnswers: ILiveAssessmentAnswer[] = [];

    for (const q of assessment.questions) {
      const qPoints = q.points > 0 ? q.points : 1;
      totalPossible += qPoints;

      const studentAns = (answers as any[]).find((a) => a.questionId === q.id);
      const selIdx = studentAns?.selectedOptionIndex;
      const textAns = studentAns?.textAnswer;

      let isCorrect = false;
      if (typeof q.correctOptionIndex === "number" && q.correctOptionIndex >= 0) {
        if (selIdx === q.correctOptionIndex) {
          calculatedScore += qPoints;
          isCorrect = true;
        }
      } else if (assessment.type === "assignment") {
        // Assignments without predefined answer key default to full completion points until reviewed
        if (textAns || selIdx !== undefined) {
          calculatedScore += qPoints;
        }
      }

      formattedAnswers.push({
        questionId: q.id,
        selectedOptionIndex: selIdx,
        textAnswer: textAns,
      });
    }

    const percentage =
      totalPossible > 0 ? Math.round((calculatedScore / totalPossible) * 100) : 100;

    const submissionRecord = {
      studentId,
      studentName,
      studentRole: user.roles?.[0] || "student",
      answers: formattedAnswers,
      score: calculatedScore,
      totalPossible,
      percentage,
      submittedAt: new Date(),
    };

    // Replace or add submission
    const existingIndex = assessment.submissions.findIndex(
      (s: any) => s.studentId === studentId
    );
    if (existingIndex >= 0) {
      assessment.submissions[existingIndex] = submissionRecord as any;
    } else {
      assessment.submissions.push(submissionRecord as any);
    }

    await assessment.save();

    // If linked to homework, record submission in TuitionHomework as well
    if (assessment.homeworkId) {
      try {
        await TuitionHomework.findByIdAndUpdate(assessment.homeworkId, {
          $push: {
            submissions: {
              studentId: new mongoose.Types.ObjectId(studentId),
              studentName,
              submittedAt: new Date(),
              content: `In-meeting live submission (Score: ${calculatedScore}/${totalPossible})`,
              status: "submitted",
              grade: calculatedScore,
              feedback: `Automated in-class score: ${percentage}%`,
            },
          },
        });
      } catch (hwSubErr) {
        console.warn("[LiveAssessment] Could not sync submission to TuitionHomework:", hwSubErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Assessment submitted and auto-graded successfully",
      submission: submissionRecord,
    });
  } catch (err: any) {
    console.error("[LiveAssessment] submitAssessment error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getSessionAssessments(req: Request, res: Response) {
  try {
    const rawSessionId = req.params.sessionId;
    const sessionId = (Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId) as string;
    const user = (req as any).user;
    const userId = user?._id?.toString();

    const isTeacher = user?.roles?.some((r: string) =>
      ["teacher", "tuition_provider", "institution", "admin", "super_admin"].includes(r)
    );

    // Look up by sessionId directly or by matching programId
    let querySessionIds: string[] = [sessionId];
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      const prog = await TuitionProgram.findOne({ code: sessionId });
      if (prog) {
        querySessionIds.push(prog._id.toString());
      }
    }

    const assessments = await TuitionLiveAssessment.find({
      $or: [
        { sessionId: { $in: querySessionIds } },
        ...(mongoose.Types.ObjectId.isValid(sessionId)
          ? [{ programId: new mongoose.Types.ObjectId(sessionId) }]
          : []),
      ],
    }).sort({ createdAt: -1 });

    // Sanitize answers for students if assessment is active
    const sanitized = assessments.map((doc) => {
      const obj = doc.toObject();
      if (!isTeacher) {
        const mySub = obj.submissions?.find((s: any) => s.studentId === userId);
        if (obj.status === "active" && !mySub) {
          // Hide correct answers from active test/quiz until submitted
          obj.questions = obj.questions.map((q: any) => {
            const { correctOptionIndex, ...rest } = q;
            return rest;
          });
        }
      }
      return obj;
    });

    return res.status(200).json({
      success: true,
      assessments: sanitized,
    });
  } catch (err: any) {
    console.error("[LiveAssessment] getSessionAssessments error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function closeAssessment(req: Request, res: Response) {
  try {
    const rawAssessmentId = req.params.assessmentId;
    const assessmentId = (Array.isArray(rawAssessmentId) ? rawAssessmentId[0] : rawAssessmentId) as string;
    const assessment = await TuitionLiveAssessment.findByIdAndUpdate(
      assessmentId,
      { status: "closed" },
      { new: true }
    );
    if (!assessment) {
      return res.status(404).json({ success: false, message: "Assessment not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Assessment closed",
      assessment,
    });
  } catch (err: any) {
    console.error("[LiveAssessment] closeAssessment error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
