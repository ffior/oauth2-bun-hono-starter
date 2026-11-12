import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".local-desktop-app-demo");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");

export interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  scope: string;
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  await Bun.write(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const file = Bun.file(CREDENTIALS_FILE);
  if (!(await file.exists())) return null;
  return (await file.json()) as StoredCredentials;
}

export async function clearCredentials(): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.rm(CREDENTIALS_FILE, { force: true });
}
