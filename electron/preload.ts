import { contextBridge, ipcRenderer } from 'electron';
console.log('[Preload] 🎉 preload.js running');

contextBridge.exposeInMainWorld('electronAPI', {
  pauseAgent: () => ipcRenderer.invoke('pause-agent'),
  openCaptcha: () => ipcRenderer.invoke('open-captcha'),
  notify: (msg: string) => ipcRenderer.invoke('notify', msg),
  chooseFile: () => ipcRenderer.invoke('choose-file'),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  triggerSyncEmbeddings: (userId: string) => ipcRenderer.invoke('trigger-sync-embeddings', userId)
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