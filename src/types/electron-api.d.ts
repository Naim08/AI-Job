declare global {
  interface Window {
    electronAPI?: {
      pauseAgent: () => Promise<unknown>;
      resumeAgent: () => Promise<unknown>;
      captchaNeeded: () => Promise<unknown>;
      openCaptcha: () => Promise<unknown>;
      notify: (msg: string) => Promise<unknown>;
      chooseFile: () => Promise<unknown>;
      openFile: (filePath: string) => Promise<unknown>;
      triggerSyncEmbeddings: (userId: string) => Promise<unknown>;
    };

  }
}
export {};
