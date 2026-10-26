import assert from "node:assert";
import http from "node:http";
import app from "../server";

async function runCorsPreflightTests() {
  console.log("=== RUNNING SHARED CORS PREFLIGHT REGRESSION SUITE (ALL MODULES) ===");

  const PROD_FRONTEND_ORIGIN = "https://pegpo-frontend-production.vercel.app";
  const originalCorsOrigins = process.env.ALLOWED_CORS_ORIGINS;

  // Configure test allowed origins simulating production environment with wildcard and explicit domains
  process.env.ALLOWED_CORS_ORIGINS =
    "http://localhost:5173,http://localhost:3000,https://edupye.com,https://app.edupye.com,*.vercel.app";

  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as { port: number; address: string };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: OPTIONS Preflight for GET /api/research/projects with x-researcher-id
    // -------------------------------------------------------------------------
    console.log("\n[Test 1] Research Module: OPTIONS preflight with x-researcher-id");
    {
      const response = await fetch(`${baseUrl}/api/research/projects`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "x-researcher-id, authorization, content-type",
        },
      });

      assert(
        response.status === 204 || response.status === 200,
        `Preflight response status must be 204 or 200, got ${response.status}`
      );

      const allowOrigin = response.headers.get("access-control-allow-origin");
      assert.strictEqual(
        allowOrigin,
        PROD_FRONTEND_ORIGIN,
        `Preflight response must reflect origin '${PROD_FRONTEND_ORIGIN}'`
      );

      const allowCredentials = response.headers.get("access-control-allow-credentials");
      assert.strictEqual(allowCredentials, "true", "Must permit credentials");

      const allowHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase();
      assert(allowHeaders.includes("x-researcher-id"), "Must include x-researcher-id");
      assert(allowHeaders.includes("authorization"), "Must include authorization");
      assert(allowHeaders.includes("content-type"), "Must include content-type");

      const allowMethods = response.headers.get("access-control-allow-methods") || "";
      assert(allowMethods.includes("GET"), "Must permit GET");
      assert(allowMethods.includes("OPTIONS"), "Must permit OPTIONS");

      console.log("  PASS: Research preflight permits production origin and x-researcher-id.");
    }

    // -------------------------------------------------------------------------
    // TEST 2: Teacher Module: OPTIONS preflight with x-teacher-profile-id
    // -------------------------------------------------------------------------
    console.log("\n[Test 2] Teacher Module: OPTIONS preflight with x-teacher-profile-id and x-user-id");
    {
      const response = await fetch(`${baseUrl}/api/teacher-tasks`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "x-teacher-profile-id, x-user-id, authorization",
        },
      });

      assert(response.status === 204 || response.status === 200);
      const allowOrigin = response.headers.get("access-control-allow-origin");
      assert.strictEqual(allowOrigin, PROD_FRONTEND_ORIGIN);

      const allowHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase();
      assert(allowHeaders.includes("x-teacher-profile-id"), "Must include x-teacher-profile-id");
      assert(allowHeaders.includes("x-user-id"), "Must include x-user-id");
      console.log("  PASS: Teacher preflight permits x-teacher-profile-id and x-user-id.");
    }

    // -------------------------------------------------------------------------
    // TEST 3: Student Module: OPTIONS preflight with x-student-profile-id
    // -------------------------------------------------------------------------
    console.log("\n[Test 3] Student Module: OPTIONS preflight with x-student-profile-id");
    {
      const response = await fetch(`${baseUrl}/api/students/dashboard/analytics`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "x-student-profile-id, authorization",
        },
      });

      assert(response.status === 204 || response.status === 200);
      const allowHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase();
      assert(allowHeaders.includes("x-student-profile-id"), "Must include x-student-profile-id");
      console.log("  PASS: Student preflight permits x-student-profile-id.");
    }

    // -------------------------------------------------------------------------
    // TEST 4: Test Generation / Exam Prep: OPTIONS preflight with x-timezone-offset
    // -------------------------------------------------------------------------
    console.log("\n[Test 4] Test/Exam Module: OPTIONS preflight with x-timezone-offset");
    {
      const response = await fetch(`${baseUrl}/api/tests/practice`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "x-timezone-offset, x-student-profile-id, authorization",
        },
      });

      assert(response.status === 204 || response.status === 200);
      const allowHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase();
      assert(allowHeaders.includes("x-timezone-offset"), "Must include x-timezone-offset");
      console.log("  PASS: Test module preflight permits x-timezone-offset.");
    }

    // -------------------------------------------------------------------------
    // TEST 5: Workspace Module: OPTIONS preflight with x-user-email & x-user-id
    // -------------------------------------------------------------------------
    console.log("\n[Test 5] Workspace Module: OPTIONS preflight with x-user-email & x-user-id");
    {
      const response = await fetch(`${baseUrl}/api/workspace/notes`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "x-user-email, x-user-id, content-type, authorization",
        },
      });

      assert(response.status === 204 || response.status === 200);
      const allowHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase();
      assert(allowHeaders.includes("x-user-email"), "Must include x-user-email");
      assert(allowHeaders.includes("x-user-id"), "Must include x-user-id");
      console.log("  PASS: Workspace preflight permits x-user-email and x-user-id.");
    }

    // -------------------------------------------------------------------------
    // TEST 6: Institution & SSO Modules: OPTIONS preflight with x-institution-id & x-sso-token
    // -------------------------------------------------------------------------
    console.log("\n[Test 6] Institution & SSO Modules: OPTIONS preflight with x-institution-id & x-sso-token");
    {
      const response = await fetch(`${baseUrl}/api/institutions`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "x-institution-id, x-sso-token, authorization",
        },
      });

      assert(response.status === 204 || response.status === 200);
      const allowHeaders = (response.headers.get("access-control-allow-headers") || "").toLowerCase();
      assert(allowHeaders.includes("x-institution-id"), "Must include x-institution-id");
      assert(allowHeaders.includes("x-sso-token"), "Must include x-sso-token");
      console.log("  PASS: Institution/SSO preflight permits x-institution-id and x-sso-token.");
    }

    // -------------------------------------------------------------------------
    // TEST 7: LMS / Course Builder Module: Standard preflight with Authorization & Content-Type
    // -------------------------------------------------------------------------
    console.log("\n[Test 7] LMS / Course Builder: Standard preflight with Authorization & Content-Type");
    {
      const response = await fetch(`${baseUrl}/api/courses`, {
        method: "OPTIONS",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type",
        },
      });

      assert(response.status === 204 || response.status === 200);
      const allowOrigin = response.headers.get("access-control-allow-origin");
      assert.strictEqual(allowOrigin, PROD_FRONTEND_ORIGIN);
      console.log("  PASS: LMS / Courses preflight permits standard headers.");
    }

    // -------------------------------------------------------------------------
    // TEST 8: Disallowed origin is strictly rejected
    // -------------------------------------------------------------------------
    console.log("\n[Test 8] Request from disallowed untrusted origin is rejected");
    {
      const response = await fetch(`${baseUrl}/api/research/projects`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://malicious-attacker-domain.com",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "x-researcher-id",
        },
      });

      const allowOrigin = response.headers.get("access-control-allow-origin");
      assert(
        allowOrigin !== "https://malicious-attacker-domain.com",
        "Disallowed origin must NOT receive Access-Control-Allow-Origin header"
      );
      console.log("  PASS: Untrusted origin is safely blocked by CORS.");
    }

    // -------------------------------------------------------------------------
    // TEST 9: Direct GET request with x-researcher-id and production origin
    // -------------------------------------------------------------------------
    console.log("\n[Test 9] Direct GET request includes CORS headers");
    {
      const response = await fetch(`${baseUrl}/api/research/projects`, {
        method: "GET",
        headers: {
          Origin: PROD_FRONTEND_ORIGIN,
          "x-researcher-id": "60c72b2f9b1d8b2bad000088",
        },
      });

      const allowOrigin = response.headers.get("access-control-allow-origin");
      assert.strictEqual(
        allowOrigin,
        PROD_FRONTEND_ORIGIN,
        "GET response must include Access-Control-Allow-Origin matching production origin"
      );
      const allowCredentials = response.headers.get("access-control-allow-credentials");
      assert.strictEqual(
        allowCredentials,
        "true",
        "GET response must include Access-Control-Allow-Credentials: true"
      );
      console.log("  PASS: Actual GET request retains proper CORS headers.");
    }

    console.log("\n=============================================================");
    console.log("ALL SHARED CORS PREFLIGHT TESTS PASSED (9/9) ACROSS ALL MODULES!");
    console.log("=============================================================");
  } finally {
    process.env.ALLOWED_CORS_ORIGINS = originalCorsOrigins;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

runCorsPreflightTests().catch((err) => {
  console.error("CORS PREFLIGHT TEST FAILED:", err);
  process.exit(1);
});
