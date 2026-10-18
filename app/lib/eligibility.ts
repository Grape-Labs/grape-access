export type RequirementState = "met" | "unmet" | "unavailable" | "not-checked";
export interface RequirementResult {
  label: string;
  state: RequirementState;
  detail: string;
  action: string;
}

// Read failures and unsupported layouts are unknown evidence, never negative evidence.
export async function inspectRequirement(
  label: string, action: string, inspect: () => Promise<string[]>
): Promise<RequirementResult> {
  try {
    const issues = await inspect();
    return { label, action, state: issues.length ? "unmet" : "met",
      detail: issues.length ? issues.join(" ") : "Satisfied by the accounts read for this wallet." };
  } catch (error) {
    return { label, action: "Retry the lookup. If it persists, contact the community administrator.",
      state: "unavailable", detail: error instanceof Error ? error.message : "Account lookup unavailable." };
  }
}

export function reputationIssues(input: {
  wallet: string; expectedWallet: string; season: number; expectedSeason: number;
  account: string; expectedAccount: string; points: string; minimum: string;
}): string[] {
  const issues: string[] = [];
  if (input.wallet !== input.expectedWallet) issues.push("Reputation belongs to a different wallet.");
  if (input.season !== input.expectedSeason) issues.push("Reputation is from the wrong season.");
  if (input.account !== input.expectedAccount) issues.push("Reputation is not from this community and season.");
  if (BigInt(input.points) < BigInt(input.minimum)) issues.push(`You have ${input.points} points; ${input.minimum} are required.`);
  return issues;
}

export function identityIssue(input: {
  space: string; expectedSpace: string; verified: boolean; expiresAt: number;
  now: number; platform: number; platforms: number[];
}): string | null {
  if (input.space !== input.expectedSpace) return "Identity belongs to a different verification community.";
  if (!input.verified) return "Identity is not currently verified (unverified or revoked).";
  if (input.expiresAt > 0 && input.now > input.expiresAt) return "Identity verification is expired.";
  if (!input.platforms.includes(input.platform)) return "Identity platform is not accepted by this gate.";
  return null;
}

export function walletLinkIssue(identityMatches: boolean, walletMatches: boolean): string | null {
  if (!identityMatches) return "Link account points to a different identity account.";
  if (!walletMatches) return "Identity is linked to a different wallet.";
  return null;
}

// A generation, rather than just equality, also rejects A → B → A races.
export class RequestScope {
  private key = "";
  private generation = 0;
  select(key: string) {
    if (key !== this.key) { this.key = key; this.generation += 1; }
  }
  capture() {
    const generation = this.generation;
    return () => generation === this.generation;
  }
}
