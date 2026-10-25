import { uuidPattern } from "@/lib/format";

export type APIKey = {
  id: string;
  project_id: string;
  name: string;
  prefix: string;
  environment: "dev" | "live";
  status: "active" | "expired" | "revoked";
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revokes_at: string | null;
  rotated_to_id: string | null;
};
export type KeyReceipt = {
  key: APIKey;
  api_key: string;
  previous_key_id?: string;
  previous_key_revokes_at?: string;
};

export function validateKeyReceipt(receipt: KeyReceipt, projectId: string) {
  if (
    !receipt?.key ||
    receipt.key.project_id !== projectId ||
    !uuidPattern.test(receipt.key.id) ||
    !/^ch_(dev|live)_[a-f0-9]{64}$/.test(receipt.api_key) ||
    !/^ch_(dev|live)_[a-f0-9]{12}$/.test(receipt.key.prefix) ||
    !receipt.api_key.startsWith(receipt.key.prefix) ||
    !receipt.api_key.startsWith("ch_" + receipt.key.environment + "_")
  ) {
    throw new Error(
      "The credential response was incomplete. Refresh key metadata before trying again.",
    );
  }
  return receipt;
}
