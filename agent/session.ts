import { chromium, type BrowserContext } from "playwright";
import * as path from "path";
import * as os from "os";
import keytar from "keytar";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import fs from "node:fs/promises";
import debug from "debug";
// Simple debug function since the import is failing

const log = debug("jobbot:session");

const USER_DATA_DIR = path.join(os.tmpdir(), "jobbot-playwright-data");
const STATE_KEY = "playwright-state";

export async function ensureSession(): Promise<BrowserContext> {
  log("Ensuring Playwright session...");

  // Load stored state
  const storedState = await keytar.getPassword("jobbot", STATE_KEY);
  const state = storedState ? JSON.parse(storedState) : null;

  const contextOptions = {
    headless: process.env.NODE_ENV === "production",
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
    ...(state && { storageState: state }),
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
    ],
  };

  log(
    "Launching persistent context with options:" +
      JSON.stringify(contextOptions)
  );

  const context = await chromium.launchPersistentContext(
    USER_DATA_DIR,
    contextOptions
  );

  // Save state before context is closed
  const originalClose = context.close.bind(context);
  context.close = async () => {
    try {
      const newState = await context.storageState();
      await keytar.setPassword("jobbot", STATE_KEY, JSON.stringify(newState));
      log("Saved browser state");
    } catch (error) {
      log("Error saving browser state:", error);
    }
    await originalClose();
  };

  return context;
}

export async function clearSession(): Promise<void> {
  log("Clearing stored session state...");
  await keytar.deletePassword("jobbot", STATE_KEY);
  log("Session state cleared");
}

// --- Function to export storage state ---
async function exportStorageState() {
  console.log(
    "Attempting to retrieve stored session state from keytar for export..."
  );
  const storedStateString = await keytar.getPassword("jobbot", STATE_KEY);

  if (storedStateString) {
    console.log("Successfully retrieved stored state from keytar.");
    const filePath = path.resolve(process.cwd(), "linkedin-auth.json");
    try {
      await fs.writeFile(filePath, storedStateString);
      console.log(`Storage state JSON saved to: ${filePath}`);
      console.log(
        "You can now use this with Playwright Codegen: npx playwright codegen --load-storage=linkedin-auth.json <URL>"
      );
    } catch (err) {
      console.error(`Error writing storage state to file: ${filePath}`, err);
    }
  } else {
    console.log(
      "No stored state found in keytar. Please ensure you have logged in successfully via a script that uses ensureSession."
    );
  }
}

async function manualTest() {
  console.log("Running manual test for session management...");
  const rl = readline.createInterface({ input, output });

  try {
    console.log("Step 1: Log in with context1 and save session.");
    const context1 = await ensureSession();
    console.log("Session context obtained for Step 1.");

    const page1 = await context1.newPage();
    console.log("Navigating to LinkedIn login page...");
    await page1.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
    });
    await page1.waitForTimeout(2000);

    const currentUrl = page1.url();
    console.log("Current URL after navigation:", currentUrl);

    if (currentUrl.includes("/feed")) {
      console.log(
        "Already logged into LinkedIn (redirected to /feed/). Proceeding to save session."
      );
    } else {
      console.log("Please manually log into LinkedIn in the browser window.");
      await rl.question(
        "Press ENTER in this terminal after you have logged into LinkedIn...\n"
      );
    }

    console.log("Attempting to close context1 and save session...");
    await context1.close();
    console.log("Context 1 closed and session should be saved.");

    console.log("Waiting for 2 seconds before launching the next context...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("\nStep 2: Verifying session reuse with context2...");
    const context2 = await ensureSession();
    console.log("Context 2 obtained, attempting to use stored session.");

    const page2 = await context2.newPage();
    console.log("Navigating to LinkedIn feed to check login status...");
    await page2.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
    });
    await page2.waitForTimeout(2000);

    const currentUrlContext2 = page2.url();
    console.log("Current URL in context2:", currentUrlContext2);

    if (currentUrlContext2.includes("/feed")) {
      console.log(
        "SUCCESS: Session reused! Still logged into LinkedIn in context2."
      );
    } else if (
      currentUrlContext2.includes("/login") ||
      currentUrlContext2.includes("/authwall")
    ) {
      console.log(
        "FAILURE: Session NOT reused. Redirected to login/authwall in context2."
      );
    } else {
      console.log(
        "UNKNOWN: Session status unclear in context2. URL:",
        currentUrlContext2
      );
    }

    await context2.close();
    console.log("Context 2 closed.");

    console.log("\nAttempting to clear session...");
    await clearSession();
    console.log("Session cleared.");

    console.log(
      "\nAttempting to ensure session (3rd time, should trigger login again)..."
    );
    const context3 = await ensureSession();
    console.log("Login flow completed. Context 3 obtained.");
    await context3.close(); // Prevent closing for inspection
    console.log("Context 3 closed.");
  } catch (error) {
    console.error("Error during manual test:", error);
  } finally {
    rl.close();
  }
}

// Use ES module import.meta.url check instead of require.main
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "export-auth") {
    exportStorageState().catch(console.error);
  } else if (process.argv[2] === "clear-auth") {
    clearSession().catch(console.error);
  } else {
    manualTest().catch(console.error);
  }
}

export function isCheckpoint(url: string): boolean {
  return url.includes("/checkpoint/") || url.includes("/uas/oauth");
}
