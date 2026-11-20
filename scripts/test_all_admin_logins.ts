import "dotenv/config";
import mongoose from "mongoose";
import http from "http";
import app from "../src/server";
import { seedAdminAccounts } from "../src/config/seed_admin_accounts";

async function runLiveLoginTests() {
  console.log("=== Starting Live 4-Role Admin Login Verification ===");

  // 1. Ensure accounts are seeded in database
  await seedAdminAccounts();

  // 2. Start server on an ephemeral or test port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5099, () => resolve()));
  console.log("Test HTTP server listening on http://localhost:5099");

  const baseUrl = "http://localhost:5099";

  const testCases = [
    // --- Super Admin ---
    {
      role: "Super Admin",
      endpoint: "/api/auth/super-admin/login",
      body: { username: "superadmin", password: "Password123!" },
      desc: "Super Admin via username",
    },
    {
      role: "Super Admin",
      endpoint: "/api/auth/super-admin/login",
      body: { username: "superadmin@edupye.com", password: "Password123!" },
      desc: "Super Admin via email",
    },
    {
      role: "Super Admin",
      endpoint: "/api/auth/super-admin/login",
      body: { username: "SA-001", password: "Password123!" },
      desc: "Super Admin via User ID (SA-001)",
    },
    {
      role: "Super Admin",
      endpoint: "/api/auth/login",
      body: { username: "superadmin", password: "Password123!", selectedRole: "Super Admin" },
      desc: "Super Admin via unified /api/auth/login",
    },

    // --- Tuition Admin ---
    {
      role: "Tuition Admin",
      endpoint: "/api/auth/tuition-admin/login",
      body: { username: "tuitionadmin", password: "Password123!" },
      desc: "Tuition Admin via username",
    },
    {
      role: "Tuition Admin",
      endpoint: "/api/auth/tuition-admin/login",
      body: { username: "tuitionadmin@edupye.com", password: "Password123!" },
      desc: "Tuition Admin via email",
    },
    {
      role: "Tuition Admin",
      endpoint: "/api/auth/tuition-admin/login",
      body: { username: "TAD-001", password: "Password123!" },
      desc: "Tuition Admin via User ID (TAD-001)",
    },
    {
      role: "Tuition Admin",
      endpoint: "/api/auth/login",
      body: { username: "tuitionadmin", password: "Password123!", selectedRole: "Tuition Admin" },
      desc: "Tuition Admin via unified /api/auth/login",
    },

    // --- Admin ---
    {
      role: "Admin",
      endpoint: "/api/auth/admin/login",
      body: { username: "admin", password: "Password123!" },
      desc: "General Admin via username",
    },
    {
      role: "Admin",
      endpoint: "/api/auth/admin/login",
      body: { username: "admin@edupye.com", password: "Password123!" },
      desc: "General Admin via email",
    },
    {
      role: "Admin",
      endpoint: "/api/auth/admin/login",
      body: { username: "ADM-001", password: "Password123!" },
      desc: "General Admin via User ID (ADM-001)",
    },
    {
      role: "Admin",
      endpoint: "/api/auth/login",
      body: { username: "admin", password: "Password123!", selectedRole: "Admin" },
      desc: "General Admin via unified /api/auth/login",
    },

    // --- Staff ---
    {
      role: "Staff",
      endpoint: "/api/auth/staff/login",
      body: { username: "staff", password: "Password123!" },
      desc: "Staff member via username",
    },
    {
      role: "Staff",
      endpoint: "/api/auth/staff/login",
      body: { username: "staff@edupye.com", password: "Password123!" },
      desc: "Staff member via email",
    },
    {
      role: "Staff",
      endpoint: "/api/auth/staff/login",
      body: { username: "STF-001", password: "Password123!" },
      desc: "Staff member via User ID (STF-001)",
    },
    {
      role: "Staff",
      endpoint: "/api/auth/login",
      body: { username: "staff", password: "Password123!", selectedRole: "Staff" },
      desc: "Staff member via unified /api/auth/login",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      const res = await fetch(`${baseUrl}${tc.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tc.body),
      });

      const data = await res.json();
      if (res.status === 200 && data.success && data.token && data.user) {
        console.log(`✅ [PASS] ${tc.desc}`);
        console.log(`   Status: ${res.status} | Role: ${data.user.role} | Token: YES`);
        console.log(`   AllowedModules: [${data.user.allowedModules?.slice(0, 8).join(", ")}${data.user.allowedModules?.length > 8 ? ` ... (${data.user.allowedModules.length} total)` : ""}]`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${tc.desc}`);
        console.error(`   Status: ${res.status} | Response:`, data);
        failed++;
      }
    } catch (err: any) {
      console.error(`❌ [ERROR] ${tc.desc}:`, err.message);
      failed++;
    }
  }

  // 3. Test Session Me Endpoint
  console.log("\n--- Testing Session /api/auth/me Verification ---");
  try {
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "Password123!" }),
    });
    const adminData = await adminLoginRes.json();
    const token = adminData.token;

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = await meRes.json();
    if (meRes.status === 200 && meData.success && meData.user) {
      console.log(`✅ [PASS] /api/auth/me authenticated successfully: ${meData.user.username} (${meData.user.role})`);
      passed++;
    } else {
      console.error(`❌ [FAIL] /api/auth/me failed:`, meData);
      failed++;
    }
  } catch (err: any) {
    console.error("❌ [ERROR] me endpoint test:", err.message);
    failed++;
  }

  // Cleanup
  server.close();
  await mongoose.disconnect();

  console.log("\n=======================================================");
  console.log(`Total Tests: ${testCases.length + 1} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=======================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runLiveLoginTests().catch(async (e) => {
  console.error("Fatal Test Failure:", e);
  await mongoose.disconnect();
  process.exit(1);
});
