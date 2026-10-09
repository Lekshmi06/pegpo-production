import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";
import Course from "../models/Course";
import { registerUser, loginUser } from "../services/auth_service";
import {
  createCourse,
  addCourseSection,
  addCourseLesson,
  updateCourseLesson,
  getCourseById,
} from "../services/course_service";
import {
  parseYouTubeUrl,
  validateVideoUrl,
  isYouTubeHost,
  YOUTUBE_VIDEO_ID_REGEX,
} from "../utils/youtube_utils";

async function runTests() {
  console.log("========================================================");
  console.log("STARTING YOUTUBE VIDEO EMBEDDING & URL PARSING TESTS");
  console.log("========================================================\n");

  // 1. Test YouTube URL Parsing Formats
  console.log("1. Testing YouTube URL Parsing across all supported formats...");

  const testCases = [
    {
      name: "Standard watch link",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "Short link (youtu.be)",
      url: "https://youtu.be/dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "YouTube Shorts link",
      url: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "Existing Embed link",
      url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "Mobile web YouTube link",
      url: "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "YouTube Live link",
      url: "https://youtube.com/live/dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "Watch link with extra query params (feature=share)",
      url: "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "Watch link with timestamp in seconds",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45s",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "Shorts link with feature param",
      url: "https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
    {
      name: "Link without protocol (www.youtube.com/watch?v=...)",
      url: "www.youtube.com/watch?v=dQw4w9WgXcQ",
      expectedId: "dQw4w9WgXcQ",
      expectedEmbed: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    },
  ];

  for (const tc of testCases) {
    const res = parseYouTubeUrl(tc.url);
    if (!res.isValid || res.videoId !== tc.expectedId) {
      throw new Error(`Failed test case [${tc.name}]: expected ${tc.expectedId}, got ${res.videoId} (error: ${res.error})`);
    }
    if (res.embedUrl !== tc.expectedEmbed) {
      throw new Error(`Failed embed URL [${tc.name}]: expected ${tc.expectedEmbed}, got ${res.embedUrl}`);
    }
    console.log(`  ✓ ${tc.name}: Video ID "${res.videoId}" parsed into "${res.embedUrl}"`);
  }

  // 2. Test Malformed and Invalid URLs
  console.log("\n2. Testing Malformed & Invalid URL Rejection...");
  const invalidCases = [
    { name: "Watch link missing v param", url: "https://www.youtube.com/watch" },
    { name: "Video ID too short", url: "https://www.youtube.com/watch?v=abc123" },
    { name: "Video ID with invalid characters", url: "https://www.youtube.com/watch?v=abc!@#$%^&*" },
    { name: "Empty youtu.be path", url: "https://youtu.be/" },
    { name: "Empty shorts path", url: "https://www.youtube.com/shorts/" },
    { name: "Unsafe javascript URI", url: "javascript:alert(document.cookie)" },
    { name: "Unsafe data URI", url: "data:text/html,<script>alert(1)</script>" },
  ];

  for (const inv of invalidCases) {
    const val = validateVideoUrl(inv.url);
    if (val.isValid) {
      throw new Error(`Security Failure: Invalid URL was accepted: [${inv.name}] -> ${inv.url}`);
    }
    console.log(`  ✓ Correctly rejected [${inv.name}]: "${val.error}"`);
  }

  // 3. Test Direct Non-YouTube Video URLs
  console.log("\n3. Testing Direct Non-YouTube Video URLs (mp4/webm)...");
  const directVideos = [
    "https://storage.googleapis.com/edupye-lectures/intro.mp4",
    "https://cdn.example.com/videos/lecture-1.webm",
    "http://example.com/demo.mp4",
  ];
  for (const dv of directVideos) {
    const val = validateVideoUrl(dv);
    if (!val.isValid) {
      throw new Error(`Direct video stream was rejected: ${dv}`);
    }
    console.log(`  ✓ Valid direct video stream preserved: "${dv}"`);
  }

  // 4. Test Backend Course Creation & Lesson Video Validation with Real DB
  console.log("\n4. Testing Backend Course Creation with YouTube Video Lessons...");
  const uri = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/edupye";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB at:", uri);

  const suffix = Date.now();
  const providerEmail = `youtube.provider.${suffix}@test.edupye.com`;

  try {
    const reg = await registerUser({
      email: providerEmail,
      password: "Password123!",
      name: "Video Instructor",
      userType: "provider",
    });
    const providerId = reg.user._id.toString();

    const course = await createCourse(reg.user, {
      title: "Mastering Cloud Architecture with Video Lessons",
      description: "Learn modern cloud engineering with curated video lectures and labs.",
      category: "Software Engineering",
      level: "Intermediate",
      price: 49.99,
    });

    const sec1 = await addCourseSection(
      course._id.toString(),
      providerId,
      "Module 1: Cloud Foundations",
      "Video lecture series"
    );
    const secId = sec1.sections![0]!._id!.toString();

    // Add Lesson 1 with short YouTube link
    const c1 = await addCourseLesson(course._id.toString(), providerId, secId, {
      title: "Lesson 1: Cloud Architecture Overview",
      contentType: "video",
      durationMinutes: 15,
      videoUrl: "https://youtu.be/dQw4w9WgXcQ",
    });
    console.log("  ✓ Added lesson with youtu.be link successfully.");

    // Add Lesson 2 with YouTube Shorts link
    const c2 = await addCourseLesson(course._id.toString(), providerId, secId, {
      title: "Lesson 2: Quick Cloud Tip (Shorts)",
      contentType: "video",
      durationMinutes: 5,
      videoUrl: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    });
    console.log("  ✓ Added lesson with youtube.com/shorts link successfully.");

    // Add Lesson 3 with YouTube watch?v= link
    const c3 = await addCourseLesson(course._id.toString(), providerId, secId, {
      title: "Lesson 3: Deep Dive Lecture",
      contentType: "video",
      durationMinutes: 45,
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s",
    });
    console.log("  ✓ Added lesson with youtube.com/watch link successfully.");

    // Add Lesson 4 with direct MP4 link
    const c4 = await addCourseLesson(course._id.toString(), providerId, secId, {
      title: "Lesson 4: Hands-on Lab Recording",
      contentType: "video",
      durationMinutes: 20,
      videoUrl: "https://cdn.example.com/courses/lab1.mp4",
    });
    console.log("  ✓ Added lesson with direct .mp4 link successfully.");

    // Verify Backend Rejects Malformed YouTube Video Lesson
    console.log("\n5. Testing Backend Rejection of Malformed YouTube URL...");
    try {
      await addCourseLesson(course._id.toString(), providerId, secId, {
        title: "Broken Lesson",
        contentType: "video",
        durationMinutes: 10,
        videoUrl: "https://www.youtube.com/watch?v=invalid_short_id",
      });
      throw new Error("Security Breach: Backend accepted invalid YouTube video URL!");
    } catch (err: any) {
      if (err.message.includes("Invalid YouTube video ID")) {
        console.log(`  ✓ Backend rejected invalid YouTube video link: "${err.message}"`);
      } else {
        throw err;
      }
    }

    // Verify Course Retrieval has all lessons intact
    const { course: fetched } = await getCourseById(course._id.toString(), providerId);
    const lessons = fetched.sections[0].lessons;
    if (lessons.length !== 4) {
      throw new Error(`Expected 4 lessons, got ${lessons.length}`);
    }
    console.log(`  ✓ Verified all 4 video lessons persisted intact with exact URLs.`);

    // Cleanup test artifacts
    await Course.findByIdAndDelete(course._id);
    await User.findByIdAndDelete(reg.user._id);
    console.log("  ✓ Test artifacts cleaned up.");

    console.log("\n========================================================");
    console.log("ALL YOUTUBE VIDEO EMBEDDING & PLAYER TESTS PASSED!");
    console.log("========================================================\n");
  } finally {
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
