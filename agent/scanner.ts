import { BrowserContext, Page } from "playwright";
import { UserProfile, JobListing } from "../src/shared/types.js";
import { ensureSession, isCheckpoint } from "./session.js";
import { scoreJob } from "./filter.js";
import { supabase } from "../src/lib/supabaseClient.js";
import debug from "debug";

const log = debug("jobbot:scanner");

export async function scanLinkedInJobs(user: UserProfile): Promise<void> {
  log(`Starting LinkedIn job scan for user ${user.id}`);

  // 1. Ensure Playwright session
  const context = await ensureSession();
  log("Browser session established");

  // 2. Pull keywords and locations from profile settings
  log(`Fetching profile settings for user ${user.id}`);
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("user_id", user.id)
    .single();

  if (profileError) {
    log(`Error fetching profile settings: ${profileError.message}`);
    await context.close();
    throw new Error(
      `Failed to fetch profile settings: ${profileError.message}`
    );
  }

  // Extract settings with defaults
  const settings = (profileData?.settings as Record<string, any>) || {};
  const userKeywords = settings.jobSearchKeywords as string[] | undefined;
  const userLocations = settings.jobSearchLocations as string[] | undefined;

  const keywords =
    userKeywords && userKeywords.length > 0
      ? userKeywords
      : ["Software Engineer"];
  const locations =
    userLocations && userLocations.length > 0 ? userLocations : ["Remote"];

  log(`Using keywords: ${keywords.join(", ")}`);
  log(`Using locations: ${locations.join(", ")}`);

  let totalProcessed = 0;
  const MAX_TOTAL_JOBS = 50; // Limit total inserts per scan

  try {
    // 3. For each keyword × location pair
    for (const keyword of keywords) {
      for (const location of locations) {
        if (totalProcessed >= MAX_TOTAL_JOBS) {
          log(`Reached maximum job limit (${MAX_TOTAL_JOBS}). Stopping scan.`);
          break;
        }

        log(`Searching for '${keyword}' in '${location}'`);
        const encodedKeyword = encodeURIComponent(keyword);
        const encodedLocation = encodeURIComponent(location);
        const url = `https://www.linkedin.com/jobs/search?keywords=${encodedKeyword}&location=${encodedLocation}&f_AL=true`;

        const page = await context.newPage();
        try {
          log(`Opening ${url}`);
          await page.goto(url, { waitUntil: "domcontentloaded" });
          if (isCheckpoint(page.url())) {
            log(
              "LinkedIn checkpoint detected. Pausing agent and notifying user."
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

          // 4. Wait for job results to load
          log("Waiting for job search results to render");
          await page.waitForSelector("div.scaffold-layout__list", {
            timeout: 20000,
          });

          // Ensure we have enough results by scrolling
          await ensureJobResults(page);

          // 5. Process each job card
          const jobCards = await page
            .locator("li.scaffold-layout__list-item")
            .all();
          log(`Found ${jobCards.length} job cards`);

          let processedInThisSearch = 0;
          for (const card of jobCards) {
            if (
              totalProcessed >= MAX_TOTAL_JOBS ||
              processedInThisSearch >= 25
            ) {
              break;
            }
            const cardDebugId =
              (await card.getAttribute("data-occludable-job-id")) ||
              `index-${processedInThisSearch}`;
            log(`[Card ${cardDebugId}] Starting processing.`);

            try {
              log(`[Card ${cardDebugId}] Checking for Easy Apply...`);
              const isEasyApply = await card
                .getByText("Easy Apply")
                .isVisible()
                .catch(() => false);
              log(`[Card ${cardDebugId}] Is Easy Apply: ${isEasyApply}`);
              if (!isEasyApply) {
                log(`[Card ${cardDebugId}] Skipping - not an Easy Apply job`);
                continue;
              }

              log(`[Card ${cardDebugId}] Extracting job ID...`);
              const jobId = await card.getAttribute("data-occludable-job-id");
              log(`[Card ${cardDebugId}] Job ID: ${jobId}`);
              if (!jobId) {
                log(
                  `[Card ${cardDebugId}] Skipping - could not find data-occludable-job-id on card`
                );
                continue;
              }

              log(`[Card ${cardDebugId}] Extracting title...`);
              const titleLinkElement = card
                .locator("a.job-card-list__title--link")
                .first();
              let title = await titleLinkElement.getAttribute("aria-label", {
                timeout: 5000,
              });
              if (!title || title.trim() === "") {
                log(
                  `[Card ${cardDebugId}] aria-label not found for title, trying textContent...`
                );
                title = await titleLinkElement.textContent({ timeout: 5000 });
              }
              title = title?.trim() || "Unknown Title";
              log(`[Card ${cardDebugId}] Title: ${title.substring(0, 50)}...`);

              log(`[Card ${cardDebugId}] Extracting company...`);
              const companySubtitleElement = card
                .locator("div.artdeco-entity-lockup__subtitle")
                .first();
              const company =
                (await companySubtitleElement
                  .textContent({ timeout: 10000 })
                  .catch(() => "Unknown Company")) || "Unknown Company";
              log(
                `[Card ${cardDebugId}] Company: ${company.substring(0, 50)}...`
              );

              // log(`[Card ${cardDebugId}] Pausing to inspect card for location. Type playwright.resume() in browser console to continue.`);
              // await page.pause();

              log(
                `[Card ${cardDebugId}] Extracting location text from card...`
              );
              let locationText = "";
              try {
                const metadataListItems = await card
                  .locator(".job-card-container__metadata-wrapper > li")
                  .all();

                if (metadataListItems.length > 0) {
                  log(
                    `[Card ${cardDebugId}] Found ${metadataListItems.length} item(s) in card\'s metadata list using '.job-card-container__metadata-wrapper > li'.`
                  );
                  const texts = [];
                  for (const item of metadataListItems) {
                    const itemText = await item.textContent({ timeout: 2000 });
                    if (itemText) {
                      texts.push(itemText.trim());
                    }
                  }
                  locationText = texts.join(" ").trim();
                  if (locationText) {
                    log(
                      `[Card ${cardDebugId}] Location from '.job-card-container__metadata-wrapper > li': ${locationText.substring(
                        0,
                        50
                      )}...`
                    );
                  } else {
                    log(
                      `[Card ${cardDebugId}] '.job-card-container__metadata-wrapper > li' yielded no text.`
                    );
                  }
                } else {
                  log(
                    `[Card ${cardDebugId}] No list items found with selector '.job-card-container__metadata-wrapper > li'. Trying fallback: 'span.job-card-container__metadata-item'.`
                  );
                }

                // Fallback if primary selector failed or yielded no text
                if (!locationText) {
                  const metadataSpans = await card
                    .locator("span.job-card-container__metadata-item")
                    .all();
                  if (metadataSpans.length > 0) {
                    log(
                      `[Card ${cardDebugId}] Found ${metadataSpans.length} span(s) with class 'job-card-container__metadata-item'.`
                    );
                    for (const span of metadataSpans) {
                      const spanText = await span.textContent({
                        timeout: 2000,
                      });
                      const trimmedText = spanText?.trim();
                      if (
                        trimmedText &&
                        !trimmedText.toLowerCase().includes("easy apply") &&
                        trimmedText.length > 1
                      ) {
                        locationText = trimmedText;
                        log(
                          `[Card ${cardDebugId}] Location from 'span.job-card-container__metadata-item': ${locationText.substring(
                            0,
                            50
                          )}...`
                        );
                        break; // Use the first valid one
                      }
                    }
                    if (!locationText) {
                      log(
                        `[Card ${cardDebugId}] 'span.job-card-container__metadata-item' yielded no suitable location text after filtering.`
                      );
                    }
                  } else {
                    log(
                      `[Card ${cardDebugId}] No spans found with selector 'span.job-card-container__metadata-item'.`
                    );
                  }
                }
              } catch (e: any) {
                log(
                  `[Card ${cardDebugId}] Error extracting location from card: ${e.message}`
                );
              }

              if (!locationText) {
                log(
                  `[Card ${cardDebugId}] Location could not be determined. Defaulting to 'Unknown Location'.`
                );
                locationText = "Unknown Location";
              }

              log(
                `[Card ${cardDebugId}] Final Location text for card: ${locationText.substring(
                  0,
                  50
                )}...`
              );

              log(`[Card ${cardDebugId}] Locating clickable card area...`);
              const clickableCardArea = card.locator(
                "div.job-card-container--clickable"
              );
              log(
                `[Card ${cardDebugId}] Checking if clickable card area is visible...`
              );
              const isClickableAreaVisible = await clickableCardArea.isVisible({
                timeout: 5000,
              });
              log(
                `[Card ${cardDebugId}] Clickable area visible: ${isClickableAreaVisible}`
              );

              if (isClickableAreaVisible) {
                log(
                  `[Card ${cardDebugId}] Clicking specific clickable card area...`
                );
                await clickableCardArea.click({ timeout: 10000 });
              } else {
                log(`[Card ${cardDebugId}] Clicking card fallback...`);
                await card.click({ timeout: 10000 });
              }
              log(`[Card ${cardDebugId}] Card clicked.`);

              log(
                `[Card ${cardDebugId}] Waiting for job description content...`
              );
              await page.waitForSelector(
                "div.jobs-description-content__text--stretch",
                { timeout: 10000 }
              );
              log(`[Card ${cardDebugId}] Job description content found.`);

              const description =
                (await page
                  .locator("div.jobs-description-content__text--stretch")
                  .textContent({ timeout: 10000 })) || "";
              log(
                `[Card ${cardDebugId}] Description length: ${description.length}`
              );

              // Build JobListing object
              const jobListing: JobListing = {
                id: jobId,
                title: title.trim(),
                company: company.trim(),
                description: description.trim(),
                url: `https://www.linkedin.com/jobs/view/${jobId}/`,
              };

              log(
                `Evaluating job: ${jobListing.title} at ${jobListing.company} (ID: ${jobId})`
              );

              // Score the job
              const { score, trace } = await scoreJob(user, jobListing);

              // Determine status and reason
              let status = "pending_review";
              let reason = "";

              if (score.blacklisted || score.similarity < 0.65) {
                status = "skipped";
                // Extract reason from the trace
                if (score.blacklisted) {
                  reason = "Company blacklisted";
                } else {
                  reason = `Low similarity score: ${score.similarity.toFixed(
                    2
                  )}`;
                }
              }

              // Insert or update the job application record in Supabase
              const { error: upsertError } = await supabase
                .from("job_applications")
                .upsert(
                  {
                    user_id: user.id,
                    job_id: jobId,
                    job_title: jobListing.title,
                    company_name: jobListing.company,
                    job_description: jobListing.description.substring(0, 10000), // Limit text length
                    job_url: jobListing.url,
                    status,
                    reason,
                    applied_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: "user_id,job_id" }
                );

              if (upsertError) {
                log(`Error upserting job application: ${upsertError.message}`);
              } else {
                log(`Job processed successfully. Status: ${status}`);
                totalProcessed++;
                processedInThisSearch++;
              }
            } catch (error: any) {
              log(`Error processing job card: ${error.message}`);
            }
          }

          log(
            `Processed ${processedInThisSearch} jobs for '${keyword}' in '${location}'`
          );
        } catch (error: any) {
          log(
            `Error searching for '${keyword}' in '${location}': ${error.message}`
          );
        } finally {
          // Close the page for this search
          await page.close();
        }
      }
    }
  } finally {
    // 6. Close the browser context
    log(`Scan complete. Processed ${totalProcessed} jobs total.`);
    await context.close();
  }
}

async function ensureJobResults(page: Page): Promise<void> {
  log("Ensuring enough job results are loaded");

  // Initial wait for the first batch of results
  await page.waitForSelector("div.scaffold-layout__list", { timeout: 20000 });

  // Count initial cards
  let jobCards = await page.locator("li.scaffold-layout__list-item").all();
  log(`Initial job card count: ${jobCards.length}`);

  // If we have enough, return early
  if (jobCards.length >= 25) {
    return;
  }

  // Otherwise, scroll to load more
  let previousCount = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 5;

  while (jobCards.length < 25 && scrollAttempts < maxScrollAttempts) {
    previousCount = jobCards.length;

    // Scroll down within the results container
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });

    // Wait a bit for content to load
    await page.waitForTimeout(1000);

    // Check if we got more results
    jobCards = await page.locator("li.scaffold-layout__list-item").all();
    log(`After scroll ${scrollAttempts + 1}: ${jobCards.length} job cards`);

    // If no new cards appeared, try another approach or break
    if (jobCards.length === previousCount) {
      scrollAttempts++;
    }
  }

  log(`Final job card count: ${jobCards.length}`);
}

// If this script is run directly, execute the scan with the provided user ID
if (
  import.meta.url.startsWith("file:") &&
  process.argv[1] === new URL(import.meta.url).pathname
) {
  const args = process.argv.slice(2);
  const userIdArg = args.find(
    (arg) => arg.startsWith("--user=") || arg === "--user"
  );

  let userId: string | undefined;

  if (userIdArg) {
    if (userIdArg.startsWith("--user=")) {
      userId = userIdArg.split("=")[1];
    } else {
      const userIdIndex = args.indexOf("--user");
      if (userIdIndex !== -1 && userIdIndex < args.length - 1) {
        userId = args[userIdIndex + 1];
      }
    }
  }

  if (!userId) {
    console.error("Error: User ID is required.");
    console.error(
      "Usage: npx node --loader ts-node/esm agent/scanner.ts --user <USER_ID>"
    );
    process.exit(1);
  }

  const user: UserProfile = {
    id: userId,
    name: "CLI User",
    email: "cli@example.com",
  };

  scanLinkedInJobs(user)
    .then(() => {
      log("Job scan completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      log(`Job scan failed: ${error.message}`);
      console.error("Job scan error:", error);
      process.exit(1);
    });
}
