// tests/test-ai-manual.ts
import { generateAnswers, generateCoverLetter } from '../agent/ai.js';
import type { UserProfile, JobListing } from '../src/shared/types.js'; // Path as corrected by user

// Ensure the debug logs from ai.ts are visible if needed
// You might need to set an environment variable like DEBUG=jobot:ai
// or temporarily modify the debug function in ai.ts to console.log directly during testing.

async function manualTest() {
  console.log('--- Starting Manual AI Generation Test ---');

  const me: UserProfile = {
    id: 'user123',
    name: 'Naim TestUser', // Using the name from your example for better heuristic testing
    email: 'naim@example.com',
  };

  const sampleJob: JobListing = {
    id: 'job456',
    title: 'AI Integration Specialist',
    company: 'Innovatech',
    description: 'Seeking an expert in integrating LLMs into existing software products. Experience with RAG pipelines and local model deployment (Ollama) is a plus. We value proactive problem solvers.',
    url: 'http://example.com/job456',
  };

  const questions = [
    'What makes you a good fit for Innovatech?',
    'Describe your experience with RAG pipelines.',
    'Why are you interested in the AI Integration Specialist role at Innovatech?'
  ];

  try {
    console.log('\n[Phase 1: Testing generateAnswers...]');
    const answers = await generateAnswers(me, sampleJob, questions);
    
    console.log('\n--- Generated Answers --- ');
    console.log(JSON.stringify(answers, null, 2));
    console.log('------------------------\n');

    let allAnswersPass = true;
    answers.forEach((ans, index) => {
      console.log(`Validating Answer ${index + 1} for question: "${ans.question}"`);
      let answerChecksPass = true;
      if (!(ans.answer.length > 20)) {
        console.error(`  [FAIL] Answer ${index + 1} length is not > 20. Length: ${ans.answer.length}`);
        answerChecksPass = false;
        allAnswersPass = false;
      } else {
        console.log(`  [PASS] Answer ${index + 1} length is > 20. Length: ${ans.answer.length}`);
      }

      if (!(ans.refs.length >= 1)) {
        console.error(`  [FAIL] Answer ${index + 1} refs is not >= 1. Refs: ${ans.refs.join(', ') || 'None'}`);
        answerChecksPass = false;
        allAnswersPass = false;
      } else {
        console.log(`  [PASS] Answer ${index + 1} refs is >= 1. Refs: ${ans.refs.join(', ')}`);
      }

      if (ans.answer.length > 400) {
         console.error(`  [FAIL] Answer ${index + 1} length EXCEEDS 400. Length: ${ans.answer.length}`);
         answerChecksPass = false;
         allAnswersPass = false;
      } else {
        console.log(`  [PASS] Answer ${index + 1} length is <= 400. Length: ${ans.answer.length}`);
      }
      if(!answerChecksPass) console.log(`  Full Answer ${index + 1}: ${ans.answer}`);
    });

    if(allAnswersPass) {
        console.log('\n[RESULT] All generateAnswers basic checks PASSED.');
    } else {
        console.error('\n[RESULT] Some generateAnswers basic checks FAILED.');
    }

    console.log('\n\n[Phase 2: Testing generateCoverLetter...]');
    const coverLetter = await generateCoverLetter(me, sampleJob);
    console.log('\n--- Generated Cover Letter --- ');
    console.log(coverLetter);
    console.log('----------------------------\n');

    let coverLetterPass = true;
    if (!(coverLetter.length > 20)) {
        console.error(`  [FAIL] Cover letter length is not > 20. Length: ${coverLetter.length}`);
        coverLetterPass = false;
    } else {
        console.log(`  [PASS] Cover letter length is > 20. Length: ${coverLetter.length}`);
    }

    if (!(coverLetter.length <= 2000)) {
        console.error(`  [FAIL] Cover letter length EXCEEDS 2000. Length: ${coverLetter.length}`);
        coverLetterPass = false;
    } else {
        console.log(`  [PASS] Cover letter length is <= 2000. Length: ${coverLetter.length}`);
    }

    if(coverLetterPass) {
        console.log('\n[RESULT] generateCoverLetter basic checks PASSED.');
    } else {
        console.error('\n[RESULT] generateCoverLetter basic checks FAILED.');
    }


  } catch (error) {
    console.error('\n--- Manual Test FAILED ---');
    if (error instanceof Error) {
        console.error('Error message:', error.message);
        if (error.stack) {
            console.error('Stacktrace:', error.stack);
        }
    } else {
        console.error('Unknown error object:', error);
    }
    process.exitCode = 1; // Indicate failure to the shell
  }
  console.log('\n--- Manual AI Generation Test Finished ---');
}

manualTest();
