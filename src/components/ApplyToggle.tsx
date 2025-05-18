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
    window.electronAPI.getAgentStatus().then(setStatus);
    // live updates
    window.electronAPI.onAgentStatus((s: AgentStatus) => setStatus(s));
  }, []);

  if (!status) return null; // loading state until first IPC

  const running = !status.paused;
  const label = running ? "Pause Applying" : "Start Applying";
  const click = running
    ? () => window.electronAPI.pauseAgent()
    : () => window.electronAPI.resumeAgent();

  return (
    <button
      className={`btn btn-sm ${running ? "btn-error" : "btn-success"}`}
      onClick={click}
    >
      {label}
      {running && <span className="loading loading-spinner ml-2" />}
    </button>
  );
};

export default ApplyToggle;
