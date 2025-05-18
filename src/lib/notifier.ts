import { supabase } from "./supabaseClient.js";
import { JobApplication, ApplicationStatus } from "../shared/types.js";

const NOTIFICATION_DEBOUNCE_MS = 300; // Reduced debounce for faster UI updates for any change
const debouncedNotifications = new Map<string, NodeJS.Timeout>();

// Define a type for the activity items that will be displayed in the UI
export interface ActivityItem {
  id: string;
  message: string;
  details?: string;
  timestamp: string;
  type: "success" | "error" | "info" | "warning";
}

// The global Window.electronAPI type is expected to come from src/types/electron.d.ts
// Ensure src/types/electron.d.ts is included in your tsconfig.json "include" array.

function showDesktopNotification(title: string, body?: string) {
  if (window.electronAPI && window.electronAPI.notify) {
    window.electronAPI.notify(`${title}${body ? "\n" + body : ""}`);
  } else if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification(title, { body });
  } else if ("Notification" in window && Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body });
      }
    });
  } else {
    console.log(`Desktop Notification: ${title}${body ? " - " + body : ""}`);
  }
}

// Modified to also call onNewActivityCallback
function handleApplicationUpdate(
  payload: any,
  onNewActivityCallback?: (activity: ActivityItem) => void
) {
  const application = payload.new as JobApplication;
  if (!application || !application.id) {
    // Simplified check, job_id might not always be present on all updates
    console.error("Invalid application update payload (missing id):", payload);
    return;
  }

  const debounceKey = `app-${application.id}`;

  if (debouncedNotifications.has(debounceKey)) {
    clearTimeout(debouncedNotifications.get(debounceKey)!);
  }

  const timeoutId = setTimeout(() => {
    const jobTitle =
      application.job_title || `ID ${application.job_id || application.id}`;
    const newStatus = application.status || "updated"; // Fallback if status isn't in payload.new for some reason

    let activityMessage = `Job application for "${jobTitle}" ${newStatus.replace(
      /_/g,
      " "
    )}.`;
    let activityDetails = `Company: ${application.company_name || "N/A"}`;
    let activityType: ActivityItem["type"] = "info"; // Default to info for general updates

    // Optionally, still customize type for specific critical statuses
    if (newStatus === "error") {
      activityType = "error";
      activityDetails += ` - Error: ${
        application.error_message || "Unknown error"
      }`;
    } else if (newStatus === "submitted" || newStatus === "applied") {
      activityType = "success";
    } else if (newStatus === "offer") {
      activityType = "success";
      activityMessage = `🎉 Offer received for "${jobTitle}"!`;
    }

    // For desktop notifications, we can still be more selective or generic
    // For now, let's make it generic too for desktop notification
    // You might want to only show desktop notifications for certain statuses
    const desktopNotificationTitle = `🔄 Job Update: ${jobTitle}`;
    const desktopNotificationBody = `Status changed to ${newStatus.replace(
      /_/g,
      " "
    )}. Company: ${application.company_name || "N/A"}`;
    showDesktopNotification(desktopNotificationTitle, desktopNotificationBody);

    if (onNewActivityCallback) {
      onNewActivityCallback({
        id: `app-${application.id}-${
          payload.eventType || "UPDATE"
        }-${new Date().toISOString()}`,
        message: activityMessage,
        details: activityDetails,
        timestamp: new Date().toISOString(),
        type: activityType,
      });
    }
    debouncedNotifications.delete(debounceKey);
  }, NOTIFICATION_DEBOUNCE_MS);

  debouncedNotifications.set(debounceKey, timeoutId);
}

// Modified to accept onNewActivityCallback
export function setupNotifier(
  userId: string,
  onNewActivityCallback?: (activity: ActivityItem) => void
) {
  if (!userId) {
    console.error("User ID is required to set up notifier.");
    // Return a no-op cleanup function, as no notifier was set up.
    return () => {
      /* no operation, or console.log('No-op cleanup: Notifier was not started due to missing userId.'); */
    };
  }

  console.log("Setting up notifier for user:", userId);

  let cleanupCaptchaListener: (() => void) | null = null;

  const channel = supabase
    .channel("job-application-updates")
    .on(
      "postgres_changes",
      {
        event: "*", // Listen to INSERT, UPDATE, DELETE
        schema: "public",
        table: "job_applications",
        filter: `user_id=eq.${userId}`,
      },
      (payload: any) => {
        console.log(
          "Job application change received! Event:",
          payload.eventType,
          payload
        );
        // For DELETE events, payload.new will be undefined, payload.old will have the data.
        // For INSERT, payload.old is undefined.
        // For UPDATE, both are present.

        // We need to handle DELETE differently if we want to log it.
        // For now, handleApplicationUpdate expects payload.new for details.
        // If you want to log deletions, you'll need to adapt handleApplicationUpdate or add new logic.
        if (payload.eventType === "DELETE") {
          const oldApplication = payload.old as JobApplication;
          if (oldApplication && oldApplication.id && onNewActivityCallback) {
            console.log("[notifier] Job application deleted:", oldApplication);
            onNewActivityCallback({
              id: `app-deleted-${
                oldApplication.id
              }-${new Date().toISOString()}`,
              message: `Job application for "${
                oldApplication.job_title ||
                `ID ${oldApplication.job_id || oldApplication.id}`
              }" was deleted.`,
              details: `Company: ${oldApplication.company_name || "N/A"}`,
              timestamp: new Date().toISOString(),
              type: "warning", // Or 'info'
            });
          } else {
            console.warn(
              "[notifier] Received DELETE event with insufficient old data:",
              payload
            );
          }
        } else if (payload.new) {
          // For INSERT and UPDATE
          handleApplicationUpdate(payload, onNewActivityCallback);
        } else {
          console.warn(
            "[notifier] Received event with no 'new' or 'old' payload for delete:",
            payload
          );
        }
      }
    )
    .subscribe((status: string, err?: Error) => {
      if (status === "SUBSCRIBED") {
        console.log("Subscribed to job_application updates!");
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        console.error("Supabase channel error:", err);
        if (onNewActivityCallback) {
          onNewActivityCallback({
            id: `supabase-error-${new Date().toISOString()}`,
            message: "Activity feed connection error.",
            details: err?.message || "Failed to subscribe to updates.",
            timestamp: new Date().toISOString(),
            type: "error",
          });
        }
      }
    });

  if (
    window.electronAPI &&
    typeof window.electronAPI.onCaptchaNeeded === "function"
  ) {
    const captchaCallback = () => {
      const debounceKey = "captcha-needed-ui"; // Use a different key for UI activity
      // No need to debounce UI activity item, show immediately
      if (onNewActivityCallback) {
        onNewActivityCallback({
          id: `captcha-${new Date().toISOString()}`,
          message: "LinkedIn verification may be required.",
          details: "Please check LinkedIn if you encounter issues.",
          timestamp: new Date().toISOString(),
          type: "warning",
        });
      }
      // Debounce for desktop notification still applies
      const desktopNotifDebounceKey = "captcha-needed-desktop";
      if (debouncedNotifications.has(desktopNotifDebounceKey)) {
        clearTimeout(debouncedNotifications.get(desktopNotifDebounceKey)!);
      }
      const timeoutId = setTimeout(() => {
        showDesktopNotification("⚠️ LinkedIn verification required.");
        debouncedNotifications.delete(desktopNotifDebounceKey);
      }, NOTIFICATION_DEBOUNCE_MS);
      debouncedNotifications.set(desktopNotifDebounceKey, timeoutId);
    };
    cleanupCaptchaListener =
      window.electronAPI.onCaptchaNeeded(captchaCallback);
    console.log("CAPTCHA listener set up via electronAPI.");
  } else {
    console.warn(
      "window.electronAPI.onCaptchaNeeded is not available. CAPTCHA UI updates and notifications will not work."
    );
  }

  return () => {
    console.log("Cleaning up notifier, unsubscribing from Supabase channel.");
    supabase.removeChannel(channel);
    if (cleanupCaptchaListener) {
      cleanupCaptchaListener();
      console.log("Cleaned up CAPTCHA listener.");
    }
    debouncedNotifications.forEach((timeoutId) => clearTimeout(timeoutId));
    debouncedNotifications.clear();
  };
}

// Example usage:
// import { setupNotifier } from './notifier';
// const cleanupNotifier = setupNotifier('user-uuid');
// Call cleanupNotifier when the component unmounts or app closes
