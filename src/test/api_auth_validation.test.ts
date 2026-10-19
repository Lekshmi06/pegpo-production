import assert from "node:assert";
import jwt from "jsonwebtoken";
import {
  authenticateStudent,
  authenticateTeacher,
  authenticateResearcher,
  authenticateProvider,
  authenticateLearner,
  authenticateUser,
  optionalAuthenticateUser,
} from "../middlewares/auth_middleware";
import { generateSessionToken, getJwtSecret } from "../utils/token";

// Helper to construct mock Express request and response
function createMockHttp(headers: Record<string, string> = {}) {
  let statusCode = 200;
  let jsonResponse: any = null;
  let nextCalled = false;

  const req: any = {
    headers: { ...headers },
    query: {},
    params: {},
    body: {},
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: any) {
      jsonResponse = body;
      return this;
    },
  };

  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
    isNextCalled: () => nextCalled,
  };
}

async function runApiAuthValidationTests() {
  console.log("=== RUNNING BACKEND API AUTH & AUTHORIZATION VALIDATION SUITE ===");

  const secret = getJwtSecret();

  // Test 1: Missing token on student endpoint
  console.log("\n[Test 1] Missing token on authenticateStudent");
  {
    const mock = createMockHttp({});
    await authenticateStudent(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Missing token must return HTTP 401");
    assert.strictEqual(mock.isNextCalled(), false, "next() must not be called");
    assert(mock.getJsonResponse()?.message?.includes("Authentication required"), "Response must indicate missing token");
    console.log("  PASS: Missing token rejected with 401.");
  }

  // Test 2: Missing token on teacher endpoint
  console.log("\n[Test 2] Missing token on authenticateTeacher");
  {
    const mock = createMockHttp({});
    await authenticateTeacher(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Missing token on teacher route must return HTTP 401");
    assert.strictEqual(mock.isNextCalled(), false, "next() must not be called");
    console.log("  PASS: Missing teacher token rejected with 401.");
  }

  // Test 3: Missing token on researcher endpoint
  console.log("\n[Test 3] Missing token on authenticateResearcher");
  {
    const mock = createMockHttp({});
    await authenticateResearcher(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Missing token on researcher route must return HTTP 401");
    assert.strictEqual(mock.isNextCalled(), false, "next() must not be called");
    console.log("  PASS: Missing researcher token rejected with 401.");
  }

  // Test 4: Missing token on provider endpoint
  console.log("\n[Test 4] Missing token on authenticateProvider");
  {
    const mock = createMockHttp({});
    await authenticateProvider(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Missing token on provider route must return HTTP 401");
    assert.strictEqual(mock.isNextCalled(), false, "next() must not be called");
    console.log("  PASS: Missing provider token rejected with 401.");
  }

  // Test 5: Invalid / Malformed Bearer token
  console.log("\n[Test 5] Invalid malformed token on authenticateStudent");
  {
    const mock = createMockHttp({ authorization: "Bearer invalid.malformed.token123" });
    await authenticateStudent(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Malformed token must return HTTP 401");
    assert.strictEqual(mock.isNextCalled(), false, "next() must not be called");
    console.log("  PASS: Malformed token rejected with 401.");
  }

  // Test 6: Expired JWT token
  console.log("\n[Test 6] Expired token on authenticateUser");
  {
    const expiredPayload = {
      userId: "60c72b2f9b1d8b2bad000001",
      email: "expired.user@edupye.com",
      role: "student",
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    };
    const expiredToken = jwt.sign(expiredPayload, secret);
    const mock = createMockHttp({ authorization: `Bearer ${expiredToken}` });
    await authenticateUser(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Expired token must return HTTP 401");
    assert.strictEqual(mock.isNextCalled(), false, "next() must not be called");
    console.log("  PASS: Expired session token strictly rejected with 401.");
  }

  // Test 7: Tampered cryptographic signature
  console.log("\n[Test 7] Tampered cryptographic signature");
  {
    const validPayload = {
      _id: "60c72b2f9b1d8b2bad000001",
      email: "student@edupye.com",
      userType: "student",
    };
    const validToken = generateSessionToken(validPayload);
    const tamperedToken = validToken.slice(0, -6) + "999999";
    const mock = createMockHttp({ authorization: `Bearer ${tamperedToken}` });
    await authenticateUser(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Tampered signature must return HTTP 401");
    assert.strictEqual(mock.isNextCalled(), false, "next() must not be called");
    console.log("  PASS: Tampered cryptographic signature rejected with 401.");
  }

  // Test 8: Unexchanged SSO launch token used directly as Core session
  console.log("\n[Test 8] Direct use of unexchanged SSO launch token");
  {
    const ssoLaunchToken = jwt.sign(
      {
        iss: "edupye:school",
        aud: "edupye:core",
        sub: "sch_teacher_101",
        role: "teacher",
      },
      "some_sso_secret"
    );
    const mock = createMockHttp({ authorization: `Bearer ${ssoLaunchToken}` });
    await authenticateStudent(mock.req, mock.res, mock.next);
    assert.strictEqual(mock.getStatusCode(), 401, "Unexchanged SSO token must return 401");
    assert.strictEqual(mock.getJsonResponse()?.code, "SSO_EXCHANGE_REQUIRED", "Must require SSO exchange");
    console.log("  PASS: Unexchanged SSO launch token strictly blocked with SSO_EXCHANGE_REQUIRED.");
  }

  // Test 9: Public endpoint optional authentication (e.g. marketplace course catalog)
  console.log("\n[Test 9] Optional authentication on public endpoints");
  {
    // A. Unauthenticated call
    const mockPublic = createMockHttp({});
    await optionalAuthenticateUser(mockPublic.req, mockPublic.res, mockPublic.next);
    assert.strictEqual(mockPublic.isNextCalled(), true, "next() must be called for public access");
    assert.strictEqual(mockPublic.req.user, undefined, "req.user must be undefined");

    // B. Authenticated call
    const userPayload = {
      _id: "60c72b2f9b1d8b2bad000002",
      email: "public.explorer@edupye.com",
      userType: "learner",
    };
    const validToken = generateSessionToken(userPayload);
    const mockAuth = createMockHttp({ authorization: `Bearer ${validToken}` });
    await optionalAuthenticateUser(mockAuth.req, mockAuth.res, mockAuth.next);
    assert.strictEqual(mockAuth.isNextCalled(), true, "next() must be called");
    console.log("  PASS: Public endpoint permits anonymous access and transparently decodes valid credentials.");
  }

  console.log("\n=== ALL BACKEND API AUTH & AUTHORIZATION TESTS PASSED ===");
}

runApiAuthValidationTests().catch((err) => {
  console.error("API AUTH VALIDATION FAILED:", err);
  process.exit(1);
});
