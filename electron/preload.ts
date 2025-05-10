import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  pauseAgent: () => ipcRenderer.invoke('pause-agent'),
  openCaptcha: () => ipcRenderer.invoke('open-captcha'),
  notify: (msg: string) => ipcRenderer.invoke('notify', msg),
} as const); 