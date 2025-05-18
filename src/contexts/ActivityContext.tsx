import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { supabase } from "../lib/supabaseClient";
import {
  setupNotifier,
  ActivityItem as NotifierActivityItem,
} from "../lib/notifier"; // Renaming to avoid conflict if defined locally
import type { AgentStatus } from "../types/electron"; // Import AgentStatus type

// Re-exporting ActivityItem for convenience if components need it
export type ActivityItem = NotifierActivityItem;

interface ActivityContextType {
  activities: ActivityItem[];
}

const ActivityContext = createContext<ActivityContextType | undefined>(
  undefined
);

export const ActivityProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  // Effect to fetch initial user and listen to auth changes
  useEffect(() => {
    let mounted = true;

    const fetchUserAndSetListener = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) {
        setUserId(user?.id ?? null);
        if (user) {
          console.log("[ActivityProvider] Initial User ID fetched:", user.id);
        } else {
          console.log("[ActivityProvider] No initial user session.");
          setActivities([]); // Clear activities if no user initially
        }
      }
    };

    fetchUserAndSetListener();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          const currentUserId = session?.user?.id ?? null;
          setUserId(currentUserId);
          if (currentUserId) {
            console.log(
              "[ActivityProvider] Auth state changed, User ID:",
              currentUserId
            );
          } else {
            console.log(
              "[ActivityProvider] Auth state changed, no user. Clearing activities."
            );
            setActivities([]); // Clear activities if user logs out
          }
        }
      }
    );

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
      console.log(
        "[ActivityProvider] Auth listener and mounted flag cleaned up."
      );
    };
  }, []);

  // Effect to setup notifier when userId is available
  useEffect(() => {
    if (!userId) {
      console.log(
        "[ActivityProvider] No userId, notifier not set up. Activities will be empty."
      );
      // Ensure activities are cleared if userId becomes null after being set
      if (activities.length > 0) setActivities([]);
      return;
    }

    console.log("[ActivityProvider] Setting up notifier for user:", userId);
    const handleNewActivity = (activity: ActivityItem) => {
      setActivities(
        (prevActivities) => [activity, ...prevActivities].slice(0, 100) // Keep a rolling list of last 100 activities
      );
    };

    // Call setupNotifier and store the cleanup function
    const cleanupNotifier = setupNotifier(userId, handleNewActivity);
    console.log(
      "[ActivityProvider] Notifier setup initiated for user:",
      userId
    );

    return () => {
      if (cleanupNotifier) {
        console.log(
          "[ActivityProvider] Cleaning up notifier for user:",
          userId
        );
        cleanupNotifier();
      }
    };
  }, [userId]); // This effect depends on userId

  // Effect for listening to Agent Status changes from main process
  useEffect(() => {
    // This listener can be active even without a userId, as agent status is global.
    // However, we only add activities if a user is effectively logged in (userId is present),
    // or decide if agent status changes should be logged globally regardless of user session.
    // For now, let's only add to activity log if there is a user context (userId).

    if (!window.electronAPI || !window.electronAPI.onAgentStatus) {
      console.warn(
        "[ActivityProvider] electronAPI.onAgentStatus not available."
      );
      return;
    }

    console.log(
      "[ActivityProvider] Setting up listener for agent:statusUpdate"
    );
    const cleanupAgentStatusListener = window.electronAPI.onAgentStatus(
      (status: AgentStatus) => {
        console.log("[ActivityProvider] Received agent:statusUpdate:", status);
        if (!userId) {
          // If no user, don't add to the (user-specific) activity log.
          // Or, one could have a separate global log if needed.
          console.log(
            "[ActivityProvider] Agent status update received, but no user session to log against."
          );
          return;
        }

        const message = status.paused
          ? "⏸️ Agent Paused"
          : "▶️ Agent Resumed/Running";
        const details = `Daily applications: ${status.appliedDay}, Hourly: ${status.appliedHour}`;

        const newActivity: ActivityItem = {
          id: `agent-status-${new Date().toISOString()}`,
          message: message,
          details: details,
          timestamp: new Date().toISOString(),
          type: status.paused ? "warning" : "info",
        };
        setActivities((prevActivities) =>
          [newActivity, ...prevActivities].slice(0, 100)
        );
      }
    );

    return () => {
      if (cleanupAgentStatusListener) {
        console.log(
          "[ActivityProvider] Cleaning up agent:statusUpdate listener."
        );
        cleanupAgentStatusListener();
      }
    };
  }, [userId]); // Re-run if userId changes, to ensure logging context is correct

  return (
    <ActivityContext.Provider value={{ activities }}>
      {children}
    </ActivityContext.Provider>
  );
};

export const useActivity = (): ActivityContextType => {
  const context = useContext(ActivityContext);
  if (context === undefined) {
    throw new Error("useActivity must be used within an ActivityProvider");
  }
  return context;
};
