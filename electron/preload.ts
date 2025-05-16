import { contextBridge, ipcRenderer } from 'electron';
console.log('[Preload] 🎉 preload.js running');

contextBridge.exposeInMainWorld('electronAPI', {
  hasOllama: (): Promise<boolean> => ipcRenderer.invoke('ollama-has-cli'),
  listOllama: (): Promise<{ name: string; installed: boolean; sizeMB: number }[]> => ipcRenderer.invoke('ollama-list'),
  installOllama: (model: string): Promise<void> => ipcRenderer.invoke('ollama-install', model),
  uninstallOllama: (model: string): Promise<void> => ipcRenderer.invoke('ollama-uninstall', model),
  onOllamaProgress: (cb: (model: string, percent: number) => void): void => {
    ipcRenderer.on('ollama-progress', (_e, model, percent) => cb(model, percent));
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('open-external', url)
  },
  pauseAgent: () => ipcRenderer.invoke('pause-agent'),
  resumeAgent: () => ipcRenderer.invoke('resume-agent'),
  captchaNeeded: () => ipcRenderer.invoke('captcha-needed'),
  openCaptcha: () => ipcRenderer.invoke('open-captcha'),
  notify: (msg: string) => ipcRenderer.invoke('notify', msg),
  chooseFile: () => ipcRenderer.invoke('choose-file'),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  triggerSyncEmbeddings: (userId: string) => ipcRenderer.invoke('trigger-sync-embeddings', userId),
  retryOllama: () => ipcRenderer.send('ollama-retry'),
  applyQueued: (appId: string) => ipcRenderer.invoke('apply-queued', appId)
} as const);

console.log('[Preload Script] Executing preload script...');
try {
  contextBridge.exposeInMainWorld('electronAPITest', {
    ping: () => 'pong'
  });
  console.log('[Preload Script] electronAPITest exposed.');
} catch (e) {
  console.error('[Preload Script] Error exposing API:', e);
} 