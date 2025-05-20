import { Page, BrowserContext } from "playwright";
import {
  UserProfile,
  JobListing,
  Answer,
  ApplicationStatus,
} from "../src/shared/types.ts";
import { ensureSession, isCheckpoint } from "./session.ts";
import { supabase } from "../src/lib/supabaseClient.ts";
import debug from "debug";

const GLOBAL_APPLICATION_TIMEOUT = 45000; // 45 seconds
const SHORT_DELAY_MIN = 50;
const SHORT_DELAY_MAX = 200;

function randomDelay(
  min: number = SHORT_DELAY_MIN,
  max: number = SHORT_DELAY_MAX
): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
  );
}
const log = debug("jobbot:apply");

export function normalizeQuestionText(text: string): string {
  if (!text) return "";
  let normalized = text.replace(/Required$/, "").trim();
  normalized = normalized.replace(/\s\s+/g, " "); // Standardize multiple spaces/newlines

  // Heuristically detect and remove duplicated question text
  // This is a simple approach; more complex patterns might need a more robust solution
  const halfLen = Math.floor(normalized.length / 2);
  if (
    normalized.length > 10 &&
    normalized.substring(0, halfLen).trim() ===
      normalized.substring(halfLen).trim()
  ) {
    normalized = normalized.substring(0, halfLen).trim();
  }
  // Remove trailing non-alphanumeric characters like '*' or '?' if they are not part of a sentence.
  normalized = normalized.replace(/[^a-zA-Z0-9]\s*$/, "");
  return normalized.trim();
}

export async function applyToJob(
  user: UserProfile,
  job: JobListing,
  answers: Answer[],
  resumePath: string,
  coverLetterPath?: string,
  options?: { dryRunStopBeforeSubmit?: boolean }
): Promise<"submitted" | "error" | "dry_run_complete"> {
  log(
    `Starting application for job: ${job.title} (${job.id}) for user ${user.id}`
  );
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let applicationOutcome: "submitted" | "error" | "dry_run_complete" = "error";
  let errorMessage: string | null = null;
  let supabaseStatus: ApplicationStatus = "error"; // Default to error for DB

  const applicationTimeoutPromise = new Promise<"timeout_error">((resolve) =>
    setTimeout(() => resolve("timeout_error"), GLOBAL_APPLICATION_TIMEOUT)
  );

  try {
    const operationPromise = (async () => {
      context = await ensureSession();
      if (!context) {
        errorMessage = "Failed to ensure Playwright session.";
        log(errorMessage);
        return "error_early_exit";
      }
      page = await context.newPage();
      try {
        await page.goto(job.url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
      } catch (e: any) {
        errorMessage = `Failed to navigate to job URL ${job.url}: ${e.message}`;
        log(errorMessage);
        supabaseStatus = "error_navigating"; // Specific status for this failure
        return "error_early_exit"; // Exit gracefully for this job
      }

      if (isCheckpoint(page.url())) {
        log(
          "Checkpoint detected on job page load. Pausing and notifying user."
        );
        // Notify the main process to show the CAPTCHA modal
        // In Electron context this will be available
        if (typeof window !== "undefined" && window.electronAPI) {
          await window.electronAPI.captchaNeeded();
        }
        throw new Error(
          "LinkedIn checkpoint detected. Manual intervention required."
        );
      }
      await randomDelay(2000, 2000); // Fixed 2s delay after navigation

      log(`Navigated to job page: ${job.url}`);

      const easyApplyButton = page
        .getByRole("button", { name: /Easy Apply/i })
        .first();
      await easyApplyButton.waitFor({ state: "visible", timeout: 20000 });
      await easyApplyButton.click();
      log('Clicked "Easy Apply" button.');

      const modalDialog = page.locator('div[role="dialog"]');
      await modalDialog.waitFor({ state: "visible", timeout: 10000 });
      log("Easy Apply modal is visible.");

      // --- Check if a cover letter upload field exists anywhere in the modal upfront ---
      let coverLetterFieldExists = false;
      if (coverLetterPath) {
        // Only bother checking if a cover letter is provided to the function
        const coverLetterSelectors = [
          'input[type="file"][aria-label*="cover letter" i]',
          'input[type="file"][id*="cover-letter" i]',
          'input[type="file"][name*="cover-letter" i]',
          'input[type="file"][aria-label*="coverletter" i]',
          'input[type="file"][id*="coverletter" i]',
          'input[type="file"][name*="coverletter" i]',
          'input[type="file"][placeholder*="cover letter" i]', // Added placeholder check
        ].join(",");
        const clInputsCheck = await modalDialog
          .locator(coverLetterSelectors)
          .all();

        for (const input of clInputsCheck) {
          if (await input.isVisible({ timeout: 1000 })) {
            coverLetterFieldExists = true;
            log("Cover letter upload field found in modal.");
            break;
          }
        }
        if (!coverLetterFieldExists) {
          log(
            "No visible cover letter upload field found in modal, will not attempt to upload cover letter."
          );
        }
      }
      // --- End cover letter field check ---

      let currentStep = 0;
      const MAX_STEPS = 10;

      while (currentStep < MAX_STEPS) {
        log(`Processing step ${currentStep + 1}`);
        await randomDelay();

        if (
          await page
            .locator("text=/application submitted/i")
            .isVisible({ timeout: 1000 })
        ) {
          log("Application submitted banner detected during step processing.");
          applicationOutcome = "submitted";
          supabaseStatus = "applied";
          return "success_exit";
        }

        const labels = await modalDialog.locator("label").all();
        for (const labelLocator of labels) {
          const rawLabelText = (await labelLocator.textContent()) || "";
          log(`Label found: "${rawLabelText}"`);
        }

        const legends = await modalDialog.locator("legend").all();
        for (const legendLocator of legends) {
          const legendText = (await legendLocator.textContent()) || "";
          log(`Legend found: "${legendText}"`);
        }

        for (const labelLocator of labels) {
          const rawLabelText = (await labelLocator.textContent()) || "";
          const normalizedLabelText = normalizeQuestionText(rawLabelText);

          if (
            !normalizedLabelText ||
            normalizedLabelText.toLowerCase().startsWith("deselect resume") ||
            normalizedLabelText.toLowerCase().startsWith("change resume")
          ) {
            log(`Skipping non-question or ignored label: "${rawLabelText}"`);
            continue;
          }

          // Attempt to find associated input/select/textarea directly
          let associatedInput = labelLocator
            .locator(
              "xpath=following-sibling::input | following-sibling::textarea | following-sibling::select"
            )
            .first();
          if (!(await associatedInput.isVisible({ timeout: 500 }))) {
            const forAttr = await labelLocator.getAttribute("for");
            if (forAttr) {
              associatedInput = modalDialog
                .locator(`[id="${forAttr}"]`)
                .first();
            }
          }

          let actualQuestionText = normalizedLabelText;
          let isChoiceGroup = false;

          if (!(await associatedInput.isVisible({ timeout: 500 }))) {
            // Potential choice group or complex structure. Try to find fieldset/legend.
            const fieldset = labelLocator.locator("xpath=ancestor::fieldset");
            if (await fieldset.isVisible({ timeout: 500 })) {
              const legend = fieldset.locator("legend").first();
              if (await legend.isVisible({ timeout: 500 })) {
                const legendText = (await legend.textContent()) || "";
                if (legendText) {
                  actualQuestionText = normalizeQuestionText(legendText);
                  isChoiceGroup = true;
                  log(
                    `Choice group detected. Question: "${actualQuestionText}", Option Label: "${normalizedLabelText}"`
                  );
                }
              }
            }
            // If still no input and not clearly part of a fieldset/legend, it might be an option label itself for radio/checkbox
            // or a label for a custom component we can't easily identify.
            if (!isChoiceGroup) {
              // This label might be for a radio button or checkbox directly.
              // The `actualQuestionText` will be the option's text (e.g. "Yes")
              // And we'll need to find the *group's* question text later if we proceed.
            }
          } else {
            // Standard input, actualQuestionText is likely the label text itself
            log(`Found standard input for question: "${actualQuestionText}"`);
          }

          const answerFromConfig = answers.find((a) => {
            const normA = normalizeQuestionText(a.question);
            return (
              normA &&
              actualQuestionText &&
              (actualQuestionText.toLowerCase().includes(normA.toLowerCase()) ||
                normA.toLowerCase().includes(actualQuestionText.toLowerCase()))
            );
          });

          if (await associatedInput.isVisible({ timeout: 500 })) {
            // Standard inputs
            const tagName = await associatedInput.evaluate((el) =>
              el.tagName.toLowerCase()
            );
            const isRequired =
              (await associatedInput.getAttribute("aria-required")) ===
                "true" ||
              (await associatedInput.getAttribute("required")) !== null;
            const currentValue = await associatedInput.inputValue();

            if (answerFromConfig) {
              log(
                `Found answer for "${actualQuestionText}": "${answerFromConfig.answer}"`
              );
              if (tagName === "input" || tagName === "textarea") {
                if (currentValue !== answerFromConfig.answer) {
                  await associatedInput.fill(answerFromConfig.answer);
                  log(
                    `Filled "${actualQuestionText}" with "${answerFromConfig.answer}"`
                  );
                } else {
                  log(
                    `Field "${actualQuestionText}" already has correct value.`
                  );
                }
              } else if (tagName === "select") {
                const options = await associatedInput.locator("option").all();
                let selected = false;
                for (const opt of options) {
                  const optValue = await opt.getAttribute("value");
                  const optText = await opt.textContent();
                  if (
                    (optValue &&
                      optValue
                        .toLowerCase()
                        .includes(answerFromConfig.answer.toLowerCase())) ||
                    (optText &&
                      optText
                        .toLowerCase()
                        .includes(answerFromConfig.answer.toLowerCase()))
                  ) {
                    await associatedInput.selectOption({
                      value: optValue || optText!,
                    });
                    log(
                      `Selected option for "${actualQuestionText}" matching "${answerFromConfig.answer}"`
                    );
                    selected = true;
                    break;
                  }
                }
                if (!selected && isRequired) {
                  errorMessage = `Required select "${actualQuestionText}" - no matching option for answer "${answerFromConfig.answer}".`;
                  log(errorMessage);
                  return "error_exit";
                } else if (!selected) {
                  log(
                    `Optional select "${actualQuestionText}" - no matching option for "${answerFromConfig.answer}". Skipping.`
                  );
                }
              }
            } else {
              // No answer in config
              if (!isRequired) {
                log(
                  `Optional field "${actualQuestionText}" has no configured answer. Skipping.`
                );
              } else if (currentValue && currentValue.trim() !== "") {
                log(
                  `Required field "${actualQuestionText}" has no configured answer but is pre-filled with "${currentValue}". Assuming OK.`
                );
              } else {
                errorMessage = `Required field "${actualQuestionText}" has no configured answer and is not pre-filled.`;
                log(errorMessage);
                return "error_exit";
              }
            }
          } else {
            // This block is reached if associatedInput is NOT visible.
            // Now determine if it's a choice group or unhandled.
            if (isChoiceGroup) {
              // This is the complex choice logic section
              // `actualQuestionText` is the legend/group question, `normalizedLabelText` is the option's label.
              const groupQuestionText = actualQuestionText;
              const optionLabelText = normalizedLabelText;

              // The following `if (!isChoiceGroup)` block was logically problematic as it was
              // nested inside `if (isChoiceGroup)`. The logic to find `groupQuestionText` when
              // `isChoiceGroup` is initially false (i.e., not detected via fieldset/legend)
              // should be handled differently, perhaps by trying to find a group question
              // before this `else` block, or by restructuring how `isChoiceGroup` is determined.
              // For now, the inner `if (!isChoiceGroup)` is removed as it would not execute.
              // The `groupQuestionText` will be what `actualQuestionText` was (legend or option text itself if no legend).

              log(
                `Choice option. Group Question (from legend or assumed): "${groupQuestionText}", Option Label: "${optionLabelText}"`
              );

              const choiceAnswerFromConfig = answers.find((a) => {
                const normGroupQ = normalizeQuestionText(a.question);
                // Ensure groupQuestionText is not empty before comparing
                return (
                  normGroupQ &&
                  groupQuestionText &&
                  (groupQuestionText
                    .toLowerCase()
                    .includes(normGroupQ.toLowerCase()) ||
                    normGroupQ
                      .toLowerCase()
                      .includes(groupQuestionText.toLowerCase()))
                );
              });

              if (
                choiceAnswerFromConfig &&
                choiceAnswerFromConfig.answer.toLowerCase() ===
                  optionLabelText.toLowerCase()
              ) {
                log(
                  `Found configured answer for choice group "${groupQuestionText}": select option "${optionLabelText}"`
                );

                let interacted = false;
                // Gender Special Case
                if (
                  groupQuestionText
                    .toLowerCase()
                    .startsWith("i identify my gender as") &&
                  optionLabelText.toLowerCase() === "male"
                ) {
                  try {
                    const genderGroup = modalDialog.getByRole("group", {
                      name: /I identify my gender as/i,
                    });
                    if (await genderGroup.isVisible({ timeout: 1000 })) {
                      const firstOptionDiv = genderGroup.locator("div").first(); // Assuming "Male" is the first div
                      if (await firstOptionDiv.isVisible({ timeout: 500 })) {
                        await firstOptionDiv.click({ force: true });
                        log(
                          'Clicked gender special case: "Male" (first div in group)'
                        );
                        interacted = true;
                      }
                    }
                  } catch (e: any) {
                    log(
                      `Gender special case selector failed, falling back. Error: ${e.message}`
                    );
                  }
                }

                if (!interacted) {
                  // General Choice Interaction Logic
                  // 1. Try modalDialog.getByLabel(optionLabelText, { exact: false })
                  try {
                    const choiceInputByLabel = modalDialog.getByLabel(
                      optionLabelText,
                      { exact: false }
                    );
                    if (
                      (await choiceInputByLabel.isVisible({ timeout: 500 })) &&
                      ((await choiceInputByLabel.getAttribute("type")) ===
                        "radio" ||
                        (await choiceInputByLabel.getAttribute("type")) ===
                          "checkbox")
                    ) {
                      await choiceInputByLabel.check({ force: true });
                      log(`Checked choice by getByLabel: "${optionLabelText}"`);
                      interacted = true;
                    }
                  } catch (e: any) {
                    log(
                      `getByLabel for "${optionLabelText}" failed. Error: ${e.message}`
                    );
                  }

                  // 2. Try by 'for' attribute
                  if (!interacted) {
                    const forAttr = await labelLocator.getAttribute("for");
                    if (forAttr) {
                      try {
                        const inputById = modalDialog.locator(
                          `input#${forAttr}`
                        );
                        if (
                          (await inputById.isVisible({ timeout: 500 })) &&
                          ((await inputById.getAttribute("type")) === "radio" ||
                            (await inputById.getAttribute("type")) ===
                              "checkbox")
                        ) {
                          await inputById.check({ force: true });
                          log(
                            `Checked choice by for-attribute: "${optionLabelText}" (for=${forAttr})`
                          );
                          interacted = true;
                        }
                      } catch (e: any) {
                        log(
                          `Choice by for-attr for "${optionLabelText}" failed. Error: ${e.message}`
                        );
                      }
                    }
                  }

                  // 3. Try input inside label
                  if (!interacted) {
                    try {
                      const inputInsideLabel = labelLocator
                        .locator('input[type="radio"], input[type="checkbox"]')
                        .first();
                      if (await inputInsideLabel.isVisible({ timeout: 500 })) {
                        await inputInsideLabel.check({ force: true });
                        log(
                          `Checked choice by input inside label: "${optionLabelText}"`
                        );
                        interacted = true;
                      }
                    } catch (e: any) {
                      log(
                        `Input inside label for "${optionLabelText}" failed. Error: ${e.message}`
                      );
                    }
                  }

                  // 4. Last resort: click the label itself
                  if (!interacted) {
                    try {
                      await labelLocator.click({ force: true });
                      log(
                        `Clicked label as last resort for choice: "${optionLabelText}"`
                      );
                      interacted = true; // Assume it worked, verification is hard here.
                    } catch (e: any) {
                      log(
                        `Clicking label for "${optionLabelText}" failed. Error: ${e.message}`
                      );
                      errorMessage = `Failed to interact with choice option "${optionLabelText}" for question "${groupQuestionText}".`;
                      // Potentially error out if this was required. For now, just log.
                    }
                  }
                }
                if (!interacted) {
                  log(
                    `Could not interact with choice option "${optionLabelText}" for "${groupQuestionText}" despite matching config.`
                  );
                  // This could be an error if the question is implicitly required.
                }
              } else if (choiceAnswerFromConfig) {
                log(
                  `Skipping choice option "${optionLabelText}" as it does not match configured answer "${choiceAnswerFromConfig?.answer}" for group "${groupQuestionText}".`
                );
              } else {
                // No answer config for this groupQuestionText. It might be a group we don't have an answer for, or it's not a question we're targeting.
                log(
                  `No configured answer for choice group "${groupQuestionText}". Current option label: "${optionLabelText}". Skipping.`
                );
              }
            } else {
              // It's not a standard input AND not a recognized choice group
              log(
                `Skipping label "${normalizedLabelText}" as no standard input found and not identified as a choice group component.`
              );
            }
          }
          await randomDelay();
        } // End of labels loop

        // File Uploads
        log("Processing file uploads for this step.");
        // Resume
        const resumeInputs = await modalDialog
          .locator(
            'input[type="file"][aria-label*="resume" i], input[type="file"][id*="resume" i], input[type="file"][name*="resume" i], input[type="file"][accept*="pdf"][aria-label*="upload" i]'
          )
          .all();
        let resumeUploadedThisStep = false;
        for (const resumeInput of resumeInputs) {
          if (await resumeInput.isVisible({ timeout: 1000 })) {
            const currentVal = await resumeInput.inputValue();
            if (!currentVal) {
              // Only upload if empty
              await resumeInput.setInputFiles(resumePath);
              log(`Uploaded resume to an input field. Path: ${resumePath}`);
              resumeUploadedThisStep = true;
              await randomDelay();
              break;
            } else {
              log(`Resume input field already has a value: ${currentVal}`);
            }
          }
        }
        if (!resumeUploadedThisStep && resumeInputs.length > 0) {
          log(
            "Resume input found but was already filled or not interacted with."
          );
        } else if (resumeInputs.length === 0) {
          log("No resume input field found on this step.");
        }

        // Cover Letter
        if (coverLetterPath && coverLetterFieldExists) {
          // Modified condition
          const coverLetterSelectorsRuntime = [
            'input[type="file"][aria-label*="cover letter" i]',
            'input[type="file"][id*="cover-letter" i]',
            'input[type="file"][name*="cover-letter" i]',
            'input[type="file"][aria-label*="coverletter" i]',
            'input[type="file"][id*="coverletter" i]',
            'input[type="file"][name*="coverletter" i]',
            'input[type="file"][placeholder*="cover letter" i]',
          ].join(",");
          const clInputs = await modalDialog
            .locator(coverLetterSelectorsRuntime)
            .all();
          let clUploadedThisStep = false;
          for (const clInput of clInputs) {
            if (await clInput.isVisible({ timeout: 1000 })) {
              const currentVal = await clInput.inputValue();
              if (!currentVal) {
                await clInput.setInputFiles(coverLetterPath);
                log(
                  `Uploaded cover letter to an input field. Path: ${coverLetterPath}`
                );
                clUploadedThisStep = true;
                await randomDelay();
                break;
              } else {
                log(
                  `Cover letter input field already has a value: ${currentVal}`
                );
              }
            }
          }
          if (!clUploadedThisStep && clInputs.length > 0) {
            log(
              "Cover letter input found but was already filled or not interacted with."
            );
          } else if (clInputs.length === 0) {
            log(
              "No cover letter input field found on this step (or coverLetterPath not provided)."
            );
          }
        }

        // Navigation & Loop Control
        if (
          await page
            .locator("text=/application submitted/i")
            .isVisible({ timeout: 1000 })
        ) {
          log("Application submitted banner detected after processing step.");
          applicationOutcome = "submitted";
          supabaseStatus = "applied";
          return "success_exit";
        }

        const submitButton = modalDialog
          .getByRole("button", { name: /Submit application/i })
          .first(); // More specific
        const reviewButton = modalDialog
          .getByRole("button", { name: /Review application|Review/i })
          .first();
        const nextButton = modalDialog
          .getByRole("button", { name: /Next|Continue/i })
          .first();

        if (await submitButton.isVisible({ timeout: 500 })) {
          log("Submit button is visible. Breaking loop for final actions.");
          break;
        } else if (await reviewButton.isVisible({ timeout: 500 })) {
          log("Review button is visible. Clicking Review.");
          await reviewButton.click();
        } else if (await nextButton.isVisible({ timeout: 500 })) {
          log("Next button is visible. Clicking Next.");
          await nextButton.click();
        } else {
          errorMessage = `Reached a state with no clear next navigation (Next/Review/Submit not found) on step ${
            currentStep + 1
          }.`;
          log(errorMessage);
          // Check one last time for success before erroring out on navigation
          if (
            await page
              .locator("text=/application submitted/i")
              .isVisible({ timeout: 2000 })
          ) {
            log(
              "Application submitted banner detected before navigation error."
            );
            applicationOutcome = "submitted";
            supabaseStatus = "applied";
            return "success_exit";
          }
          return "error_exit";
        }

        currentStep++;
        await page.waitForLoadState("domcontentloaded", { timeout: 10000 }); // Wait for next step to load
        await randomDelay(500, 1000); // थोड़ा और समय दें
      } // End of while loop for steps

      if (currentStep >= MAX_STEPS) {
        errorMessage = `Exceeded maximum steps (${MAX_STEPS}).`;
        log(errorMessage);
        // Check for submitted banner even if max steps reached
        if (
          await page
            .locator("text=/application submitted/i")
            .isVisible({ timeout: 2000 })
        ) {
          applicationOutcome = "submitted";
          supabaseStatus = "applied";
          return "success_exit";
        }
        return "error_exit";
      }

      // Post-Loop Actions
      log("Exited form step loop. Performing post-loop actions.");

      // Handle "Follow Company" Checkbox
      // Using a more general approach since the ID might vary or not exist.
      const followCheckboxTextHint = modalDialog
        .getByText(/Follow .* to stay up/i)
        .first(); // Find by partial text
      if (await followCheckboxTextHint.isVisible({ timeout: 2000 })) {
        // Try to find a checkbox near this text. This is heuristic.
        // Option 1: Checkbox is an ancestor or sibling of the text's container.
        // Option 2: Checkbox has an aria-labelledby pointing to an element containing this text.
        // For simplicity, we'll try to find a checkbox that seems related.
        const potentialFollowCheckbox = modalDialog
          .locator(
            'input[type="checkbox"][id*="follow"], input[type="checkbox"][name*="follow"]'
          )
          .first();

        if (
          (await potentialFollowCheckbox.isVisible({ timeout: 1000 })) &&
          (await potentialFollowCheckbox.isChecked())
        ) {
          log('Attempting to uncheck "Follow Company" checkbox.');
          // Click the text associated with it, or the checkbox itself if text click is unreliable.
          // Prefer text click as it's usually what users do.
          const clickableTextElement =
            await followCheckboxTextHint.elementHandle();
          if (clickableTextElement) {
            await clickableTextElement.click({ force: true });
            log('Clicked text near "Follow Company" checkbox to uncheck.');
            await randomDelay();
            if (await potentialFollowCheckbox.isChecked()) {
              log(
                "Follow company checkbox still checked after text click. Trying to click checkbox directly."
              );
              await potentialFollowCheckbox.uncheck({ force: true });
            }
          } else {
            await potentialFollowCheckbox.uncheck({ force: true }); // Fallback to direct uncheck
          }

          if (!(await potentialFollowCheckbox.isChecked())) {
            log('"Follow Company" checkbox successfully unchecked.');
          } else {
            log('Failed to uncheck "Follow Company" checkbox.');
          }
        } else if (
          (await potentialFollowCheckbox.isVisible({ timeout: 500 })) &&
          !(await potentialFollowCheckbox.isChecked())
        ) {
          log('"Follow Company" checkbox found and is already unchecked.');
        } else {
          log(
            '"Follow Company" checkbox or its text not clearly identified on this page.'
          );
        }
      } else {
        log('Could not find text hint for "Follow Company" checkbox.');
      }
      await randomDelay();

      // Final Submission Logic
      if (
        await page
          .locator("text=/application submitted/i")
          .isVisible({ timeout: 2000 })
      ) {
        log(
          "Application already submitted (checked before final submit action)."
        );
        applicationOutcome = "submitted";
        supabaseStatus = "applied";
        return "success_exit";
      }

      const finalSubmitButton = modalDialog
        .getByRole("button", { name: /Submit application/i })
        .first(); // Re-locate
      if (await finalSubmitButton.isVisible({ timeout: 5000 })) {
        // Increased timeout for final submit button
        if (options?.dryRunStopBeforeSubmit) {
          log("DRY RUN: Stopping before final submission.");
          applicationOutcome = "dry_run_complete";
          supabaseStatus = "not_applied"; // Or 'pending_manual_submission'
          // Don't close page in dry run for inspection
          return "dry_run_success_exit";
        } else {
          // THIS IS THE ACTUAL SUBMIT CLICK
          log("Attempting final submission click.");
          await finalSubmitButton.click();
          await randomDelay(1000, 2000); // Wait a bit for submission to process

          // Wait for "Application submitted" banner
          const successBanner = page.locator("text=/application submitted/i");
          try {
            await successBanner.waitFor({ state: "visible", timeout: 15000 }); // Generous timeout for submission confirmation
            log("Application submission successful (banner confirmed).");
            applicationOutcome = "submitted";
            supabaseStatus = "applied";
            return "success_exit";
          } catch (e) {
            errorMessage =
              "Application submitted, but confirmation banner not found within timeout.";
            log(errorMessage);
            // It might have submitted successfully anyway. Consider this a success with a warning.
            // For now, let's be conservative and mark as error if banner not seen.
            // However, if the modal is gone, it's a good sign.
            if (!(await modalDialog.isVisible({ timeout: 1000 }))) {
              log(
                "Modal is gone after submit click, assuming successful submission despite no banner."
              );
              applicationOutcome = "submitted";
              supabaseStatus = "applied";
              return "success_exit";
            }
            applicationOutcome = "error"; // Keep as error if banner not found and modal still there
            supabaseStatus = "error";
            return "error_exit";
          }
        }
      } else if (applicationOutcome === "error") {
        // If submit button not visible and we are in an error state
        errorMessage =
          "Submit button not found on the final page, and application not detected as submitted.";
        log(errorMessage);
        // Double check if modal closed, implying success
        if (!(await modalDialog.isVisible({ timeout: 2000 }))) {
          log(
            "Submit button not found, but modal is gone. This might be an implicit submission (e.g. after review). Checking for global success message."
          );
          // Check for success message outside the modal, on the main page
          if (
            (await page
              .locator('body:has-text("Your application was sent")')
              .isVisible({ timeout: 3000 })) ||
            (await page
              .locator("text=/application submitted/i")
              .isVisible({ timeout: 3000 }))
          ) {
            // Check again on whole page
            log("Global success message found. Marking as submitted.");
            applicationOutcome = "submitted";
            supabaseStatus = "applied";
            return "success_exit";
          }
        }
        applicationOutcome = "error";
        supabaseStatus = "error";
        return "error_exit";
      }
      return "no_action_exit"; // Should not be reached if logic is correct
    })(); // End of operationPromise

    const result = await Promise.race([
      operationPromise,
      applicationTimeoutPromise,
    ]);

    if (result === "timeout_error") {
      errorMessage = `Application process timed out after ${
        GLOBAL_APPLICATION_TIMEOUT / 1000
      } seconds.`;
      log(errorMessage);
      applicationOutcome = "error";
      supabaseStatus = "error";
    } else if (result === "error_early_exit" || result === "error_exit") {
      applicationOutcome = "error"; // errorMessage should already be set
      supabaseStatus = "error";
    } else if (result === "dry_run_success_exit") {
      applicationOutcome = "dry_run_complete";
      supabaseStatus = "not_applied";
    } else if (result === "success_exit") {
      applicationOutcome = "submitted";
      supabaseStatus = "applied";
    }
    // 'no_action_exit' should ideally not occur. If it does, it implies a logic flaw.
    // It will default to 'error' or whatever applicationOutcome was last set to.
  } catch (e: any) {
    errorMessage = `Unhandled exception during applyToJob: ${e.message}`;
    log(errorMessage, e.stack);
    applicationOutcome = "error";
    supabaseStatus = "error";
  } finally {
    log(
      `Finalizing application. Outcome: ${applicationOutcome}, Supabase Status: ${supabaseStatus}, Error: ${
        errorMessage || "None"
      }`
    );

    // Database Update
    if (job.id && user.id) {
      const updateData: any = {
        status: supabaseStatus,
        reason: null, // Default to null
        updated_at: new Date().toISOString(),
      };

      // Set reason only if it's an error state
      const errorStates: ApplicationStatus[] = ["error", "error_navigating"];
      if (errorStates.includes(supabaseStatus as ApplicationStatus)) {
        updateData.reason = errorMessage || "Unknown error";
      }

      if (supabaseStatus === "applied") {
        updateData.applied_at = new Date().toISOString();
      }

      const { error: dbError } = await supabase
        .from("job_applications")
        .update(updateData)
        .match({ job_id: job.id, user_id: user.id });

      if (dbError) {
        log(`Error updating Supabase job_applications table: ${dbError}`);
        // Don't override the applicationOutcome based on DB error, but log it.
      } else {
        log("Successfully updated Supabase job_applications table.");
      }
    } else {
      log("Skipping Supabase update due to missing job.id or user.id.");
    }

    if (page && applicationOutcome !== "dry_run_complete") {
      try {
        await page.close();
        log("Page closed.");
      } catch (closeError: any) {
        log("Error closing page:", closeError.message);
      }
    } else if (page && applicationOutcome === "dry_run_complete") {
      log("Dry run complete. Page left open for inspection.");
    }

    // Context is managed by ensureSession, typically not closed here unless we created it ad-hoc
    // and ensureSession doesn't handle its lifecycle fully based on usage.
    // For now, assume ensureSession manages context closure if needed or reuses it.
    // if (context && applicationOutcome !== 'dry_run_complete') {
    //   try {
    //     await context.close();
    //     debug('jobot:apply', 'Browser context closed.');
    //   } catch (closeError:any) {
    //     debug('jobot:apply', 'Error closing context:', closeError.message);
    //   }
    // }
  }
  return applicationOutcome;
}
