// Define the interface for the API exposed by preload.ts
export interface IElectronAPI {
  hasOllama: () => Promise<boolean>;
  listOllama: () => Promise<{ name: string; installed: boolean; sizeMB: number }[]>;
  installOllama: (model: string) => Promise<void>;
  uninstallOllama: (model: string) => Promise<void>;
  onOllamaProgress: (cb: (model: string, percent: number) => void) => void;
  pauseAgent: () => Promise<any>;
  openCaptcha: () => Promise<any>;
  notify: (msg: string) => Promise<any>;
  chooseFile: () => Promise<{ path: string | null; error?: string }>;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  triggerSyncEmbeddings: (userId: string) => Promise<{ success: boolean; error?: string }>;
  captchaNeeded: () => Promise<any>;
  retryOllama: () => void;
}

// Augment the Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
} 