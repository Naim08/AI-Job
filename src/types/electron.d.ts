// Define the interface for the API exposed by preload.ts
export interface IElectronAPI {
  pauseAgent: () => Promise<any>;
  openCaptcha: () => Promise<any>;
  notify: (msg: string) => Promise<any>;
  chooseFile: () => Promise<{ path: string | null; error?: string }>;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  triggerSyncEmbeddings: (userId: string) => Promise<{ success: boolean; error?: string }>;
}

// Augment the Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
} 