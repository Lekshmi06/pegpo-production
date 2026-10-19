import mongoose from "mongoose";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import TestAttempt from "../models/TestAttempt";
import Enrollment from "../models/Enrollment";
import Note from "../models/Note";
import CalendarEvent from "../models/CalendarEvent";
import StudySession from "../models/StudySession";

export interface IStudentAnalyticsResponse {
  student: {
    name: string;
    email: string;
    avatar?: string;
    learningPath: string;
    gradeOrLevel: string;
    institution: string;
  };
  summaryCards: {
    studyTimeThisWeek: {
      totalMinutes: number;
      formatted: string;
      previousWeekMinutes: number;
      percentageChange: number | null;
      hasActivity: boolean;
      measurementNotice: string;
    };
    learningMaterialsCompleted: {
      total: number;
      lessonsCompleted: number;
      quizzesCompleted: number;
      hasActivity: boolean;
    };
    quizAverage: {
      averagePercentage: number | null;
      formatted: string;
      totalQuizzesTaken: number;
      hasActivity: boolean;
    };
    currentStudyStreak: {
      days: number;
      bestStreakDays: number;
      hasActivity: boolean;
      lastActiveDate: string | null;
    };
  };
  weeklyStudyActivity: {
    dayLabel: string;
    date: string;
    studyMinutes: number;
    quizMinutes: number;
    totalMinutes: number;
  }[];
  subjectProgress: {
    subject: string;
    masteryPercentage: number;
    completedItems: number;
    totalItems: number;
    color: string;
  }[];
  recentAssessments: {
    id: string;
    title: string;
    subject: string;
    score: number;
    maxScore: number;
    percentage: number;
    accuracy: number;
    completedAt: string;
  }[];
  recentActivity: {
    id: string;
    title: string;
    type: "note" | "quiz" | "course" | "session";
    timestamp: string;
    destinationPath: string;
  }[];
  upcomingTasks: {
    id: string;
    title: string;
    dueDate: string;
    time?: string;
    eventType: string;
    isOverdue: boolean;
  }[];
  continueLearning: {
    courseId: string;
    title: string;
    thumbnail?: string;
    progressPercentage: number;
    completedLessons: number;
    totalLessons: number;
    lastAccessedLessonTitle?: string;
    destinationPath: string;
  }[];
  aiStudyRecommendations: {
    id: string;
    type: "review" | "streak" | "continue_course" | "practice";
    title: string;
    description: string;
    actionLabel: string;
    actionPath: string;
    priority: "high" | "medium" | "low";
  }[];
}

const SUBJECT_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

export async function getStudentAnalyticsData(
  userId: string,
  studentProfileId?: string
): Promise<IStudentAnalyticsResponse> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // 1. Resolve User and Profile
  const user = await User.findById(userObjectId).lean();
  let studentProfile: any = null;
  if (studentProfileId && mongoose.Types.ObjectId.isValid(studentProfileId)) {
    studentProfile = await StudentProfile.findById(studentProfileId).lean();
  }
  if (!studentProfile) {
    studentProfile = await StudentProfile.findOne({ userId: userObjectId }).lean();
  }

  const studentName =
    studentProfile?.name ||
    user?.name ||
    user?.email?.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ||
    "Student";

  const studentInfo = {
    name: studentName,
    email: user?.email || "",
    avatar: studentProfile?.avatar || (user as any)?.avatar || "",
    learningPath: studentProfile?.learningPath || "School Curriculum",
    gradeOrLevel:
      studentProfile?.schoolDetails?.classLevel ||
      studentProfile?.education?.classLevel ||
      studentProfile?.undergraduateDetails?.degree ||
      studentProfile?.competitiveExamDetails?.targetExam ||
      "Class 10",
    institution:
      studentProfile?.schoolDetails?.schoolName ||
      studentProfile?.education?.institution ||
      "EduPye Academy",
  };

  // 2. Dates setup for Weekly Activity (Current 7 Days window: Monday to Sunday or past 7 days)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday
  const distanceToMonday = (dayOfWeek + 6) % 7;
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - distanceToMonday);
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
  const endOfLastWeek = new Date(startOfThisWeek);
  endOfLastWeek.setMilliseconds(-1);

  // 3. Fetch Test Attempts (Completed)
  const testAttempts = await TestAttempt.find({
    userId: userObjectId,
    status: "completed",
  })
    .sort({ completedAt: -1 })
    .lean();

  // 4. Fetch Study Sessions
  const studySessions = await StudySession.find({
    userId: userObjectId,
  })
    .sort({ startedAt: -1 })
    .lean();

  // 5. Fetch Enrollments with populated courses
  const enrollments = await Enrollment.find({
    learner: userObjectId,
  })
    .populate("course")
    .lean();

  // 6. Fetch Recent Notes
  const notes = await Note.find({
    userId: userObjectId,
  })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();

  // 7. Fetch Upcoming Calendar Tasks
  const todayStr = now.toISOString().split("T")[0];
  const calendarTasks = await CalendarEvent.find({
    userId: userObjectId,
    isCompleted: false,
    date: { $gte: todayStr },
  })
    .sort({ date: 1, startTime: 1 })
    .limit(6)
    .lean();

  // --------------------------------------------------------------------------
  // Compute Metric: Study Time This Week vs Last Week
  // --------------------------------------------------------------------------
  let thisWeekSeconds = 0;
  let lastWeekSeconds = 0;

  studySessions.forEach((session) => {
    const sDate = new Date(session.startedAt);
    if (sDate >= startOfThisWeek && sDate <= now) {
      thisWeekSeconds += session.durationSeconds || 0;
    } else if (sDate >= startOfLastWeek && sDate <= endOfLastWeek) {
      lastWeekSeconds += session.durationSeconds || 0;
    }
  });

  testAttempts.forEach((attempt) => {
    const aDate = attempt.completedAt ? new Date(attempt.completedAt) : new Date(attempt.createdAt);
    if (aDate >= startOfThisWeek && aDate <= now) {
      thisWeekSeconds += attempt.timeSpentSeconds || 0;
    } else if (aDate >= startOfLastWeek && aDate <= endOfLastWeek) {
      lastWeekSeconds += attempt.timeSpentSeconds || 0;
    }
  });

  const thisWeekMinutes = Math.round(thisWeekSeconds / 60);
  const lastWeekMinutes = Math.round(lastWeekSeconds / 60);

  let percentageChange: number | null = null;
  if (lastWeekMinutes > 0) {
    percentageChange = Math.round(((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100);
  }

  const hours = Math.floor(thisWeekMinutes / 60);
  const mins = thisWeekMinutes % 60;
  const formattedStudyTime =
    thisWeekMinutes === 0
      ? "0 hrs"
      : hours > 0
      ? `${hours}h ${mins > 0 ? `${mins}m` : ""}`.trim()
      : `${mins}m`;

  // --------------------------------------------------------------------------
  // Compute Metric: Learning Materials Completed
  // --------------------------------------------------------------------------
  let totalLessonsCompleted = 0;
  enrollments.forEach((e: any) => {
    if (Array.isArray(e.completedLessons)) {
      totalLessonsCompleted += e.completedLessons.length;
    }
  });
  const quizzesCompleted = testAttempts.length;
  const totalMaterials = totalLessonsCompleted + quizzesCompleted;

  // --------------------------------------------------------------------------
  // Compute Metric: Quiz Average
  // --------------------------------------------------------------------------
  let quizAverage: number | null = null;
  let formattedQuizAvg = "—";
  if (testAttempts.length > 0) {
    const sumPercentage = testAttempts.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
    quizAverage = Math.round(sumPercentage / testAttempts.length);
    formattedQuizAvg = `${quizAverage}%`;
  }

  // --------------------------------------------------------------------------
  // Compute Metric: Current Study Streak
  // --------------------------------------------------------------------------
  const activeDatesSet = new Set<string>();
  studySessions.forEach((s) => {
    activeDatesSet.add(new Date(s.startedAt).toISOString().split("T")[0]);
  });
  testAttempts.forEach((t) => {
    const d = t.completedAt ? new Date(t.completedAt) : new Date(t.createdAt);
    activeDatesSet.add(d.toISOString().split("T")[0]);
  });
  enrollments.forEach((e) => {
    activeDatesSet.add(new Date(e.updatedAt).toISOString().split("T")[0]);
  });
  notes.forEach((n) => {
    activeDatesSet.add(new Date(n.updatedAt).toISOString().split("T")[0]);
  });

  const sortedDates = Array.from(activeDatesSet).sort().reverse();
  let currentStreak = 0;
  let lastActiveDate: string | null = sortedDates[0] || null;

  if (sortedDates.length > 0) {
    const checkDate = new Date();
    const todayISO = checkDate.toISOString().split("T")[0];
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayISO = checkDate.toISOString().split("T")[0];

    // Student must be active today or yesterday for the streak to be currently active
    if (activeDatesSet.has(todayISO) || activeDatesSet.has(yesterdayISO)) {
      let cursor = activeDatesSet.has(todayISO) ? new Date() : checkDate;
      while (true) {
        const iso = cursor.toISOString().split("T")[0];
        if (activeDatesSet.has(iso)) {
          currentStreak++;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Compute Weekly Study-Activity Chart (7 Days: Mon - Sun)
  // --------------------------------------------------------------------------
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklyStudyActivity = dayNames.map((label, idx) => {
    const d = new Date(startOfThisWeek);
    d.setDate(startOfThisWeek.getDate() + idx);
    const isoDate = d.toISOString().split("T")[0];

    let studySec = 0;
    let quizSec = 0;

    studySessions.forEach((s) => {
      const sDateISO = new Date(s.startedAt).toISOString().split("T")[0];
      if (sDateISO === isoDate) {
        studySec += s.durationSeconds || 0;
      }
    });

    testAttempts.forEach((t) => {
      const tDate = t.completedAt ? new Date(t.completedAt) : new Date(t.createdAt);
      if (tDate.toISOString().split("T")[0] === isoDate) {
        quizSec += t.timeSpentSeconds || 0;
      }
    });

    const sMin = Math.round(studySec / 60);
    const qMin = Math.round(quizSec / 60);

    return {
      dayLabel: label,
      date: isoDate,
      studyMinutes: sMin,
      quizMinutes: qMin,
      totalMinutes: sMin + qMin,
    };
  });

  // --------------------------------------------------------------------------
  // Compute Subject-Wise Learning Progress
  // --------------------------------------------------------------------------
  const subjectMap = new Map<string, { totalItems: number; completedItems: number; scoreSum: number; count: number }>();

  enrollments.forEach((e: any) => {
    const subj = e.course?.category || e.course?.title || "General Studies";
    const current = subjectMap.get(subj) || { totalItems: 0, completedItems: 0, scoreSum: 0, count: 0 };
    current.totalItems += e.course?.totalLessons || (e.completedLessons?.length || 0) + 1;
    current.completedItems += e.completedLessons?.length || 0;
    if (e.progressPercentage) {
      current.scoreSum += e.progressPercentage;
      current.count += 1;
    }
    subjectMap.set(subj, current);
  });

  testAttempts.forEach((t: any) => {
    if (Array.isArray(t.sectionScores) && t.sectionScores.length > 0) {
      t.sectionScores.forEach((sec: any) => {
        const subj = sec.subject || "Assessments";
        const current = subjectMap.get(subj) || { totalItems: 0, completedItems: 0, scoreSum: 0, count: 0 };
        current.totalItems += sec.attemptedCount + sec.skippedCount || 5;
        current.completedItems += sec.correctCount || 0;
        current.scoreSum += sec.accuracy || 0;
        current.count += 1;
        subjectMap.set(subj, current);
      });
    } else {
      const subj = t.testId?.subject || "General Quizzes";
      const current = subjectMap.get(subj) || { totalItems: 0, completedItems: 0, scoreSum: 0, count: 0 };
      current.totalItems += t.attemptedCount + t.skippedCount || 10;
      current.completedItems += t.correctCount || 0;
      current.scoreSum += t.percentage || 0;
      current.count += 1;
      subjectMap.set(subj, current);
    }
  });

  const subjectProgress = Array.from(subjectMap.entries()).map(([subject, data], index) => {
    const masteryPercentage = data.count > 0 ? Math.round(data.scoreSum / data.count) : 0;
    return {
      subject,
      masteryPercentage: Math.min(100, Math.max(0, masteryPercentage)),
      completedItems: data.completedItems,
      totalItems: Math.max(data.totalItems, data.completedItems),
      color: SUBJECT_COLORS[index % SUBJECT_COLORS.length],
    };
  });

  // --------------------------------------------------------------------------
  // Recent Assessments
  // --------------------------------------------------------------------------
  const recentAssessments = testAttempts.slice(0, 5).map((t: any) => ({
    id: t._id.toString(),
    title: t.testId?.title || "Practice Assessment",
    subject: t.testId?.subject || "General",
    score: t.score || 0,
    maxScore: t.maxScore || 100,
    percentage: Math.round(t.percentage || 0),
    accuracy: Math.round(t.accuracy || 0),
    completedAt: t.completedAt ? t.completedAt.toISOString() : t.createdAt.toISOString(),
  }));

  // --------------------------------------------------------------------------
  // Recent Activity Feed (Interleaved Notes, Quizzes, Courses)
  // --------------------------------------------------------------------------
  const activityItems: { id: string; title: string; type: "note" | "quiz" | "course" | "session"; timestamp: string; destinationPath: string; rawDate: Date }[] = [];

  notes.slice(0, 3).forEach((n: any) => {
    activityItems.push({
      id: n._id.toString(),
      title: `Edited note: "${n.title || "Untitled"}"`,
      type: "note",
      timestamp: n.updatedAt.toISOString(),
      destinationPath: "/student/notebook",
      rawDate: new Date(n.updatedAt),
    });
  });

  testAttempts.slice(0, 3).forEach((t: any) => {
    activityItems.push({
      id: t._id.toString(),
      title: `Completed quiz with ${Math.round(t.percentage || 0)}% score`,
      type: "quiz",
      timestamp: t.completedAt ? t.completedAt.toISOString() : t.createdAt.toISOString(),
      destinationPath: "/student/exam-cracker",
      rawDate: t.completedAt ? new Date(t.completedAt) : new Date(t.createdAt),
    });
  });

  enrollments.slice(0, 2).forEach((e: any) => {
    if (e.course) {
      activityItems.push({
        id: e._id.toString(),
        title: `Studied course "${e.course.title}" (${e.progressPercentage || 0}% completed)`,
        type: "course",
        timestamp: e.updatedAt.toISOString(),
        destinationPath: "/student/courses",
        rawDate: new Date(e.updatedAt),
      });
    }
  });

  activityItems.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
  const recentActivity = activityItems.slice(0, 6).map(({ rawDate, ...rest }) => rest);

  // --------------------------------------------------------------------------
  // Upcoming Tasks
  // --------------------------------------------------------------------------
  const upcomingTasks = calendarTasks.map((task: any) => {
    const isOverdue = task.date < todayStr;
    return {
      id: task._id.toString(),
      title: task.title,
      dueDate: task.date,
      time: task.startTime,
      eventType: task.eventType || "task",
      isOverdue,
    };
  });

  // --------------------------------------------------------------------------
  // Continue Learning (Active Enrollments)
  // --------------------------------------------------------------------------
  const continueLearning = enrollments
    .filter((e: any) => e.status === "active" && e.course)
    .slice(0, 3)
    .map((e: any) => ({
      courseId: e.course._id.toString(),
      title: e.course.title,
      thumbnail: e.course.thumbnail,
      progressPercentage: Math.round(e.progressPercentage || 0),
      completedLessons: e.completedLessons?.length || 0,
      totalLessons: e.course.totalLessons || 10,
      lastAccessedLessonTitle: e.lastAccessedLesson || "Resume Next Lesson",
      destinationPath: `/student/courses`,
    }));

  // --------------------------------------------------------------------------
  // AI Study Recommendations (Generated strictly from student's real performance)
  // --------------------------------------------------------------------------
  const aiStudyRecommendations: IStudentAnalyticsResponse["aiStudyRecommendations"] = [];

  // Rule 1: Weak Quiz Subject Recommendation
  if (testAttempts.length > 0) {
    const lowestAttempt = [...testAttempts].sort((a, b) => (a.percentage || 0) - (b.percentage || 0))[0];
    if (lowestAttempt && (lowestAttempt.percentage || 0) < 75) {
      const subj = (lowestAttempt.testId as any)?.subject || "Core Concepts";
      aiStudyRecommendations.push({
        id: "rec_quiz_weakness",
        type: "review",
        title: `Strengthen ${subj}`,
        description: `Your last quiz score in ${subj} was ${Math.round(lowestAttempt.percentage || 0)}%. Reviewing practice questions will boost your mastery.`,
        actionLabel: "Practice Questions",
        actionPath: "/student/exam-cracker",
        priority: "high",
      });
    }
  }

  // Rule 2: Course in progress
  if (continueLearning.length > 0) {
    const activeCourse = continueLearning[0];
    aiStudyRecommendations.push({
      id: "rec_continue_course",
      type: "continue_course",
      title: `Keep up momentum in ${activeCourse.title}`,
      description: `You are at ${activeCourse.progressPercentage}% progress with ${activeCourse.totalLessons - activeCourse.completedLessons} lessons left.`,
      actionLabel: "Continue Course",
      actionPath: activeCourse.destinationPath,
      priority: "medium",
    });
  }

  // Rule 3: Daily Streak Habit
  if (currentStreak === 0) {
    aiStudyRecommendations.push({
      id: "rec_streak_starter",
      type: "streak",
      title: "Start a Daily Study Streak",
      description: "Complete a 15-minute study session or quiz today to start building your streak.",
      actionLabel: "Start Flash Review",
      actionPath: "/student/learn",
      priority: "medium",
    });
  } else if (currentStreak >= 1) {
    aiStudyRecommendations.push({
      id: "rec_streak_preserve",
      type: "streak",
      title: `Keep your ${currentStreak}-Day Streak Alive!`,
      description: "You've been studying consistently! Do a quick revision today to maintain your momentum.",
      actionLabel: "Open Notebook",
      actionPath: "/student/notebook",
      priority: "low",
    });
  }

  // Rule 4: Upcoming Tasks
  if (upcomingTasks.length > 0) {
    const nextTask = upcomingTasks[0];
    aiStudyRecommendations.push({
      id: "rec_upcoming_task",
      type: "practice",
      title: `Upcoming: ${nextTask.title}`,
      description: `Due on ${nextTask.dueDate}. Plan a 30-minute prep session before the deadline.`,
      actionLabel: "View in Calendar",
      actionPath: "/student/calendar",
      priority: "high",
    });
  }

  return {
    student: studentInfo,
    summaryCards: {
      studyTimeThisWeek: {
        totalMinutes: thisWeekMinutes,
        formatted: formattedStudyTime,
        previousWeekMinutes: lastWeekMinutes,
        percentageChange,
        hasActivity: thisWeekMinutes > 0,
        measurementNotice: "Measured from active quiz attempts & practice sessions (idle time excluded)",
      },
      learningMaterialsCompleted: {
        total: totalMaterials,
        lessonsCompleted: totalLessonsCompleted,
        quizzesCompleted,
        hasActivity: totalMaterials > 0,
      },
      quizAverage: {
        averagePercentage: quizAverage,
        formatted: formattedQuizAvg,
        totalQuizzesTaken: testAttempts.length,
        hasActivity: testAttempts.length > 0,
      },
      currentStudyStreak: {
        days: currentStreak,
        bestStreakDays: Math.max(currentStreak, sortedDates.length),
        hasActivity: currentStreak > 0,
        lastActiveDate,
      },
    },
    weeklyStudyActivity,
    subjectProgress,
    recentAssessments,
    recentActivity,
    upcomingTasks,
    continueLearning,
    aiStudyRecommendations: aiStudyRecommendations.slice(0, 3),
  };
}

export async function recordStudentStudySession(
  userId: string,
  sessionData: {
    durationSeconds: number;
    activityType: "practice" | "reading" | "video" | "note_taking" | "general";
    subject?: string;
    notes?: string;
  }
) {
  // Cap session at 4 hours (14400s) to avoid unverified idle background time
  const cappedDuration = Math.min(Math.max(sessionData.durationSeconds, 0), 14400);
  if (cappedDuration === 0) {
    throw new Error("Session duration must be greater than 0 seconds.");
  }

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - cappedDuration * 1000);

  const session = await StudySession.create({
    userId: new mongoose.Types.ObjectId(userId),
    activityType: sessionData.activityType || "general",
    subject: sessionData.subject || "General",
    durationSeconds: cappedDuration,
    startedAt,
    endedAt,
    notes: sessionData.notes,
  });

  return session;
}
