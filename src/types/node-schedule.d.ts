declare module "node-schedule" {
  interface Job {
    name: string;
    job: () => void;
    cancel(reschedule?: boolean): boolean;
    cancelNext(reschedule?: boolean): boolean;
    reschedule(spec: string | Date): boolean;
    nextInvocation(): Date | null;
    pendingInvocations(): Date[];
  }

  interface RecurrenceRule {
    // Add common recurrence rule properties as needed
    second?: number | null;
    minute?: number | null;
    hour?: number | null;
    date?: number | null;
    month?: number | null;
    year?: number | null;
    dayOfWeek?: number | null;
    tz?: string | null;
  }

  type RecurrenceSegment = number | number[] | null | undefined;
  type Recurrence = RecurrenceSegment | RecurrenceRule | string | Date;

  function scheduleJob(
    name: string | Date | Recurrence,
    spec: string | Date | Recurrence,
    callback: () => void
  ): Job;

  function scheduleJob(
    name: string,
    spec: string | Date | Recurrence,
    callback: () => void
  ): Job;

  function scheduleJob(
    spec: string | Date | Recurrence,
    callback: () => void
  ): Job;

  function cancelJob(job: string | Job): boolean;

  function scheduledJobs(): { [jobName: string]: Job };

  function rescheduleJob(job: string | Job, spec: string | Recurrence): Job;
  function cancelAll(reschedule?: boolean): number;
  function gracefulShutdown(): Promise<void>;
}
