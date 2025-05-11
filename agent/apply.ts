import { Page, BrowserContext } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { debug } from '../electron/utils/debug.js';
import { ensureSession } from './session.js';
import { UserProfile, JobListing, Answer } from '../src/shared/types.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function randomDelay() {
  return Math.floor(50 + Math.random() * 150);
}

async function updateJobStatus(
  jobId: string,
  userId: string,
  status: 'submitted' | 'error',
  reason?: string
) {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'submitted') {
    updates['applied_at'] = new Date().toISOString();
    updates['reason'] = null;
  } else {
    updates['reason'] = reason || 'Unknown error';
  }
  await supabase
    .from('job_applications')
    .update(updates)
    .eq('job_id', jobId)
    .eq('user_id', userId);
}

export async function applyToJob(
  user: UserProfile,
  job: JobListing,
  answers: Answer[],
  resumePath: string,
  coverLetterPath?: string
): Promise<'submitted' | 'error'> {
  const timeoutMs = 45_000;
  const start = Date.now();
  let page: Page | undefined;
  let context: BrowserContext | undefined;
  let status: 'submitted' | 'error' = 'error';
  let errorReason = '';
  try {
    context = await ensureSession();
    page = await context.newPage();
    debug('apply', 'Navigating to job application URL', job.url);
    await page.goto(job.url, { timeout: 15_000 });
    // Click Easy Apply
    const easyApplyBtn = page.locator('button:has-text("Easy Apply")');
    await easyApplyBtn.first().click({ timeout: 10_000 });
    await page.waitForSelector('[role=dialog]', { timeout: 10_000 });
    debug('apply', 'Easy Apply modal opened');
    // Step through modal
    let done = false;
    while (!done) {
      if (Date.now() - start > timeoutMs) {
        errorReason = 'Timeout exceeded';
        debug('apply', errorReason);
        break;
      }
      // Fill questions
      const questions = await page.locator('[role=dialog] label').all();
      for (const label of questions) {
        const labelText = (await label.textContent())?.trim() || '';
        if (!labelText) continue;
        const answerObj = answers.find(a => labelText.includes(a.question));
        const input = label.locator('textarea, input');
        const isRequired = (await label.getAttribute('aria-required')) !== 'false';
        if (!answerObj) {
          if (!isRequired) continue;
          errorReason = `Missing required answer for: ${labelText}`;
          debug('apply', errorReason);
          throw new Error(errorReason);
        }
        // Fill input
        const tag = await input.evaluate(el => el.tagName.toLowerCase());
        if (tag === 'input' || tag === 'textarea') {
          await input.fill(answerObj.answer);
        } else {
          // Dropdowns
          const select = label.locator('select');
          if (await select.count()) {
            const options = select.locator('option');
            const count = await options.count();
            let found = false;
            for (let i = 0; i < count; i++) {
              const optText = (await options.nth(i).textContent()) || '';
              if (optText.includes(answerObj.answer)) {
                await select.selectOption({ label: optText });
                found = true;
                break;
              }
            }
            if (!found) {
              errorReason = `Dropdown option not found for: ${labelText}`;
              debug('apply', errorReason);
              throw new Error(errorReason);
            }
          }
        }
        await page.waitForTimeout(randomDelay());
      }
      // Upload resume
      const resumeInput = page.locator('input[type=file][accept$=".pdf"]');
      if (await resumeInput.count()) {
        const files = await resumeInput.evaluate(el => (el as HTMLInputElement).files?.length ?? 0);
        if (!files) {
          await resumeInput.setInputFiles(resumePath);
          debug('apply', 'Resume uploaded');
          await page.waitForTimeout(randomDelay());
        }
      }
      // Upload cover letter
      if (coverLetterPath) {
        const coverInput = page.locator('input[type=file][accept$=".pdf"]').nth(1);
        if (await coverInput.count()) {
          const files = await coverInput.evaluate(el => (el as HTMLInputElement).files?.length ?? 0);
          if (!files) {
            await coverInput.setInputFiles(coverLetterPath);
            debug('apply', 'Cover letter uploaded');
            await page.waitForTimeout(randomDelay());
          }
        }
      }
      // Next/Submit
      const nextBtn = page.locator('[role=dialog] button:has-text("Next"), [role=dialog] button:has-text("Review"), [role=dialog] button:has-text("Submit")');
      if (await nextBtn.count()) {
        await nextBtn.first().click();
        await page.waitForTimeout(randomDelay());
      } else {
        done = true;
      }
      // Check for submission banner
      const submitted = await page.locator('text=/application submitted/i').isVisible({ timeout: 5000 }).catch(() => false);
      if (submitted) {
        status = 'submitted';
        debug('apply', 'Application submitted');
        done = true;
      }
    }
    if (status !== 'submitted' && !errorReason) {
      errorReason = 'Application not submitted';
      debug('apply', errorReason);
    }
  } catch (err) {
    errorReason = (err instanceof Error ? err.message : String(err)) || 'Unknown error';
    debug('apply', 'Error during application', errorReason);
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    await updateJobStatus(job.id, user.id, status, errorReason);
  }
  return status;
} 