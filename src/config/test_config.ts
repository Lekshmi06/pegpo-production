/**
 * Test Generation Configuration
 * Centralized configurable limits and defaults for test/question generation.
 */

export const TEST_CONFIG = {
  // Default question count when user does not specify a number
  DEFAULT_QUESTION_COUNT:
    parseInt(process.env.DEFAULT_TEST_QUESTION_COUNT || "10", 10) || 10,

  // Application-level maximum allowed question count (enforced programmatically)
  MAX_QUESTION_COUNT:
    parseInt(process.env.MAX_TEST_QUESTION_COUNT || "20", 10) || 20,

  // Minimum allowed question count
  MIN_QUESTION_COUNT: 1,

  // Maximum number of generation retries when LLM returns fewer questions than requested
  MAX_GENERATION_RETRIES: 2,
};

/**
 * Resolves and programmatically clamps the question count.
 * - If no count is specified (undefined/null/<=0), returns DEFAULT_QUESTION_COUNT (10).
 * - If requested count > MAX_QUESTION_COUNT (20), clamps to MAX_QUESTION_COUNT (20).
 * - If requested count < MIN_QUESTION_COUNT (1), clamps to MIN_QUESTION_COUNT (1).
 */
export function resolveQuestionCount(parsedCount?: number | null): number {
  if (
    typeof parsedCount !== "number" ||
    isNaN(parsedCount) ||
    parsedCount <= 0
  ) {
    return TEST_CONFIG.DEFAULT_QUESTION_COUNT;
  }
  return Math.min(
    Math.max(parsedCount, TEST_CONFIG.MIN_QUESTION_COUNT),
    TEST_CONFIG.MAX_QUESTION_COUNT
  );
}
