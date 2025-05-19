import React, { useState, useEffect } from "react";
// Import AgentStatus from the central type definition file
import type { AgentStatus } from "../types/electron";

// Remove the local AgentStatus interface definition
// interface AgentStatus {
//   paused: boolean;
//   appliedHour: number;
//   appliedDay: number;
// }

export const ApplyToggle: React.FC = () => {
  // Use the imported AgentStatus type for the state
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    // initial fetch
    console.log("ApplyToggle: Fetching initial status");
    window.electronAPI.getAgentStatus().then((status) => {
      console.log("ApplyToggle: Initial status received:", status);
      setStatus(status);
    });

    // live updates
    console.log("ApplyToggle: Setting up status listener");
    const cleanup = window.electronAPI.onAgentStatus((s: AgentStatus) => {
      console.log("ApplyToggle: Status update received:", s);
      setStatus(s);
    });

    return cleanup;
  }, []);

  if (!status) return null; // loading state until first IPC

  const running = !status.paused;
  const label = running ? "Pause Applying" : "Start Applying";

  const handleClick = async () => {
    console.log(`ApplyToggle: ${running ? "Pausing" : "Resuming"} agent...`);
    try {
      if (running) {
        const result = await window.electronAPI.pauseAgent();
        console.log("ApplyToggle: Pause result:", result);
      } else {
        const result = await window.electronAPI.resumeAgent();
        console.log("ApplyToggle: Resume result:", result);
      }
    } catch (error) {
      console.error(
        `ApplyToggle: Error ${running ? "pausing" : "resuming"} agent:`,
        error
      );
    }
  };

  return (
    <button
      className={`btn btn-sm ${running ? "btn-error" : "btn-success"}`}
      onClick={handleClick}
    >
      {label}
      {running && <span className="loading loading-spinner ml-2" />}
    </button>
  );
};

export default ApplyToggle;
