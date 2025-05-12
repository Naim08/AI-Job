import { supabase } from '../src/lib/supabaseClient.js';
import { applyToJob, normalizeQuestionText } from '../agent/apply.js'
import { generateCoverLetter } from '../agent/ai.js'; // Added for cover letter generation
import { ensureSession } from '../agent/session.js'; // Added for needsCoverLetter
import { UserProfile, JobListing, Answer, UserProfileSettings } from '../src/shared/types.js';
import { debug } from '../electron/utils/debug.js'; // Assuming path from root
import fs from 'fs'; // Added for file system operations
import path from 'path'; // Added for path operations

// --- Test Configuration ---
//const LINKEDIN_JOB_URL = 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4151048701';
const LINKEDIN_JOB_URL = 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4217435213';
const USER_EMAIL_FOR_PROFILE_LOOKUP = 'mmiah@fordham.edu';
const RESUME_PATH = '../Miah_Naim_2025.pdf'; // IMPORTANT: Update this path
const OUTPUT_DIRECTORY = path.join(process.cwd(), 'test-output');
const GENERATED_COVER_LETTER_PDF_NAME = 'Miah_Naim_Cover_Letter.pdf';

// --- IMPORTANT: Define answers for ALL questions on the *specific* job form you are testing ---
// Use `normalizeQuestionText` on the questions you see in the LinkedIn modal to get the key.
const testAnswers: Answer[] = [
  // Example structure:
  // {
  //   question: normalizeQuestionText('Your work authorization status in the country for this role? Required'),
  //   answer: 'I am authorized to work in this country without requiring visa sponsorship now or in the future.',
  //   refs: [] // Assuming refs is part of Answer type if needed by applyToJob logic, though not used in core filling
  // },
];
// --- End Test Configuration ---

// Function to check if the job application has a cover letter field
async function needsCoverLetter(jobUrl: string): Promise<boolean> {
  debug('jobot:test:apply', 'Checking if job application needs a cover letter...');
  const context = await ensureSession();
  if (!context) {
    debug('jobot:test:apply', 'Failed to ensure session for needsCoverLetter check.');
    return false; // Or throw error, but for a check, returning false might be safer
  }
  const page = await context.newPage();
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const easyApplyButton = page.getByRole('button', { name: /Easy Apply/i }).first();
    await easyApplyButton.waitFor({ state: 'visible', timeout: 20000 });
    await easyApplyButton.click();
    
    const modalDialog = page.locator('div[role="dialog"]');
    await modalDialog.waitFor({ state: 'visible', timeout: 10000 });
    
    const coverLetterSelectors = [
      'input[type="file"][aria-label*="cover letter" i]',
      'input[type="file"][id*="cover-letter" i]',
      'input[type="file"][name*="cover-letter" i]',
      'input[type="file"][aria-label*="coverletter" i]',
      'input[type="file"][id*="coverletter" i]',
      'input[type="file"][name*="coverletter" i]',
      'input[type="file"][placeholder*="cover letter" i]'
    ].join(',');
    
    const inputs = await modalDialog.locator(coverLetterSelectors).all();
    for (const el of inputs) {
      if (await el.isVisible({ timeout: 1000 })) {
        debug('jobot:test:apply', 'Cover letter field found.');
        return true;
      }
    }
    debug('jobot:test:apply', 'No cover letter field found.');
    return false;
  } catch (error: any) {
    debug('jobot:test:apply', 'Error during needsCoverLetter check:', error.message);
    return false; // Assume no if error occurs during check
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
      await context.close();
    }
    // We don't close the context here as ensureSession manages it.
  }
}

async function manualInspectApply() {
  console.log('--- Starting Manual Inspection Test for applyToJob ---');
  debug('jobot:test:apply', 'Initiating manualInspectApply script.');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIRECTORY)){
    fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
    debug('jobot:test:apply', `Created output directory: ${OUTPUT_DIRECTORY}`);
  }
  const coverLetterOutputPath = path.join(OUTPUT_DIRECTORY, GENERATED_COVER_LETTER_PDF_NAME);

  if (!LINKEDIN_JOB_URL || 
      !USER_EMAIL_FOR_PROFILE_LOOKUP ||
      !RESUME_PATH) {
    console.error('FATAL ERROR: Critical test configurations (LINKEDIN_JOB_URL, USER_EMAIL_FOR_PROFILE_LOOKUP, RESUME_PATH) are not set. Please edit tests/apply.manual-inspect.ts');
    debug('jobot:test:apply', 'Test script not configured with essential parameters. Exiting.');
    process.exit(1);
  }
  if (testAnswers.length === 0) {
     console.warn('WARNING: The `testAnswers` array is empty. The script will likely fail or not fill any fields. Please configure it for the target job.');
     debug('jobot:test:apply', 'testAnswers array is empty.');
  }

  let userProfile: UserProfile | null = null;
  try {
    debug('jobot:test:apply', `Fetching user profile for email: ${USER_EMAIL_FOR_PROFILE_LOOKUP}`);
    const { data, error, status } = await supabase
      .from('profiles') // Supabase table name
      .select('id, full_name, email, avatar_url, settings, created_at, updated_at, resume_path') // Select fields matching UserProfile + full_name
      .eq('email', USER_EMAIL_FOR_PROFILE_LOOKUP)
      .single();

    if (error && status !== 406) { 
        throw error;
    }
    if (!data || !data.full_name) {
      throw new Error(`User profile not found or full_name is missing for email: ${USER_EMAIL_FOR_PROFILE_LOOKUP}`);
    }
    // Map Supabase data to UserProfile type
    userProfile = {
        id: data.id,
        name: data.full_name, // Map full_name to name
        email: data.email || USER_EMAIL_FOR_PROFILE_LOOKUP, // Fallback to lookup email if not in DB
        avatar_url: data.avatar_url,
        settings: data.settings as UserProfileSettings | null, // Cast settings
        created_at: data.created_at,
        updated_at: data.updated_at,
        resume_path: data.resume_path === null ? undefined : data.resume_path // Handle null for resume_path
    };
    debug('jobot:test:apply', `Successfully fetched and mapped user profile with id: ${userProfile.id}`);
  } catch (error: any) {
    console.error(`Error fetching user profile from Supabase: ${error.message}`);
    debug('jobot:test:apply', 'Error fetching user profile:', error.message);
    process.exit(1);
  }

  // Explicit check for userProfile before use, to satisfy TypeScript's control flow analysis
  if (!userProfile) {
    console.error('FATAL ERROR: UserProfile could not be loaded, cannot proceed.');
    debug('jobot:test:apply', 'UserProfile is null after fetch attempt, exiting.');
    process.exit(1);
  }

  // 2. Create a JobListing object for the test, conforming to shared/types.ts
  const testJobListing: JobListing = {
    id: `manual-test-${Date.now()}`,
    title: `Manual Test: ${(LINKEDIN_JOB_URL as string).substring(0, 50)}...`,
    company: 'Test Company Inc.',
    url: LINKEDIN_JOB_URL,
    description: 'This is a manual test job listing for applyToJob, conforming to shared JobListing type.',
    // keywords field is optional in JobListing type
  };

  debug('jobot:test:apply', 'Test job listing prepared:', { id: testJobListing.id, url: testJobListing.url });
  debug('jobot:test:apply', 'Using testAnswers:', testAnswers.map(a => ({q: a.question, a: a.answer})) ); // Log concisely
  debug('jobot:test:apply', `Resume path: ${RESUME_PATH}`);

  let finalCoverLetterPath: string | undefined = undefined;

  try {
    if (await needsCoverLetter(LINKEDIN_JOB_URL)) {
      debug('jobot:test:apply', 'Cover letter field detected for this job.');
      if (fs.existsSync(coverLetterOutputPath)) {
        finalCoverLetterPath = coverLetterOutputPath;
        debug('jobot:test:apply', `Using existing cover letter PDF: ${finalCoverLetterPath}`);
        console.log(`Using existing cover letter PDF: ${finalCoverLetterPath}`);
      } else {
        debug('jobot:test:apply', 'Generating new cover letter PDF as it does not exist...');
        const { text: coverLetterText, pdfPath } = await generateCoverLetter(userProfile, testJobListing, {
          savePdf: true,
          outputPath: coverLetterOutputPath
        });
        
        if (pdfPath) {
          finalCoverLetterPath = pdfPath;
          debug('jobot:test:apply', `New cover letter PDF generated: ${finalCoverLetterPath}`);
          console.log(`New cover letter PDF generated: ${finalCoverLetterPath}`);
          debug('jobot:test:apply', `Text (start): ${coverLetterText.substring(0,100)}...`);
        } else {
          debug('jobot:test:apply', 'generateCoverLetter did not return a pdfPath.');
        }
      }
    } else {
      debug('jobot:test:apply', 'No cover letter field detected for this job. Skipping cover letter generation/usage.');
      console.log('No cover letter field detected. Skipping cover letter.');
    }

    // 3. Call applyToJob
    debug('jobot:test:apply', 'Executing applyToJob with dryRunStopBeforeSubmit: true');
    const result = await applyToJob(
      userProfile, // Now TypeScript should be happy userProfile is not null
      testJobListing,
      testAnswers,
      RESUME_PATH,
      finalCoverLetterPath, // Use the path of the generated PDF cover letter
      { dryRunStopBeforeSubmit: true }
    );

    console.log(`\n=== applyToJob execution finished ===`);
    console.log(`Result: ${result}`);
    debug('jobot:test:apply', `applyToJob call completed. Result: ${result}`);

    if (result === 'dry_run_complete') {
      console.log('\nSUCCESS: \'dry_run_complete\'. The browser should remain open for your inspection.');
      console.log('Please manually verify the form fields, resume upload, and follow company checkbox state.');
      console.log('The script will keep running to allow inspection. Press Ctrl+C to terminate and close the browser (if Playwright launched it).');
      debug('jobot:test:apply', 'Dry run successful. Awaiting manual inspection. Process will self-terminate in 10 mins if not exited manually.');
      setTimeout(() => {
          debug('jobot:test:apply', 'Test script auto-terminating after inspection period.');
      }, 10 * 60 * 1000); // 10 minutes for inspection
    } else {
      console.error(`\nFAILURE: Expected 'dry_run_complete', but received '${result}'.`);
      console.error('Please check the console logs and debug output (search for jobot:apply and jobot:test:apply) for errors.');
      debug('jobot:test:apply', `Test failed. Expected 'dry_run_complete', got '${result}'.`);
    }
  } catch (e: any) {
    console.error('\nCRITICAL ERROR: An unexpected exception occurred during the applyToJob test execution:');
    console.error(e.message);
    if (e.stack) console.error(e.stack);
    debug('jobot:test:apply', 'Critical unexpected error in test script:', e.message, e.stack);
  } finally {
    if (finalCoverLetterPath && fs.existsSync(finalCoverLetterPath)) {
      // fs.unlinkSync(finalCoverLetterPath); // Keep the generated PDF
      debug('jobot:test:apply', `Generated cover letter PDF was NOT deleted: ${finalCoverLetterPath}`);
      console.log(`Generated cover letter PDF available at: ${finalCoverLetterPath}`);
    } else if (finalCoverLetterPath) {
      debug('jobot:test:apply', `Generated cover letter PDF was expected but not found at: ${finalCoverLetterPath}`);
    }
    // Removed process.exit from finally to allow inspection in dry_run_complete case
    if (process.env.NODE_ENV !== 'test_inspect') { // Example condition to exit in non-inspect mode
        // process.exit(0); // Or based on error state
    }
  }
}

// Execute the test function
manualInspectApply().catch(err => {
    console.error('Unhandled promise rejection in manualInspectApply:', err);
    debug('jobot:test:apply', 'Unhandled promise rejection in manualInspectApply:', err);
    // process.exit(1);
});

console.log('To run this test: node tests/apply.manual-inspect.js');
console.log('Ensure you have configured the constants at the top of the file first!'); 