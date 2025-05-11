console.log('Executing tests/filter.test.ts - Top of file');
import { scoreJob } from '../agent/filter.js'; // Assuming filter.ts is in agent/
import { UserProfile, JobListing } from '../src/shared/types.js'; // Assuming types.ts is in src/shared/

// Define a helper for assertions to make tests cleaner
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`✅ Assertion Passed: ${message}`);
}

const SIMILARITY_THRESHOLD = 0.65; // From agent/filter.ts

async function runTests() {
  console.log('Running filter tests...\n');

  // --- Test Case 1: Blacklisted Company ---
  console.log('--- Test Case 1: Blacklisted Company ---');
  const userForBlacklistTest: UserProfile = {
    id: 'user_with_blacklisted_company', // Triggers blacklist in your mock
    name: 'Test User Blacklist',
    email: 'testbl@example.com',
  };
  const blacklistedJob: JobListing = {
    id: 'job_bl_1',
    title: 'Software Engineer',
    company: 'Evil Corp', // This company is blacklisted by user_with_blacklisted_company
    description: 'A job at a blacklisted company (blacklisted_job_description).',
    url: 'http://evilcorp.jobs/swe',
  };

  try {
    const resultBlacklist = await scoreJob(userForBlacklistTest, blacklistedJob);
    const { score: scoreBl, trace: traceBl } = resultBlacklist;

    assert(scoreBl.blacklisted === true, 'Blacklisted company: score.blacklisted should be true');
    assert(scoreBl.confidence === 0, 'Blacklisted company: score.confidence should be 0');
    assert(scoreBl.similarity === 0, 'Blacklisted company: score.similarity should be 0');
    assert(traceBl.title === 'Is company blacklisted?', 'Blacklisted company: trace title correct');
    assert(traceBl.pass === false, 'Blacklisted company: trace.pass should be false at root');
    assert(traceBl.children !== undefined && traceBl.children[0].pass === false, 'Blacklisted company: similarity child node pass should be false');
    console.log('Test Case 1 Passed.\n');
  } catch (e: any) {
    console.error('Test Case 1 Failed:', e.message);
    process.exit(1);
  }

  // --- Test Case 2: High Similarity, Not Blacklisted ---
  console.log('--- Test Case 2: High Similarity, Not Blacklisted ---');
  const userForGoodMatch: UserProfile = {
    id: 'user_with_good_resume', // Triggers good resume chunks in your mock
    name: 'Test User Good Match',
    email: 'testgm@example.com',
  };
  const goodMatchJob: JobListing = {
    id: 'job_gm_1',
    title: 'Senior Developer',
    company: 'Great Startup', // Not blacklisted for this user by mock
    description: 'A great job requiring skills (good_match_job_description).',
    url: 'http://greatstartup.jobs/dev',
  };

  try {
    const resultGoodMatch = await scoreJob(userForGoodMatch, goodMatchJob);
    const { score: scoreGm, trace: traceGm } = resultGoodMatch;

    assert(scoreGm.blacklisted === false, 'Good match: score.blacklisted should be false');
    // Based on your mocks:
    // getEmbedding("good_match_job_description") -> Array(768).fill(0.5)
    // fetchSimilarResumeChunks for 'user_with_good_resume' with job embedding[0] = 0.5
    //   -> will return a chunk with embedding Array(768).fill(0.5 + 0.3) = Array(768).fill(0.8)
    // cosineSimilarity between vectors filled with 0.5 and 0.8 respectively will be 1.0
    const epsilon = 0.00001; // A small tolerance for floating point comparison
    assert(Math.abs(scoreGm.similarity - 1.0) < epsilon, `Good match: score.similarity (${scoreGm.similarity}) should be close to 1.0`);
    assert(Math.abs(scoreGm.confidence - 1.0) < epsilon, `Good match: score.confidence (${scoreGm.confidence}) should be close to 1.0`);

    assert(traceGm.title === 'Is company blacklisted?', 'Good match: trace title correct');
    assert(traceGm.pass === true, 'Good match: trace.pass should be true at root');
    assert(traceGm.children !== undefined, 'Good match: trace should have children');
    assert(traceGm.children![0].title === `Similarity > ${SIMILARITY_THRESHOLD}`, 'Good match: child node title correct');
    assert(traceGm.children![0].pass === true, `Good match: child node pass should be true (1.0 >= ${SIMILARITY_THRESHOLD})`);
    console.log('Test Case 2 Passed.\n');
  } catch (e: any) {
    console.error('Test Case 2 Failed:', e.message);
    process.exit(1);
  }

  console.log('All tests passed successfully!');
}

runTests().catch(err => {
  console.error("Error running tests:", err);
  process.exit(1);
}); 