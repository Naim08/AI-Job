// Define the interface for the API exposed by preload.ts
export interface IElectronAPI {
  hasOllama: () => Promise<boolean>;
  listOllama: () => Promise<
    { name: string; installed: boolean; sizeMB: number }[]
  >;
  installOllama: (model: string) => Promise<void>;
  uninstallOllama: (model: string) => Promise<void>;
  onOllamaProgress: (cb: (model: string, percent: number) => void) => void;
  pauseAgent: () => Promise<AgentStatus>;
  resumeAgent: () => Promise<AgentStatus>;
  getAgentStatus: () => Promise<AgentStatus>;
  onAgentStatus: (cb: (status: AgentStatus) => void) => () => void;
  openCaptcha: () => Promise<{ success: boolean; error?: string }>;
  notify: (msg: string) => Promise<{ success: boolean; error?: string }>;
  chooseFile: () => Promise<{ path: string | null; error?: string }>;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  triggerSyncEmbeddings: (
    userId: string
  ) => Promise<{ success: boolean; error?: string }>;
  applyQueued: (appId: string) => Promise<{ success: boolean; error?: string }>;
  onCaptchaNeeded: (callback: () => void) => () => void;
  // Session synchronization methods
  updateAuthSession: (session: {
    accessToken: string;
    refreshToken: string;
  }) => Promise<{ success: boolean; error?: string }>;
  clearAuthSession: () => Promise<{ success: boolean; error?: string }>;
  shell: {
    openExternal: (
      url: string
    ) => Promise<{ success: boolean; error?: string }>;
  };
}

// Define AgentStatus interface if it's not already globally available or imported
// For now, assuming it's defined elsewhere or will be.
// If not, it should be defined here or imported.
export interface AgentStatus {
  paused: boolean;
  appliedHour: number;
  appliedDay: number;
}

// Augment the Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
    electronAPITest?: {
      ping: () => string;
    };
  }
}
