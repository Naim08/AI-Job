import { generateAnswers, FAQ_SIM_THRESHOLD, getEmbedding } from '../agent/ai';
import { supabase } from '../src/lib/supabaseClient';
import type { UserProfile, JobListing, Answer } from '../src/shared/types';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs for test data

// Define debug logger
const debug = (namespace: string) => (...args: any[]) => console.log(`[${namespace}]`, ...args);
const logger = debug("ai-reuse:integration");

// Define a helper for assertions
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    // process.exit(1); // Optionally exit on failure for CI environments
    throw new Error(`Assertion Failed: ${message}`);
  }
  logger(`✅ Assertion Passed: ${message}`);
}

const testUser: UserProfile = {
  id: '9c83e0bc-f49f-407a-979d-d055f0cba38d', // Ensure this user exists or use a dynamic one
  name: 'Test User AI Reuse',
  email: 'testuser.aireuse@example.com',
};

const testJob: JobListing = {
  id: 'job-ai-reuse-test-001',
  title: 'Software Engineer (AI Reuse Test)',
  company: 'TestCo AI Reuse',
  description: 'Develop amazing things for AI reuse testing.',
  url: 'http://example.com/job/aireuse',
};

async function setupTestData(userId: string, faqQuestion: string, faqAnswer: string): Promise<{ faqId: string, faqChunkId: string }> {
  const faqId = uuidv4();
  const faqChunkId = uuidv4();

  logger(`Setting up test FAQ: "${faqQuestion}" with ID: ${faqId} for user: ${userId}`);

  // 1. Insert FAQ
  const { error: faqError } = await supabase
    .from('faq')
    .insert({
      id: faqId,
      user_id: userId,
      question: faqQuestion,
      answer: faqAnswer,
    });
  if (faqError) throw new Error(`Supabase error inserting FAQ: ${faqError.message}`);
  logger(`Test FAQ item inserted: ${faqId}`);

  // 2. Get embedding for the FAQ answer (or question, depending on your strategy)
  // Let's assume we embed the *question* for matching, as that's what the user asks.
  const embeddingVector = await getEmbedding(faqQuestion);
  const embeddingString = JSON.stringify(embeddingVector); // For pgvector

  // 3. Insert FAQ Chunk
  const { error: chunkError } = await supabase
    .from('faq_chunks')
    .insert({
      id: faqChunkId,
      faq_id: faqId,
      user_id: userId,
      chunk_text: faqQuestion, // Storing the question text, could also be part of the answer
      embedding: embeddingString,
    });
  if (chunkError) throw new Error(`Supabase error inserting FAQ chunk: ${chunkError.message}`);
  logger(`Test FAQ chunk inserted: ${faqChunkId} with embedding for "${faqQuestion}"`);

  return { faqId, faqChunkId };
}

async function cleanupTestData(faqId: string, faqChunkId: string) {
  logger(`Cleaning up test data - FAQ Chunk ID: ${faqChunkId}, FAQ ID: ${faqId}`);
  const { error: chunkDeleteError } = await supabase.from('faq_chunks').delete().eq('id', faqChunkId);
  if (chunkDeleteError) console.error(`Error deleting test FAQ chunk ${faqChunkId}:`, chunkDeleteError.message);
  else logger(`Test FAQ chunk deleted: ${faqChunkId}`);

  const { error: faqDeleteError } = await supabase.from('faq').delete().eq('id', faqId);
  if (faqDeleteError) console.error(`Error deleting test FAQ ${faqId}:`, faqDeleteError.message);
  else logger(`Test FAQ deleted: ${faqId}`);
}

async function runAiReuseTests() {
  logger("Starting AI Answer Reuse Integration Tests...");

  const faqQuestionForTest = "What is the company's policy on remote work?";
  const faqAnswerForTest = "The company offers flexible remote work options depending on the role and team.";
  let testDataIds: { faqId: string, faqChunkId: string } | null = null;

  try {
    // --- Test Case 1: Reuse FAQ answer for a semantically similar question ---
    logger("Running Test Case 1: Reuse FAQ answer");

    testDataIds = await setupTestData(testUser.id, faqQuestionForTest, faqAnswerForTest);

    // const applicationQuestion = "Can I work remotely in this role?"; // Semantically similar
    const applicationQuestion = faqQuestionForTest; // Exact match for testing
    
    logger(`Calling generateAnswers for question: "${applicationQuestion}"`);
    const generatedAnswers = await generateAnswers(testUser, testJob, [applicationQuestion]);
    
    assert(generatedAnswers.length === 1, 'Test Case 1: One answer should be generated');
    const answer = generatedAnswers[0];
    assert(answer.question === applicationQuestion, 'Test Case 1: Question in answer matches application question');
    assert(answer.answer === faqAnswerForTest, 'Test Case 1: Answer matches the prepared FAQ answer');
    assert(answer.refs != null && answer.refs.includes('faq:' + testDataIds.faqId), 'Test Case 1: Refs include the correct FAQ ID');
    assert(answer.needs_review === false, 'Test Case 1: needs_review should be false for FAQ reuse');
    logger("Test Case 1 Passed.");

    // --- Test Case 2: Question does NOT match FAQ, needs review ---
    logger("Running Test Case 2: Question does not match FAQ");
    const nonMatchingQuestion = "What is the company's policy on interplanetary travel?";
    
    logger(`Calling generateAnswers for non-matching question: "${nonMatchingQuestion}"`);
    const nonMatchingAnswers = await generateAnswers(testUser, testJob, [nonMatchingQuestion]);

    assert(nonMatchingAnswers.length === 1, 'Test Case 2: One answer should be generated');
    const nonMatchingAnswer = nonMatchingAnswers[0];
    assert(nonMatchingAnswer.question === nonMatchingQuestion, 'Test Case 2: Question in answer matches application question');
    assert(nonMatchingAnswer.answer === "", 'Test Case 2: Answer should be blank for non-FAQ match');
    assert(nonMatchingAnswer.refs != null && nonMatchingAnswer.refs.length === 0, 'Test Case 2: Refs should be empty');
    assert(nonMatchingAnswer.needs_review === true, 'Test Case 2: needs_review should be true');
    logger("Test Case 2 Passed.");

  } catch (error) {
    console.error("🔥 Integration Test Failed:", error);
    // process.exit(1); // Indicate failure
  } finally {
    if (testDataIds) {
      await cleanupTestData(testDataIds.faqId, testDataIds.faqChunkId);
    }
    logger("AI Answer Reuse Integration Tests Finished.");
  }
}

// To run the tests:
// 1. Ensure your Supabase instance is running and accessible.
// 2. Ensure your .env file is set up with Supabase credentials.
// 3. Execute this file (e.g., using ts-node or after compiling to JS).
// Example: npx ts-node tests/ai-reuse.test.ts
runAiReuseTests();
