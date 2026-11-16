import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import User from "../src/models/User";
import StudentProfile from "../src/models/StudentProfile";
import TuitionProviderProfile from "../src/models/TuitionProviderProfile";
import TuitionOffering from "../src/models/TuitionOffering";
import TuitionBatch from "../src/models/TuitionBatch";
import TuitionEnrollment from "../src/models/TuitionEnrollment";
import TuitionSession from "../src/models/TuitionSession";
import LiveClassSession from "../src/models/LiveClassSession";
import TuitionProgram from "../src/models/TuitionProgram";
import CombinedStudyMessage from "../src/models/CombinedStudyMessage";
import { hashPassword } from "../src/utils/password";

dotenv.config({ path: path.join(__dirname, "../.env") });

async function seedTuitionDemoCredentials() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required in .env");
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB.");

  const standardPassword = "Password123!";
  const passwordHash = await hashPassword(standardPassword);

  // --------------------------------------------------------------------------
  // 1. TUITION PROVIDER
  // --------------------------------------------------------------------------
  const providerEmail = "provider.demo@edupye.com";
  let providerUser = await User.findOne({ email: providerEmail });

  if (!providerUser) {
    providerUser = new User({
      email: providerEmail,
      name: "Dr. Vikram Sethi",
      password: passwordHash,
      userType: "tuition_provider",
      roles: ["tuition_provider", "teacher"],
      activeRole: "tuition_provider",
      isEmailVerified: true,
    });
  } else {
    providerUser.password = passwordHash;
    providerUser.name = "Dr. Vikram Sethi";
    providerUser.userType = "tuition_provider";
    providerUser.roles = ["tuition_provider", "teacher"];
    providerUser.activeRole = "tuition_provider";
    providerUser.status = "active";
  }
  if (!providerUser.teacherCode) {
    providerUser.teacherCode = "TCH-PHY999";
  }
  await providerUser.save();
  console.log(`✓ Tuition Provider user ready: ${providerEmail}`);

  let providerProfile = await TuitionProviderProfile.findOne({ userId: providerUser._id });
  if (!providerProfile) {
    providerProfile = new TuitionProviderProfile({
      userId: providerUser._id,
      fullName: "Dr. Vikram Sethi",
      headline: "Senior Physics Faculty & JEE Mentor",
      bio: "12+ years preparing students for JEE Advanced, NEET, and Olympiads. Former IISc researcher.",
      education: [
        {
          degree: "PhD in Theoretical Physics",
          institution: "Indian Institute of Science (IISc)",
          yearOfPassing: 2012,
          isVerified: true,
        },
      ],
      qualifications: ["PhD in Theoretical Physics", "BSc Physics Hons"],
      experienceYears: 12,
      isQualificationsVerified: true,
      isExperienceVerified: true,
      subjects: ["Physics", "Mathematics"],
      classesTaught: ["Class 11", "Class 12", "JEE Prep"],
      teachingMode: ["online", "hybrid"],
      verificationStatus: "verified",
      platformTier: "diamond",
      calculatedTier: "diamond",
      isProvisionalTier: false,
      rating: { average: 4.9, count: 28 },
      pricing: { minHourlyRate: 1500, maxHourlyRate: 3000, currency: "INR" },
      isActive: true,
    });
  } else {
    providerProfile.verificationStatus = "verified";
    providerProfile.platformTier = "diamond";
    providerProfile.calculatedTier = "diamond";
    providerProfile.isProvisionalTier = false;
    providerProfile.isActive = true;
  }
  await providerProfile.save();
  console.log("✓ Tuition Provider Profile verified & diamond tier assigned.");

  // Offering
  let offering = await TuitionOffering.findOne({
    providerId: providerUser._id,
    title: "Class 12 Elite JEE Physics Masterclass",
  });
  if (!offering) {
    offering = new TuitionOffering({
      providerId: providerUser._id,
      providerProfileId: providerProfile._id,
      title: "Class 12 Elite JEE Physics Masterclass",
      subject: "Physics",
      classLevel: "Class 12",
      description: "Intensive Rotational Mechanics, Electrodynamics and Modern Physics for JEE Advanced.",
      teachingMode: "online",
      classFormat: "group",
      scheduleModel: "fixed_batch",
      maxCapacity: 15,
      feeAmount: 4500,
      billingUnit: "monthly",
      currency: "INR",
      availableDays: ["Monday", "Wednesday", "Friday"],
      timeSlots: [
        { day: "Monday", startTime: "18:00", endTime: "19:30" },
        { day: "Wednesday", startTime: "18:00", endTime: "19:30" },
        { day: "Friday", startTime: "18:00", endTime: "19:30" },
      ],
      status: "published",
      isActive: true,
    });
    await offering.save();
  }
  console.log("✓ Tuition Offering ready: Class 12 Elite JEE Physics Masterclass");

  // Batch
  let batch = await TuitionBatch.findOne({
    providerId: providerUser._id,
    offeringId: offering._id,
  });
  if (!batch) {
    batch = new TuitionBatch({
      offeringId: offering._id,
      providerId: providerUser._id,
      title: "Cohort A - Evening Physics",
      daysOfWeek: ["Monday", "Wednesday", "Friday"],
      startTime: "18:00",
      endTime: "19:30",
      maxCapacity: 15,
      enrolledCount: 1,
      status: "active",
      startDate: new Date(),
    });
    await batch.save();
  }
  console.log("✓ Tuition Batch active.");

  // --------------------------------------------------------------------------
  // 2. TUITION STUDENT
  // --------------------------------------------------------------------------
  const studentEmail = "student.demo@edupye.com";
  let studentUser = await User.findOne({ email: studentEmail });

  if (!studentUser) {
    studentUser = new User({
      email: studentEmail,
      name: "Alex Mercer",
      password: passwordHash,
      userType: "student",
      roles: ["student"],
      activeRole: "student",
      isEmailVerified: true,
    });
  } else {
    studentUser.password = passwordHash;
    studentUser.name = "Alex Mercer";
    studentUser.userType = "student";
    studentUser.roles = ["student"];
    studentUser.activeRole = "student";
    studentUser.status = "active";
  }
  if (!studentUser.studentCode) {
    studentUser.studentCode = "STU-PHY101";
  }
  await studentUser.save();
  console.log(`✓ Tuition Student user ready: ${studentEmail}`);

  let studentProfile = await StudentProfile.findOne({ userId: studentUser._id });
  if (!studentProfile) {
    studentProfile = new StudentProfile({
      userId: studentUser._id,
      name: "Alex Mercer",
      goal: "JEE Physics & Board Examination Mastery",
      learningPath: "school",
      education: {
        level: "school",
        institution: "Delhi Public School",
        board: "CBSE",
        classLevel: "Class 12",
      },
      schoolDetails: {
        schoolName: "Delhi Public School",
        board: "CBSE",
        classLevel: "Class 12",
        studyMode: "full_syllabus",
        selectedSubject: "Physics",
      },
    });
    await studentProfile.save();
  }
  console.log("✓ Student Profile ready.");

  // --------------------------------------------------------------------------
  // 3. ENROLLMENT (Alex enrolled with Dr. Vikram Sethi)
  // --------------------------------------------------------------------------
  let enrollment = await TuitionEnrollment.findOne({
    studentId: studentUser._id,
    offeringId: offering._id,
  });
  if (!enrollment) {
    enrollment = new TuitionEnrollment({
      studentId: studentUser._id,
      providerId: providerUser._id,
      offeringId: offering._id,
      batchId: batch._id,
      requestId: new mongoose.Types.ObjectId(),
      subject: "Physics",
      classLevel: "Class 12",
      classFormat: "group",
      teachingMode: "online",
      scheduleModel: "fixed_batch",
      scheduleDetails: {
        daysOfWeek: ["Monday", "Wednesday", "Friday"],
        startTime: "18:00",
        endTime: "19:30",
      },
      status: "active",
      feePaid: 4500,
      currency: "INR",
      paymentTransactionId: `TXN-DEMO-${Date.now()}`,
      enrolledAt: new Date(),
      sessionsAttended: 3,
      totalSessionsConducted: 4,
    });
    await enrollment.save();
  }
  console.log("✓ Enrollment active: Alex Mercer is enrolled in Dr. Vikram Sethi's class.");

  // --------------------------------------------------------------------------
  // 4. LIVE CLASS SESSION (Ready for WebRTC testing)
  // --------------------------------------------------------------------------
  let liveClassSession = await LiveClassSession.findOne({
    hostId: providerUser._id,
    status: "live",
  });

  if (!liveClassSession) {
    liveClassSession = new LiveClassSession({
      title: "Live Class: Rotational Mechanics & Angular Momentum",
      hostId: providerUser._id,
      hostRole: "tuition_provider",
      status: "live",
      sessionType: "tuition",
      offeringId: offering._id,
      batchId: batch._id,
      authorizedStudentIds: [studentUser._id],
      activeParticipants: [],
      settings: {
        allowMicrophone: true,
        allowCamera: true,
        allowScreenShare: true,
        allowChat: true,
      },
      startedAt: new Date(),
    });
    await liveClassSession.save();
  } else {
    if (!liveClassSession.authorizedStudentIds.some((id: any) => id.toString() === studentUser._id.toString())) {
      liveClassSession.authorizedStudentIds.push(studentUser._id);
      await liveClassSession.save();
    }
  }

  // Also create/update TuitionSession linked to meetingLink
  let tuitionSession = await TuitionSession.findOne({
    providerId: providerUser._id,
    offeringId: offering._id,
    status: "live",
  });

  const classroomUrl = `/live/${liveClassSession._id}`;

  if (!tuitionSession) {
    tuitionSession = new TuitionSession({
      offeringId: offering._id,
      batchId: batch._id,
      enrollmentId: enrollment._id,
      providerId: providerUser._id,
      studentIds: [studentUser._id],
      title: "Live Class: Rotational Mechanics & Angular Momentum",
      topic: "Rotational Kinematics and Moment of Inertia Calculation",
      sessionDate: new Date(),
      startTime: "18:00",
      endTime: "19:30",
      status: "live",
      meetingProvider: "edupye_smartboard",
      meetingLink: classroomUrl,
      timezone: "Asia/Kolkata",
      startedAt: new Date(),
    });
    await tuitionSession.save();
  } else {
    tuitionSession.meetingLink = classroomUrl;
    await tuitionSession.save();
  }

  // --------------------------------------------------------------------------
  // 5. TUITION PROGRAM (Phase B Scheduled Batch / Course)
  // --------------------------------------------------------------------------
  let tuitionProgram = await TuitionProgram.findOne({ code: "PRG-PHY12-DEMO" });
  if (!tuitionProgram) {
    tuitionProgram = new TuitionProgram({
      title: "Class 12 Elite JEE Physics Program",
      code: "PRG-PHY12-DEMO",
      subject: "Physics",
      grade: "Class 12",
      description: "Structured curriculum covering Rotational Kinematics, Modern Physics, and Problem-Solving Masterclasses.",
      schedule: [
        { day: "Monday", startTime: "18:00", endTime: "19:30" },
        { day: "Wednesday", startTime: "18:00", endTime: "19:30" },
        { day: "Friday", startTime: "18:00", endTime: "19:30" },
      ],
      teacherIds: [providerUser._id],
      enrolledStudentIds: [studentUser._id],
      status: "active",
      startDate: new Date(),
    });
    await tuitionProgram.save();
    console.log("✓ Tuition Program ready: PRG-PHY12-DEMO");
  } else {
    tuitionProgram.teacherIds = [providerUser._id];
    if (!tuitionProgram.enrolledStudentIds.some((id) => id.toString() === studentUser._id.toString())) {
      tuitionProgram.enrolledStudentIds.push(studentUser._id);
    }
    await tuitionProgram.save();
  }

  // --------------------------------------------------------------------------
  // 6. INITIAL COMBINED STUDY STREAM MESSAGES (1-Year Retained)
  // --------------------------------------------------------------------------
  let initialMsg = await CombinedStudyMessage.findOne({ programId: tuitionProgram._id });
  if (!initialMsg) {
    initialMsg = new CombinedStudyMessage({
      programId: tuitionProgram._id,
      senderId: providerUser._id,
      senderRole: "teacher",
      senderName: providerUser.name,
      messageType: "text",
      content: "Welcome to the Class 12 Elite JEE Physics Combined Study room! Feel free to ask questions and share study materials here.",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    await initialMsg.save();
    console.log("✓ Combined Study Stream initial message seeded.");
  }

  console.log("\n==========================================================================");
  console.log("  DEMO TUITION CREDENTIALS & PROGRAM SEED COMPLETE");
  console.log("==========================================================================");
  console.log("1. TUITION TEACHER / PROVIDER:");
  console.log(`   Email:        ${providerEmail}`);
  console.log(`   Password:     ${standardPassword}`);
  console.log(`   Name:         ${providerUser.name}`);
  console.log(`   Permanent Code: ${providerUser.teacherCode}`);
  console.log(`   Role:         tuition_provider / teacher`);
  console.log(`   Enrolled View: http://localhost:5173/teacher/enrolled-students`);
  console.log("\n2. TUITION STUDENT:");
  console.log(`   Email:        ${studentEmail}`);
  console.log(`   Password:     ${standardPassword}`);
  console.log(`   Name:         ${studentUser.name}`);
  console.log(`   Permanent Code: ${studentUser.studentCode}`);
  console.log(`   Role:         student`);
  console.log(`   Tuition Hub:  http://localhost:5173/tuition-mode`);
  console.log("\n3. DEMO TUITION PROGRAM:");
  console.log(`   Title:        ${tuitionProgram.title}`);
  console.log(`   Program Code: ${tuitionProgram.code}`);
  console.log(`   Program ID:   ${tuitionProgram._id}`);
  console.log(`   Workspace:    http://localhost:5173/tuition-mode/program/${tuitionProgram._id}`);
  console.log("\n4. ACTIVE LIVE CLASSROOM SESSION:");
  console.log(`   Session ID:   ${liveClassSession._id}`);
  console.log(`   Classroom URL: http://localhost:5173/live/${liveClassSession._id}`);
  console.log("==========================================================================\n");

  await mongoose.disconnect();
}

seedTuitionDemoCredentials().catch((err) => {
  console.error("Failed to seed credentials:", err);
  process.exit(1);
});

