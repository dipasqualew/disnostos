import { randomUUID } from "node:crypto";
import { AUTH_EMULATOR_URL, PROJECT_ID } from "./env";

export type Account = { email: string; password: string };

const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };

/** Creates a unique user in the Auth emulator, as an admin would in GCP. */
export async function seedAccount(): Promise<Account> {
  const account = { email: `writer-${randomUUID()}@example.test`, password: `pw-${randomUUID()}` };
  const response = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`,
    { method: "POST", headers: ADMIN, body: JSON.stringify(account) },
  );
  if (!response.ok) throw new Error(`Could not seed account: ${response.status}`);
  return account;
}

/** Reads the reset code the emulator "emailed" to this address. */
export async function latestResetCode(email: string): Promise<string> {
  const response = await fetch(`${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  if (!response.ok) throw new Error(`Could not read reset codes: ${response.status}`);
  const { oobCodes } = (await response.json()) as {
    oobCodes: { email: string; oobCode: string; requestType: string }[];
  };
  const code = oobCodes.findLast((item) => item.email === email && item.requestType === "PASSWORD_RESET");
  if (!code) throw new Error("No reset code was issued");
  return code.oobCode;
}
