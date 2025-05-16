import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Notification,
  dialog,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import squirrelStartup from "electron-squirrel-startup"; // For Windows startup/shortcuts
import { syncEmbeddings } from "../agent/embeddings.js";
import { supabase } from "../src/lib/supabaseClient.js";
import { UserProfile, UserProfileSettings } from "../src/shared/types.js"; // Added import for UserProfile and UserProfileSettings
import type { Database, Tables } from "../src/shared/supabase.js"; // Import Supabase generated types
import dotenv from "dotenv";
dotenv.config();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
}

// Disable hardware acceleration early
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null;

// Globals from @electron-forge/plugin-vite/forge-vite-env
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;
// Optional: Declare preload entry if provided by Vite plugin, otherwise we use path.join
// declare const MAIN_WINDOW_PRELOAD_VITE_ENTRY: string;

console.log(
  `[Main Process] VITE_DEV_SERVER_URL: ${
    MAIN_WINDOW_VITE_DEV_SERVER_URL || "not defined (global)"
  }`
);
console.log(
  `[Main Process] VITE_NAME: ${MAIN_WINDOW_VITE_NAME || "not defined (global)"}`
);

function createMainWindow() {
  // --- Preload script path resolution (from our refined electron/main.ts) ---
  // This assumes electron/preload.ts is compiled to preload.js in the same output dir as main.js
  // This path is relative to the output directory of main.js (e.g., .vite/build/main.js)
  const preloadScriptPath = path.join(__dirname, "preload.js");
  console.log(
    `[Main Process] Attempting to use preload script at: ${preloadScriptPath}`
  );
  console.log(
    `[Main Process] Does preload script exist at resolved path? ${fs.existsSync(
      preloadScriptPath
    )}`
  );

  mainWindow = new BrowserWindow({
    width: 1024, // Using dimensions from our refined electron/main.ts
    height: 768,
    webPreferences: {
      // --- Crucial: Use webPreferences from our refined electron/main.ts ---
      preload: preloadScriptPath, // Use the resolved path
      // preload: MAIN_WINDOW_PRELOAD_VITE_ENTRY, // Alternative if vite plugin provides this global
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // --- Load content (logic from src/main.ts, adapted) ---
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(
      `[Main Process] Loading renderer from Vite dev server: ${MAIN_WINDOW_VITE_DEV_SERVER_URL}`
    );
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    const filePath = path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
    );
    console.log(`[Main Process] Loading renderer from file: ${filePath}`);
    mainWindow.loadFile(filePath);
  }

  // Open DevTools automatically if not packaged
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization.
app.whenReady().then(async () => {
  console.log("[Main Process] App is ready.");

  // --- IPC Handlers (from our refined electron/main.ts) ---
  // Captcha and agent pause/resume handlers

  // OLLAMA IPC HANDLERS
  const { hasCli, listModels, installModel, uninstallModel } = await import('../agent/ollama.js');
  ipcMain.handle('ollama-has-cli', async (): Promise<boolean> => {
    return hasCli();
  });
  ipcMain.handle('ollama-list', async (): Promise<{ name: string; installed: boolean; sizeMB: number }[]> => {
    return listModels();
  });
  ipcMain.handle('ollama-install', async (event, model: string): Promise<void> => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    await installModel(model, (line: string) => {
      // Parse progress from line, e.g. 'Pulling... 42%'
      const percentMatch = line.match(/(\d+)%/);
      const percent = percentMatch ? parseInt(percentMatch[1], 10) : 0;
      if (win) win.webContents.send('ollama-progress', model, percent);
    });
    if (win) win.webContents.send('ollama-progress', model, 100);
  });
  ipcMain.handle('ollama-uninstall', async (event, model: string): Promise<void> => {
    await uninstallModel(model);
  });

  ipcMain.handle("pause-agent", async () => {
    console.debug("[Main Process] IPC: pause-agent invoked.");
    return { status: "Agent pause signal received" };
  });

  ipcMain.handle("captcha-needed", async () => {
    console.debug(
      "[Main Process] IPC: captcha-needed invoked. Notifying renderer."
    );
    if (mainWindow) {
      mainWindow.webContents.send("captcha-detected");
    }
    return { status: "Captcha notification sent to renderer" };
  });

  ipcMain.handle("resume-agent", async () => {
    console.debug("[Main Process] IPC: resume-agent invoked.");
    // Clear pause flag and resume JobScheduler operations
    return { status: "Agent resume signal received" };
  });

  ipcMain.handle("open-captcha", async () => {
    console.debug(
      "[Main Process] IPC: open-captcha invoked. Opening https://www.linkedin.com"
    );
    try {
      await shell.openExternal("https://www.linkedin.com");
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[Main Process] Failed to open external URL:",
        errorMessage
      );
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("notify", async (_event, message: string) => {
    console.debug(
      `[Main Process] IPC: notify invoked with message: "${message}"`
    );
    if (!Notification.isSupported()) {
      console.warn(
        "[Main Process] Notifications are not supported on this system."
      );
      return {
        success: false,
        error: "Notifications not supported on this system.",
      };
    }
    new Notification({
      title: "Jobot Notification", // App-specific title
      body: message,
    }).show();
    return { success: true };
  });

  ipcMain.handle("choose-file", async () => {
    if (!mainWindow) {
      console.error(
        "[Main Process] Cannot choose file because mainWindow is not available."
      );
      return { error: "Main window not available" };
    }
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: "Select Résumé PDF",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        properties: ["openFile"],
      });
      if (canceled || filePaths.length === 0) {
        console.log("[Main Process] File selection canceled.");
        return { path: null };
      }
      const sourcePath = filePaths[0];
      const userDataPath = app.getPath("userData");
      const destinationDir = path.join(userDataPath, "resumes");
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }
      // Using a more robust way to generate unique filename if needed, or simply overwrite/use fixed name
      const destinationFile = path.join(
        destinationDir,
        `resume${path.extname(sourcePath)}`
      ); // Example: resume.pdf
      console.log(
        `[Main Process] Copying resume from ${sourcePath} to ${destinationFile}`
      );
      fs.copyFileSync(sourcePath, destinationFile);
      console.log("[Main Process] Resume copied successfully to fixed path.");
      return { path: destinationFile };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[Main Process] Error choosing or copying file:",
        errorMessage
      );
      return { error: `Failed to process file: ${errorMessage}` };
    }
  });

  ipcMain.handle("open-file", async (_event, filePath: string) => {
    console.debug(
      `[Main Process] IPC: open-file invoked for path: "${filePath}"`
    );
    try {
      if (!fs.existsSync(filePath)) {
        console.error(
          `[Main Process] File does not exist at path: ${filePath}`
        );
        return { success: false, error: "File not found." };
      }
      // Security check: only allow opening files from userData path for safety
      const userDataPath = app.getPath("userData");
      if (!filePath.startsWith(userDataPath)) {
        console.error(
          `[Main Process] Security: Attempt to open file outside of userData blocked: ${filePath}`
        );
        return {
          success: false,
          error:
            "Access denied: Cannot open files outside application data directory.",
        };
      }
      await shell.openPath(filePath);
      return { success: true };
    } catch (error: any) {
      // Changed error to any to satisfy linter for now
      const errorMessage =
        error instanceof Error ? error.message : String(error); // Corrected instanceof Error
      console.error("[Main Process] Failed to open file path:", errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("trigger-sync-embeddings", async (_event, userId: string) => {
    console.debug(
      `[Main Process] IPC: trigger-sync-embeddings invoked for user ID: ${userId}`
    );
    if (!userId) {
      console.error(
        "[Main Process] User ID is required to trigger sync embeddings."
      );
      return { success: false, error: "User ID not provided." };
    }
    try {
      console.log(
        `[Main Process] Attempting to fetch profile for user ${userId} (LOGGING_VERSION_CHECK_V2)`
      );
      const { data: dbProfile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "user_id, full_name, email, resume_path, settings, created_at, updated_at, avatar_url"
        )
        .eq("user_id", userId)
        .single<Tables<"profiles">>();

      if (
        profileError &&
        profileError.message !==
          "JSON object requested, multiple (or no) rows returned"
      ) {
        console.error(
          `[Main Process] Supabase error fetching profile for user ${userId} (LOGGING_VERSION_CHECK_V2):`,
          profileError.message,
          profileError.code
        );
        throw profileError;
      }

      if (!dbProfile) {
        console.error(
          `[Main Process] LOG_POINT_A_V2: dbProfile is null or undefined for user ${userId}. Preparing to throw ProfileNotFound. profileError: ${
            profileError ? profileError.message : "N/A"
          }`
        );
        throw new Error(`Profile not found for user ${userId}.`);
      }

      console.log(
        `[Main Process] LOG_POINT_B_V2: dbProfile is supposedly valid for user ${userId}. Value: ${JSON.stringify(
          dbProfile
        )}`
      );

      const userToSync: UserProfile = {
        id: dbProfile.user_id,
        name: dbProfile.full_name || "User",
        email: dbProfile.email || "N/A",
        resume_path: dbProfile.resume_path,
        settings:
          dbProfile.settings &&
          typeof dbProfile.settings === "object" &&
          !Array.isArray(dbProfile.settings)
            ? (dbProfile.settings as UserProfileSettings)
            : null,
        created_at: dbProfile.created_at,
        updated_at: dbProfile.updated_at,
        avatar_url: dbProfile.avatar_url,
      };

      console.log(
        `[Main Process] LOG_POINT_C_V2: UserToSync object created for user ${userId}: ${JSON.stringify(
          userToSync
        )}`
      );
      await syncEmbeddings(userToSync);
      console.log(
        `[Main Process] syncEmbeddings completed for user ${userId} (LOGGING_VERSION_CHECK_V2).`
      );
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[Main Process] Error in trigger-sync-embeddings catch block for user ${userId} (LOGGING_VERSION_CHECK_V2):`,
        errorMessage
      );
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      return {
        success: false,
        error: `Embedding sync failed: ${errorMessage}`,
      };
    }
  });

  ipcMain.handle('apply-queued', async (_event, appId: string) => {
    console.log(`[Main Process] IPC: apply-queued for appId ${appId}`);
    let jobApplication: Tables<"job_applications"> | null = null;

    try {
      // 1. Fetch job application from DB
      const { data: fetchedJobApplication, error: jobAppError } = await supabase
        .from('job_applications')
        .select('*')
        .eq('id', appId)
        .single<Tables<"job_applications">>();

      if (jobAppError) throw jobAppError;
      if (!fetchedJobApplication) throw new Error(`Job application with id ${appId} not found.`);
      jobApplication = fetchedJobApplication;

      // Fetch associated answers
      const { data: answers, error: answersError } = await supabase
        .from('application_answers')
        .select('*')
        .eq('application_id', appId);

      if (answersError) {
        // Log warning but proceed, answers might not always be present or strictly required for all steps
        console.warn(`[Main Process] Could not fetch answers for job application ${appId}:`, answersError.message);
      }

      // 2. Call agent/apply.applyToJob (Placeholder)
      // const applyResult = await applyToJob(jobApplication, answers || []); 
      // console.log('[Main Process] applyToJob result:', applyResult);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate async work

      const jobTitle = jobApplication.job_title || `Application ID ${appId}`;
      console.log(`[Main Process] Simulating applyToJob for: ${jobTitle}`);

      // 3. Update status to 'submitted'
      const { error: updateError } = await supabase
        .from('job_applications')
        .update({ status: 'submitted', updated_at: new Date().toISOString() })
        .eq('id', appId);

      if (updateError) throw updateError;

      console.log(`[Main Process] Job application ${appId} status updated to submitted.`);
      return { success: true, message: `Application for ${jobTitle} marked as submitted.` };

    } catch (error) {
      console.error(`[Main Process] Error in apply-queued for appId ${appId}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Attempt to update status to 'error' in DB
      if (appId) { // Only attempt update if appId is valid
        try {
          await supabase
            .from('job_applications')
            .update({ status: 'error', reason: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', appId);
          console.log(`[Main Process] Job application ${appId} status updated to error.`);
        } catch (dbUpdateError) {
          console.error(`[Main Process] Failed to update job application ${appId} status to error:`, dbUpdateError);
        }
      }
      return { success: false, error: errorMessage };
    }
  });

  // --- End of IPC Handlers ---

  createMainWindow();

  app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
