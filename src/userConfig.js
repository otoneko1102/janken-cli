import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Returns the OS-appropriate user config directory for janken-cli.
 *   Windows : %APPDATA%\janken-cli
 *   Others  : ~/.config/janken-cli
 */
export function getUserConfigDir() {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ||
        join(homedir(), "AppData", "Roaming"),
      "janken-cli",
    );
  }
  return join(homedir(), ".config", "janken-cli");
}

export function getUserConfigPath() {
  return join(getUserConfigDir(), "config.json");
}

export function loadUserConfig() {
  const configPath = getUserConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

export function saveUserConfig(updates) {
  const dir = getUserConfigDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const current = loadUserConfig();
  const next = { ...current, ...updates };
  writeFileSync(
    getUserConfigPath(),
    JSON.stringify(next, null, 2) + "\n",
    "utf-8",
  );
}
