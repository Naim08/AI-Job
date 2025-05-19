import schedule from "node-schedule";
import debug from "debug";
import { supabase } from "../src/lib/supabaseClient.js";
import { UserProfile, JobListing, Answer } from "../src/shared/types.js";
import * as scanner from "./scanner.js";
import * as ai from "./ai.js";
import * as apply from "./apply.js";

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

  /** Auto-starts a cron that runs every 20 minutes. No-op if already started. */
  start(): void {
    if (this.job) return; // already started
    log("Starting scheduler with cron '*/20 * * * *'");
    this.job = schedule.scheduleJob("*/20 * * * *", async () => {
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
      await scanner.scanLinkedInJobs(user);

      // 2. Fetch up to 10 fresh postings that are marked as fresh in DB
      const { data: freshJobs } = await (supabase as any)
        .from("job_listings")
        .select("*")
        .eq("status", "fresh")
        .order("created_at", { ascending: false })
        .limit(10);

      const jobs: JobListing[] = (freshJobs as any) || [];

      for (const job of jobs) {
        if (this.paused) break;
        if (this.appliedHour >= 25 || this.appliedDay >= 45) break;

        // --- Answer generation ---
        let answers: Answer[] = [];
        try {
          answers = await ai.generateAnswers(user, job, []);
        } catch (err) {
          log("Error generating answers", err);
          continue;
        }

        const shouldMarkForReview = answers.some((a) => a.needs_review);

        if (shouldMarkForReview) {
          // mark for review
          log(
            `Job ${job.id} has answers needing review or low confidence. Marking as pending_review.`
          );
          await (supabase as any).from("job_applications").insert({
            user_id: user.id,
            job_id: job.id,
            status: "pending_review",
          });
          continue;
        }

        try {
          const result = await apply.applyToJob(
            user,
            job,
            answers,
            user.resume_path || ""
          );
          if (result === "submitted") {
            this.appliedHour += 1;
            this.appliedDay += 1;
            log(
              `Application submitted. Hour ${this.appliedHour}/25, Day ${this.appliedDay}/45`
            );
          }
        } catch (err) {
          log("Error applying to job", err);
        }

        // 3. Random delay between applications
        await randDelay(30_000, 60_000);
      }
    } catch (err) {
      log("Scheduler cycle error", err);
    }
  }

  private async fetchCurrentUser(): Promise<UserProfile | null> {
    try {
      const {
        data: { user: authUser },
      } = await (supabase as any).auth.getUser();
      if (!authUser) return null;
      const { data } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();
      return data as UserProfile;
    } catch {
      return null;
    }
  }
}
