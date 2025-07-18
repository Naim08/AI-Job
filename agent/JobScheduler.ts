import schedule from "node-schedule";
import debug from "debug";
import { supabase } from "../src/lib/supabaseClient.ts";
import { UserProfile, JobListing, Answer } from "../src/shared/types.ts";
import * as scanner from "./scanner.ts";
import * as ai from "./ai.ts";
import * as apply from "./apply.ts";
import * as ollama from "./ollama.ts";
import { ensureSession } from "./session.ts";
import { BrowserContext, Page } from "playwright";

const log = debug("jobbot:scheduler");

function randDelay(msMin: number, msMax: number): Promise<void> {
  const dur = Math.floor(Math.random() * (msMax - msMin + 1)) + msMin;
  return new Promise((res) => setTimeout(res, dur));
}

export interface SchedulerStatus {
  paused: boolean;
  appliedHour: number;
  appliedDay: number;
}
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";
/**
 * JobScheduler – runs every 20 minutes, enforcing hourly and daily caps
 * and exposing pause/resume controls.
 */
export class JobScheduler {
  private static _instance: JobScheduler;
  private job: schedule.Job | null = null;
  private paused = false;
  private appliedHour = 0;
  private appliedDay = 0;
  private lastHour = new Date().getHours();
  private lastDay = new Date().getDate();

  static getInstance(): JobScheduler {
    if (!JobScheduler._instance) {
      JobScheduler._instance = new JobScheduler();
    }
    return JobScheduler._instance;
  }

  private constructor() {
    // Private constructor for singleton pattern
  }

  /** Auto-starts a cron that runs every minute. No-op if already started. */
  start(): void {
    // Check if the model is installed, if not installed, force the user to the model panel tsx (src/components/ModelPanel.tsx)
    if (!ollama.hasModel(OLLAMA_MODEL)) {
      log("Model not installed, forcing user to model panel");
      return;
    }

    if (this.job) return; // already started
    log("Starting scheduler with cron '* * * * *'");
    this.job = schedule.scheduleJob("* * * * *", async () => {
      await this.runCycle();
    });
  }

  pause(): void {
    this.paused = true;
    log("Scheduler paused");
  }

  resume(): void {
    this.paused = false;
    log("Scheduler resumed");
  }

  getStatus(): SchedulerStatus {
    return {
      paused: this.paused,
      appliedHour: this.appliedHour,
      appliedDay: this.appliedDay,
    };
  }

  /** Main scheduled loop */
  private async runCycle(): Promise<void> {
    if (this.paused) {
      log("Paused – skipping cycle");
      return;
    }

    const now = new Date();
    // Reset counters when hour/day boundaries pass
    if (now.getHours() !== this.lastHour) {
      this.appliedHour = 0;
      this.lastHour = now.getHours();
    }
    if (now.getDate() !== this.lastDay) {
      this.appliedDay = 0;
      this.lastDay = now.getDate();
    }

    if (this.appliedHour >= 25 || this.appliedDay >= 45) {
      log("Application caps reached – skipping cycle");
      return;
    }

    try {
      const user = await this.fetchCurrentUser();
      if (!user) {
        log("No logged-in user, aborting cycle");
        return;
      }

      // 1. Scan LinkedIn and store fresh postings in DB
      // await scanner.scanLinkedInJobs(user);

      //open browser
      let context: BrowserContext | null = null;
      context = await ensureSession();
      if (!context) {
        log("Failed to ensure Playwright session.");
        return;
      }

      // 2. Fetch up to 10 fresh postings that are marked as fresh in DB
      const { data: freshJobsToApply, error: fetchError } = await (
        supabase as any
      )
        .from("job_applications")
        .select("*")
        .eq("status", "fresh")
        .eq("user_id", user.user_id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (fetchError) {
        log(
          "Error fetching fresh jobs from job_applications:",
          fetchError.message
        );
        return;
      }

      const jobsToProcess: any[] = (freshJobsToApply as any) || [];

      log(
        `Found ${jobsToProcess.length} fresh jobs in job_applications to process.`
      );

      for (const jobApp of jobsToProcess) {
        if (this.paused) break;
        if (this.appliedHour >= 25 || this.appliedDay >= 45) break;

        const jobDataForAI: JobListing = {
          id: jobApp.job_id,
          title: jobApp.job_title,
          company: jobApp.company_name,
          description: jobApp.job_description || "",
          url: jobApp.job_url || "",
        };

        // --- Answer generation ---
        let answers: Answer[] = [];
        try {
          answers = await ai.generateAnswers(user, jobDataForAI, []);
        } catch (err) {
          log("Error generating answers", err);
          continue;
        }

        const shouldMarkForReview = answers.some((a) => a.needs_review);

        if (shouldMarkForReview) {
          log(
            `Job ${jobApp.job_id} has answers needing review or low confidence. Marking as pending_review.`
          );
          await (supabase as any)
            .from("job_applications")
            .update({
              status: "pending_review",
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobApp.id);
          continue;
        }

        try {
          const result = await apply.applyToJob(
            user,
            jobDataForAI,
            answers,
            user.resume_path || "",
            "",
            context,
            { dryRunStopBeforeSubmit: true }
          );
          if (result === "submitted") {
            this.appliedHour += 1;
            this.appliedDay += 1;
            log(
              `Application submitted for job_app id ${jobApp.id}. Hour ${this.appliedHour}/25, Day ${this.appliedDay}/45`
            );
          } else {
            log(
              `There was an issue with job_app id ${jobApp.id} with status ${result}`
            );
          }
        } catch (err) {
          log(`Error applying to job_app id ${jobApp.id}:`, err);
        }

        // 3. Random delay between applications
        await randDelay(30_000, 60_000);
      }
    } catch (err) {
      log("Scheduler cycle error", err);
    }
  }

  /** Manually triggers a run cycle. */
  public async runCycleNow(): Promise<void> {
    log("Manually triggering a run cycle.");
    // The runCycle method itself checks for the paused state, caps, etc.
    await this.runCycle();
  }

  private async fetchCurrentUser(): Promise<UserProfile | null> {
    try {
      const {
        data: { user: authUser },
      } = await (supabase as any).auth.getUser();
      log("fetchCurrentUser - authUser object:", authUser);

      if (!authUser) {
        log(
          "fetchCurrentUser - No authUser found from supabase.auth.getUser(). Returning null."
        );
        return null;
      }

      log(
        `fetchCurrentUser - Attempting to fetch profile for authUser.id: ${authUser.id}`
      );
      const { data: profileData, error: profileError } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("user_id", authUser.id) // Keep this as "id" for now, we will analyze based on logs
        .single();

      if (profileError) {
        log("fetchCurrentUser - Error fetching profile:", profileError);
        // Also check if the error means "No rows found" which .single() can treat as an error depending on configuration/usage
        // For now, any error during profile fetch means we can't proceed with this user.
        return null;
      }

      log("fetchCurrentUser - Profile data received:", profileData);

      if (!profileData) {
        log(
          "fetchCurrentUser - Profile data is null/undefined after query (profile might not exist for user id). Returning null."
        );
        return null;
      }

      return profileData as UserProfile;
    } catch (error) {
      log(
        "fetchCurrentUser - Caught an unexpected error in the try block:",
        error
      );
      return null;
    }
  }
}
