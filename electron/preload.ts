import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { AgentStatus } from "../src/types/electron.js";
console.log("[Preload] 🎉 preload.js running");

contextBridge.exposeInMainWorld("electronAPI", {
  hasOllama: () => ipcRenderer.invoke("ollama:has"),
  listOllama: () => ipcRenderer.invoke("ollama:list"),
  installOllama: (model: string) => ipcRenderer.invoke("ollama:install", model),
  uninstallOllama: (model: string) =>
    ipcRenderer.invoke("ollama:uninstall", model),
  onOllamaProgress: (cb: (model: string, percent: number) => void) => {
    const handler = (
      _event: IpcRendererEvent,
      model: string,
      percent: number
    ) => cb(model, percent);
    ipcRenderer.on("ollama:progress", handler);
    return () => ipcRenderer.removeListener("ollama:progress", handler);
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  },
  pauseAgent: () => ipcRenderer.invoke("agent:pause"),
  resumeAgent: () => ipcRenderer.invoke("agent:resume"),
  getAgentStatus: () => ipcRenderer.invoke("agent:getStatus"),
  onAgentStatus: (cb: (status: AgentStatus) => void) => {
    const handler = (_event: IpcRendererEvent, status: AgentStatus) =>
      cb(status);
    ipcRenderer.on("agent:statusUpdate", handler);
    return () => ipcRenderer.removeListener("agent:statusUpdate", handler);
  },
  openCaptcha: () => ipcRenderer.invoke("app:openCaptcha"),
  notify: (msg: string) => ipcRenderer.invoke("app:notify", msg),
  chooseFile: () => ipcRenderer.invoke("dialog:chooseFile"),
  openFile: (filePath: string) => ipcRenderer.invoke("app:openFile", filePath),
  triggerSyncEmbeddings: (userId: string) =>
    ipcRenderer.invoke("supabase:triggerSyncEmbeddings", userId),
  captchaNeeded: () => ipcRenderer.invoke("agent:captchaNeeded"),
  retryOllama: () => ipcRenderer.send("ollama:retry"),
  applyQueued: (appId: string) => ipcRenderer.invoke("job:applyQueued", appId),
  onCaptchaNeeded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("agent:captchaNeededGlobal", handler);
    return () => {
      ipcRenderer.removeListener("agent:captchaNeededGlobal", handler);
    };
  },
  runAgentCycleNow: () => ipcRenderer.invoke("agent:runCycleNow"),
  updateAuthSession: (session: { accessToken: string; refreshToken: string }) =>
    ipcRenderer.invoke("electronAPI.updateAuthSession", session),
  clearAuthSession: () => ipcRenderer.invoke("electronAPI.clearAuthSession"),
} as const);

console.log("[Preload Script] Executing preload script...");
try {
  contextBridge.exposeInMainWorld("electronAPITest", {
    ping: () => "pong",
  });
  console.log("[Preload Script] electronAPITest exposed.");
} catch (e) {
  console.error("[Preload Script] Error exposing API:", e);
}
