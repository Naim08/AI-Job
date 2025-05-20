import execa from "execa";
import { debug } from "../electron/utils/debug.ts";

const SUPPORTED_MODELS = [
  "llama4:latest",
  "gemma3:4b",
  "llama3.2:latest",
  "nomic-embed-text:latest",
];

export interface OllamaModelInfo {
  name: string;
  installed: boolean;
  sizeMB: number;
  installing?: boolean;
  progress?: number;
}

export async function hasCli(): Promise<boolean> {
  if (process.env.SKIP_OLLAMA_BOOTSTRAP === "1") {
    debug("ollama", "SKIP_OLLAMA_BOOTSTRAP set, skipping CLI detection");
    return false;
  }
  try {
    await execa("which", ["ollama"]);
    debug("ollama", "Ollama CLI detected");
    return true;
  } catch (e) {
    debug("ollama", "Ollama CLI not found");
    return false;
  }
}

export async function listModels(): Promise<OllamaModelInfo[]> {
  if (process.env.SKIP_OLLAMA_BOOTSTRAP === "1") {
    debug(
      "ollama",
      "SKIP_OLLAMA_BOOTSTRAP set, returning not installed for all"
    );
    return SUPPORTED_MODELS.map((name) => ({
      name,
      installed: false,
      sizeMB: 0,
    }));
  }
  try {
    const { stdout } = await execa("ollama", ["list"]);
    // Parse output: NAME SIZE ...
    const lines = stdout.split("\n").slice(1); // skip header
    const modelMap: Record<string, { sizeMB: number }> = {};
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      if (!cols[0] || !cols[1]) continue;
      const name = cols[0];
      const sizeStr =
        cols[2] && cols[2].toLowerCase().match(/(\d+\.?\d*)\s*(gb|mb)/)
          ? cols[2]
          : cols[1];
      let sizeMB = 0;
      if (sizeStr?.toLowerCase().includes("gb")) {
        sizeMB = parseFloat(sizeStr) * 1024;
      } else if (sizeStr?.toLowerCase().includes("mb")) {
        sizeMB = parseFloat(sizeStr);
      }
      modelMap[name] = { sizeMB };
    }
    return SUPPORTED_MODELS.map((name) => ({
      name,
      installed: !!modelMap[name],
      sizeMB: modelMap[name]?.sizeMB || 0,
    }));
  } catch (e) {
    debug("ollama", "Error listing models", e);
    return SUPPORTED_MODELS.map((name) => ({
      name,
      installed: false,
      sizeMB: 0,
    }));
  }
}

export async function installModel(
  name: string,
  onLine: (line: string) => void
): Promise<void> {
  if (process.env.SKIP_OLLAMA_BOOTSTRAP === "1") {
    debug("ollama", "SKIP_OLLAMA_BOOTSTRAP set, skipping install");
    return;
  }
  debug("ollama", `Installing model: ${name}`);
  const child = execa("ollama", ["pull", name]);
  if (!child.stdout) throw new Error("No stdout from ollama pull");
  for await (const line of child.stdout) {
    onLine(line.toString());
  }
  await child;
  debug("ollama", `Model installed: ${name}`);
}

export async function uninstallModel(name: string): Promise<void> {
  if (process.env.SKIP_OLLAMA_BOOTSTRAP === "1") {
    debug("ollama", "SKIP_OLLAMA_BOOTSTRAP set, skipping uninstall");
    return;
  }
  debug("ollama", `Uninstalling model: ${name}`);
  await execa("ollama", ["rm", name]);
  debug("ollama", `Model uninstalled: ${name}`);
}
