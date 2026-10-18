import { BorshAccountsCoder } from "@coral-xyz/anchor";
import { PublicKey, type Connection } from "@solana/web3.js";
import { IDL, GPASS_PROGRAM_ID, findAccessPda, findAccessCheckRecordPda, type Access, type AccessCheckRecord } from "@grapenpm/grape-access-sdk";

export type PublicCluster = "mainnet-beta" | "devnet" | "testnet";
export interface StatusSelection { gateId: string; wallet: string; cluster: PublicCluster }
export interface PublicStatus {
  state: "recorded-pass" | "recorded-fail" | "no-record" | "gate-missing";
  slot: number;
  gateAddress: string;
  recordAddress: string;
  checkedAt?: number;
  gateActive?: boolean;
  requirements: string[];
}
export function parseStatusSelection(params: URLSearchParams): StatusSelection {
  const cluster = params.get("cluster") ?? "mainnet-beta";
  if (!["mainnet-beta", "devnet", "testnet"].includes(cluster)) throw new Error("Public status supports Mainnet Beta, Devnet and Testnet. Custom RPC URLs are not shared.");
  try {
    return { gateId: new PublicKey(params.get("gateId") ?? "").toBase58(), wallet: new PublicKey(params.get("wallet") ?? "").toBase58(), cluster: cluster as PublicCluster };
  } catch { throw new Error("Enter a valid gate ID and wallet address."); }
}
export function publicStatusPath(selection: StatusSelection): string {
  // Only public identifiers are shared. Never include an RPC key or a claimed verdict.
  const params = new URLSearchParams({ gateId: selection.gateId, wallet: selection.wallet, cluster: selection.cluster });
  parseStatusSelection(params);
  return `/status?${params}`;
}
export function publicRpcEndpoint(cluster: PublicCluster): string {
  if (cluster === "mainnet-beta") return process.env.NEXT_PUBLIC_SHYFT_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";
  return `https://api.${cluster}.solana.com`;
}
export function describePublicRequirements(criteria: Access["criteria"]): string[] {
  const [kind, config] = Object.entries(criteria)[0] ?? [];
  if (!kind || !config) return ["Requirements unavailable for this account layout."];
  const c = config as Record<string, unknown>;
  const lines: string[] = [];
  if (["combined", "minReputation", "timeLockedReputation"].includes(kind)) {
    lines.push(`At least ${String(c.minPoints)} reputation points in season ${String(c.season)}.`);
    lines.push(`Reputation community config: ${String(c.vineConfig)}.`);
  }
  if (["combined", "verifiedIdentity", "verifiedWithWallet"].includes(kind)) {
    const names: Record<number, string> = { 0: "Discord", 1: "Telegram", 2: "Twitter / X", 3: "Email" };
    const platforms = Array.isArray(c.platforms) ? c.platforms.map(p => names[Number(p)] ?? `Platform ${p}`).join(", ") : "";
    lines.push(`Current verification on one accepted platform: ${platforms || "none configured"}.`);
    lines.push(`Verification community space: ${String(c.grapeSpace)}.`);
    lines.push(kind === "verifiedWithWallet" || c.requireWalletLink ? "Verified identity must be linked to this wallet." : "This policy does not require a wallet link.");
  }
  if (kind === "timeLockedReputation") lines.push(`Program duration requirement: ${String(c.minHoldDurationSeconds)} seconds.`);
  if (kind === "tokenHolding") lines.push(`At least ${String(c.minAmount)} raw token units for mint ${String(c.mint)}.`);
  if (kind === "nftCollection") lines.push(`At least ${String(c.minCount)} NFTs from collection ${String(c.collectionMint)}.`);
  if (!lines.length) lines.push(`Program policy: ${kind}. Open the member page for requirement details.`);
  return lines;
}

export async function readPublicStatus(
  connection: Pick<Connection, "getMultipleAccountsInfoAndContext">,
  selection: StatusSelection
): Promise<PublicStatus> {
  const gateId = new PublicKey(selection.gateId);
  const user = new PublicKey(selection.wallet);
  const [gatePda] = await findAccessPda(gateId);
  const [recordPda] = await findAccessCheckRecordPda(gatePda, user);
  // One confirmed bank read. SDK fetch helpers swallow RPC errors as null, so
  // use the raw RPC method and decode explicitly instead.
  const response = await connection.getMultipleAccountsInfoAndContext([gatePda, recordPda], { commitment: "confirmed" });
  const [gateInfo, recordInfo] = response.value;
  const base = { slot: response.context.slot, gateAddress: gatePda.toBase58(), recordAddress: recordPda.toBase58(), requirements: [] as string[] };
  if (!gateInfo) return { ...base, state: "gate-missing" };
  if (!gateInfo.owner.equals(GPASS_PROGRAM_ID)) throw new Error("Gate account has an unexpected owner. Status unavailable.");
  const coder = new BorshAccountsCoder(IDL);
  let gate: Access;
  let record: AccessCheckRecord | undefined;
  try {
    gate = coder.decode("Access", gateInfo.data) as Access;
    if (recordInfo) {
      if (!recordInfo.owner.equals(GPASS_PROGRAM_ID)) throw new Error("Unexpected record owner.");
      record = coder.decode("AccessCheckRecord", recordInfo.data) as AccessCheckRecord;
    }
  } catch { throw new Error("Account layout or owner is unsupported. Status unavailable; no eligibility conclusion was made."); }
  if (!gate.accessId.equals(gateId)) throw new Error("Gate identifier mismatch. Status unavailable.");
  const result = { ...base, gateActive: gate.isActive, requirements: describePublicRequirements(gate.criteria) };
  if (!record) return { ...result, state: "no-record" };
  if (!record.access.equals(gatePda) || !record.user.equals(user)) throw new Error("Check record does not match this gate and wallet.");
  const checkedAt = record.checkedAt.toNumber();
  if (checkedAt === 0) return { ...result, state: "no-record" };
  if (!Number.isSafeInteger(checkedAt) || checkedAt < 0 || checkedAt > 8640000000000) throw new Error("Invalid check timestamp. Status unavailable.");
  return { ...result, state: record.passed ? "recorded-pass" : "recorded-fail", checkedAt };
}
