import "dotenv/config";
import mongoose from "mongoose";
import http from "http";
import app from "../server";
import { seedAdminAccounts } from "./seed_admin_accounts";

async function makeRequest(
  port: number,
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };
    if (payload) {
      reqHeaders["Content-Length"] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({ status: res.statusCode || 200, data: parsed });
          } catch {
            resolve({ status: res.statusCode || 200, data: raw });
          }
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runVerification(): Promise<void> {
  console.log("🚀 Starting Unified Admin & ERP Backend Verification Suite...\n");

  // Step 1: Seed admin accounts
  await seedAdminAccounts();

  // Step 2: Start server on dynamic port
  const testPort = 5999;
  const server = app.listen(testPort);
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    console.log("--- 1. Testing Super Admin Dedicated Login (/api/auth/super-admin/login) ---");
    const saLogin = await makeRequest(testPort, "POST", "/api/auth/super-admin/login", {
      username: "superadmin@edupye.com",
      password: "Password123!",
    });
    console.log("Status:", saLogin.status);
    console.log("Response User:", saLogin.data.user?.displayName, "| Role:", saLogin.data.user?.role);
    if (saLogin.status !== 200 || !saLogin.data.token || saLogin.data.user?.role !== "Super Admin") {
      throw new Error(`Super Admin dedicated login failed: ${JSON.stringify(saLogin.data)}`);
    }
    const saToken = saLogin.data.token;
    console.log("✅ Super Admin dedicated login PASSED\n");

    console.log("--- 2. Testing Tuition Admin Dedicated Login (/api/auth/tuition-admin/login) ---");
    const taLogin = await makeRequest(testPort, "POST", "/api/auth/tuition-admin/login", {
      username: "tuitionadmin@edupye.com",
      password: "Password123!",
    });
    console.log("Status:", taLogin.status);
    console.log("Response User:", taLogin.data.user?.displayName, "| Role:", taLogin.data.user?.role);
    console.log("Allowed Modules:", taLogin.data.user?.allowedModules);
    if (
      taLogin.status !== 200 ||
      !taLogin.data.token ||
      taLogin.data.user?.role !== "Tuition Operations Admin" ||
      !taLogin.data.user?.allowedModules?.includes(33)
    ) {
      throw new Error(`Tuition Admin dedicated login failed: ${JSON.stringify(taLogin.data)}`);
    }
    const taToken = taLogin.data.token;
    console.log("✅ Tuition Admin dedicated login PASSED\n");

    console.log("--- 3. Testing Unified Login (/api/auth/login) with Selected Role & Negative Cases ---");
    // 3a: Unified Super Admin login
    const unifiedSa = await makeRequest(testPort, "POST", "/api/auth/login", {
      username: "superadmin",
      password: "Password123!",
      selectedRole: "Super Admin",
    });
    if (unifiedSa.status !== 200 || unifiedSa.data.user?.role !== "Super Admin") {
      throw new Error(`Unified SA login failed: ${JSON.stringify(unifiedSa.data)}`);
    }
    console.log("✅ Unified Super Admin login PASSED");

    // 3b: Unified Tuition Admin login
    const unifiedTa = await makeRequest(testPort, "POST", "/api/auth/login", {
      username: "tuitionadmin",
      password: "Password123!",
      selectedRole: "Tuition Operations Admin",
    });
    if (unifiedTa.status !== 200 || unifiedTa.data.user?.role !== "Tuition Operations Admin") {
      throw new Error(`Unified Tuition Admin login failed: ${JSON.stringify(unifiedTa.data)}`);
    }
    console.log("✅ Unified Tuition Operations Admin login PASSED");

    // 3c: Invalid password
    const badPass = await makeRequest(testPort, "POST", "/api/auth/login", {
      username: "superadmin",
      password: "WrongPassword999!",
      selectedRole: "Super Admin",
    });
    if (badPass.status !== 401) {
      throw new Error(`Expected 401 on bad password, got ${badPass.status}`);
    }
    console.log("✅ Invalid password correctly rejected (401)");

    // 3d: Role mismatch
    const roleMismatch = await makeRequest(testPort, "POST", "/api/auth/login", {
      username: "tuitionadmin",
      password: "Password123!",
      selectedRole: "Super Admin",
    });
    if (roleMismatch.status !== 403) {
      throw new Error(`Expected 403 on role mismatch, got ${roleMismatch.status}`);
    }
    console.log("✅ Role mismatch correctly rejected (403)\n");

    console.log("--- 4. Testing /api/auth/me Session Validation ---");
    const meSa = await makeRequest(testPort, "GET", "/api/auth/me", undefined, {
      Authorization: `Bearer ${saToken}`,
    });
    if (meSa.status !== 200 || meSa.data.user?.email !== "superadmin@edupye.com") {
      throw new Error(`/api/auth/me failed for SA: ${JSON.stringify(meSa.data)}`);
    }
    console.log("✅ /api/auth/me for Super Admin PASSED");

    const meTa = await makeRequest(testPort, "GET", "/api/auth/me", undefined, {
      Authorization: `Bearer ${taToken}`,
    });
    if (meTa.status !== 200 || meTa.data.user?.email !== "tuitionadmin@edupye.com") {
      throw new Error(`/api/auth/me failed for Tuition Admin: ${JSON.stringify(meTa.data)}`);
    }
    console.log("✅ /api/auth/me for Tuition Admin PASSED\n");

    console.log("--- 5. Testing Ported User Management (/api/users) ---");
    const usersList = await makeRequest(testPort, "GET", "/api/users", undefined, {
      Authorization: `Bearer ${saToken}`,
    });
    if (usersList.status !== 200 || !Array.isArray(usersList.data.users)) {
      throw new Error(`User list failed: ${JSON.stringify(usersList.data)}`);
    }
    console.log(`✅ /api/users returned ${usersList.data.users.length} users`);

    const userStats = await makeRequest(testPort, "GET", "/api/users/stats", undefined, {
      Authorization: `Bearer ${saToken}`,
    });
    if (userStats.status !== 200 || !userStats.data.stats) {
      throw new Error(`User stats failed: ${JSON.stringify(userStats.data)}`);
    }
    console.log("✅ /api/users/stats returned:", userStats.data.stats);

    console.log("\n--- 6. Testing CRM Platform Endpoints (/api/platform) ---");
    const platformStats = await makeRequest(testPort, "GET", "/api/platform/stats", undefined, {
      Authorization: `Bearer ${saToken}`,
    });
    if (platformStats.status !== 200 || !platformStats.data.data) {
      throw new Error(`Platform stats failed: ${JSON.stringify(platformStats.data)}`);
    }
    console.log("✅ /api/platform/stats returned:", platformStats.data.data);

    const candidates = await makeRequest(testPort, "GET", "/api/platform/candidates", undefined, {
      Authorization: `Bearer ${saToken}`,
    });
    if (candidates.status !== 200) {
      throw new Error(`Candidates list failed: ${JSON.stringify(candidates.data)}`);
    }
    console.log(`✅ /api/platform/candidates returned ${candidates.data.data?.length || 0} candidates`);

    console.log("\n--- 7. Testing CSM / Taskmite Support Endpoints (/api/tasks) ---");
    // Create task
    const newTask = await makeRequest(
      testPort,
      "POST",
      "/api/tasks",
      {
        title: "Test Support Ticket 001",
        description: "Integration testing for CSM task workflow",
        priority: "HIGH",
      },
      {
        Authorization: `Bearer ${saToken}`,
      }
    );
    if (newTask.status !== 201 || !newTask.data.title) {
      throw new Error(`Create task failed: ${JSON.stringify(newTask.data)}`);
    }
    console.log("✅ /api/tasks (POST) created task #", newTask.data.taskNumber);

    // List tasks
    const tasksList = await makeRequest(testPort, "GET", "/api/tasks");
    if (tasksList.status !== 200 || !Array.isArray(tasksList.data)) {
      throw new Error(`Get tasks failed: ${JSON.stringify(tasksList.data)}`);
    }
    console.log(`✅ /api/tasks (GET) returned ${tasksList.data.length} tasks`);

    console.log("\n--- 8. Testing CRM Parties & Sales Quotes (/api/acmaso) ---");
    // Create Party
    const partyRes = await makeRequest(
      testPort,
      "POST",
      "/api/acmaso/parties",
      {
        name: `Acme Corp Test ${Date.now()}`,
        role: "Customer",
        email: "contact@acmetest.com",
        phone: "+91 99999 88888",
        placeOfSupply: "Karnataka",
      },
      {
        Authorization: `Bearer ${saToken}`,
      }
    );
    if (partyRes.status !== 201 || !partyRes.data.data?.name) {
      throw new Error(`Create party failed: ${JSON.stringify(partyRes.data)}`);
    }
    console.log("✅ /api/acmaso/parties (POST) created party:", partyRes.data.data.name);

    // List Parties
    const partyList = await makeRequest(testPort, "GET", "/api/acmaso/parties");
    if (partyList.status !== 200 || !Array.isArray(partyList.data.data)) {
      throw new Error(`Get parties failed: ${JSON.stringify(partyList.data)}`);
    }
    console.log(`✅ /api/acmaso/parties (GET) returned ${partyList.data.data.length} parties`);

    // Create Sales Quote
    const quoteRes = await makeRequest(
      testPort,
      "POST",
      "/api/acmaso/sales-quotes",
      {
        party: partyRes.data.data.name,
        date: "2026-11-16",
        items: [
          {
            name: "Enterprise Tuition Subscription",
            quantity: 5,
            rate: 2000,
            taxRate: 18,
          },
        ],
      },
      {
        Authorization: `Bearer ${saToken}`,
      }
    );
    if (quoteRes.status !== 201 || !quoteRes.data.data?.quoteNumber) {
      throw new Error(`Create sales quote failed: ${JSON.stringify(quoteRes.data)}`);
    }
    console.log("✅ /api/acmaso/sales-quotes (POST) created quote #", quoteRes.data.data.quoteNumber);

    console.log("\n=======================================================");
    console.log("🎉 ALL UNIFIED ADMIN, HRM, CRM, AND CSM TESTS PASSED!");
    console.log("=======================================================\n");
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runVerification()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Verification Suite Failed:", err);
    process.exit(1);
  });

