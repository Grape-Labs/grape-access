"use client";

import { useEffect, useMemo, useState } from "react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { AnchorProvider } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { Buffer } from "buffer";
import bs58 from "bs58";
import * as GPassSdk from "@grapenpm/grape-access-sdk";
import * as GrapeVerificationRegistry from "@grapenpm/grape-verification-registry";
import * as VineReputationClient from "@grapenpm/vine-reputation-client";

interface WalletProvider {
  publicKey?: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
}

interface AnchorCompatibleWallet {
  publicKey: PublicKey;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
}

interface MemberFormState {
  gateId: string;
  identityValue: string;
  reputationAccount: string;
  identityAccount: string;
  linkAccount: string;
  tokenAccount: string;
  storeRecord: boolean;
}

interface MemberCheckState {
  status: "idle" | "success" | "error";
  message: string;
  signature?: string;
  passed?: boolean;
  response?: unknown;
}

interface MemberDeriveState {
  status: "idle" | "success" | "error";
  message: string;
}

interface IdentityDebugState {
  status: "idle" | "success" | "error";
  message: string;
  lines: string[];
}

type ClusterKind = "devnet" | "testnet" | "mainnet-beta" | "custom";

interface CommunityAction {
  label: string;
  href: string;
}

interface CommunityProfile {
  name: string;
  subtitle: string;
  accent: string;
  supportLabel: string;
  passActions: CommunityAction[];
  failActions: CommunityAction[];
}

interface GateContextState {
  status: "idle" | "loading" | "ready" | "error";
  message: string;
  gateId?: string;
  criteriaVariant?: { type: string; config: Record<string, unknown> };
  gateTypeLabel?: string;
  profile: CommunityProfile;
}

interface VerificationLinkContext {
  daoId: PublicKey;
  salt: Uint8Array;
}

interface IdentitySeedCandidate {
  platformSeed: number;
  idHash: Uint8Array;
}

const DEFAULT_COMMUNITY_PROFILE: CommunityProfile = {
  name: "Grape Community Access",
  subtitle: "Community-verified access powered by on-chain gate checks.",
  accent: "#6db8ff",
  supportLabel: "Need help? Contact your community moderators.",
  passActions: [
    { label: "Open Community Hub", href: "https://grape.network" }
  ],
  failActions: [
    { label: "Community Help Center", href: "https://grape.network" }
  ]
};

const COMMUNITY_PROFILES_BY_GATE: Record<string, CommunityProfile> = {
  // Add your real gate IDs here to brand the user experience per community.
  // "<GATE_PUBLIC_KEY>": {
  //   name: "My DAO Access",
  //   subtitle: "Token + identity gated access for verified members.",
  //   accent: "#22b183",
  //   supportLabel: "Need help? Open a support ticket in #access-help.",
  //   passActions: [{ label: "Open Member Dashboard", href: "https://example.com/dashboard" }],
  //   failActions: [{ label: "How To Qualify", href: "https://example.com/qualify" }]
  // }
};

const PLATFORM_LABELS: Record<number, string> = {
  0: "Discord",
  1: "Telegram",
  2: "Twitter",
  3: "Email"
};
const PLATFORM_TAGS: Record<number, string> = {
  0: "discord",
  1: "telegram",
  2: "twitter",
  3: "email"
};

declare global {
  interface Window {
    Buffer?: typeof Buffer;
  }
}

const {
  GPASS_PROGRAM_ID,
  GRAPE_VERIFICATION_PROGRAM_ID,
  VINE_REPUTATION_PROGRAM_ID,
  findGatePda,
  findGrapeIdentityPda,
  findGrapeLinkPda
} = GPassSdk;

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const SHYFT_MAINNET_RPC =
  process.env.NEXT_PUBLIC_SHYFT_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";
const DEFAULT_CLUSTER: ClusterKind = "mainnet-beta";

const defaultMemberForm: MemberFormState = {
  gateId: "",
  identityValue: "",
  reputationAccount: "",
  identityAccount: "",
  linkAccount: "",
  tokenAccount: "",
  storeRecord: false
};

function parsePublicKey(label: string, raw: string, required: boolean) {
  const value = raw.trim();
  if (!value && !required) {
    return undefined;
  }
  if (!value && required) {
    throw new Error(`${label} is required.`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} is not a valid public key.`);
  }
}

function deriveAtaAddress(mint: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function normalizePlatforms(platforms: unknown): number[] {
  if (!platforms) {
    return [];
  }
  if (Array.isArray(platforms)) {
    return platforms
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255);
  }
  if (platforms instanceof Uint8Array) {
    return Array.from(platforms);
  }
  if (typeof platforms === "object") {
    const maybeArrayLike = platforms as { data?: number[] | Uint8Array };
    if (Array.isArray(maybeArrayLike.data)) {
      return maybeArrayLike.data;
    }
    if (maybeArrayLike.data instanceof Uint8Array) {
      return Array.from(maybeArrayLike.data);
    }
  }
  return [];
}

function extractCriteriaVariant(criteria: unknown): { type: string; config: Record<string, unknown> } | null {
  if (!criteria || typeof criteria !== "object") {
    return null;
  }
  const value = criteria as Record<string, unknown>;
  const keys = [
    "minReputation",
    "verifiedIdentity",
    "verifiedWithWallet",
    "combined",
    "timeLockedReputation",
    "multiDao",
    "tokenHolding",
    "nftCollection",
    "customProgram"
  ];

  for (const key of keys) {
    const maybeConfig = value[key];
    if (maybeConfig && typeof maybeConfig === "object") {
      return { type: key, config: maybeConfig as Record<string, unknown> };
    }
  }
  return null;
}

function extractGateTypeLabel(gateType: unknown) {
  if (!gateType || typeof gateType !== "object") {
    return "Unknown gate type";
  }
  const value = gateType as Record<string, unknown>;
  if (value.singleUse) {
    return "Single Use";
  }
  if (value.reusable) {
    return "Reusable";
  }
  if (value.timeLimited) {
    return "Time Limited";
  }
  if (value.subscription) {
    return "Subscription";
  }
  return "Unknown gate type";
}

function asPublicKeyValue(value: unknown): PublicKey | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof PublicKey) {
    return value;
  }
  if (typeof value === "string") {
    try {
      return new PublicKey(value);
    } catch {
      return undefined;
    }
  }
  if (typeof value === "object") {
    const maybePk = value as { toBase58?: () => string };
    if (typeof maybePk.toBase58 === "function") {
      try {
        return new PublicKey(maybePk.toBase58());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function asNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === "object") {
    const maybeBn = value as { toNumber?: () => number; toString?: () => string };
    if (typeof maybeBn.toNumber === "function") {
      const parsed = maybeBn.toNumber();
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (typeof maybeBn.toString === "function") {
      const parsed = Number.parseInt(maybeBn.toString(), 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
}

async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API unavailable in this browser.");
  }
  const normalized = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", normalized);
  return new Uint8Array(digest);
}

async function sha256Text(text: string): Promise<Uint8Array> {
  return sha256Bytes(new TextEncoder().encode(text));
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function uniqueByteArrays(values: Uint8Array[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const value of values) {
    if (!out.some((entry) => byteArraysEqual(entry, value))) {
      out.push(value);
    }
  }
  return out;
}

function extractVerificationSaltCandidates(spaceData: Uint8Array): Uint8Array[] {
  const salts: Uint8Array[] = [];
  if (spaceData.length >= 105) {
    salts.push(Uint8Array.from(spaceData.subarray(73, 105)));
  }
  if (spaceData.length >= 73) {
    salts.push(Uint8Array.from(spaceData.subarray(41, 73)));
  }
  return uniqueByteArrays(salts);
}

function identityBelongsToSpace(identityData: Uint8Array, grapeSpace: PublicKey) {
  const spaceBytes = grapeSpace.toBytes();
  if (identityData.length >= 41) {
    if (byteArraysEqual(identityData.subarray(9, 41), spaceBytes)) {
      return true;
    }
  }
  if (identityData.length >= 73) {
    if (byteArraysEqual(identityData.subarray(41, 73), spaceBytes)) {
      return true;
    }
  }
  return false;
}

function extractVerificationLinkContexts(args: {
  grapeSpaceInput: PublicKey;
  resolvedSpace: PublicKey;
  spaceData: Uint8Array;
}): VerificationLinkContext[] {
  const { grapeSpaceInput, resolvedSpace, spaceData } = args;
  const contexts: VerificationLinkContext[] = [];
  const pushContext = (daoId: PublicKey, salt: Uint8Array) => {
    const [derivedSpace] = GrapeVerificationRegistry.deriveSpacePda(daoId);
    if (!derivedSpace.equals(resolvedSpace)) {
      return;
    }
    if (
      contexts.some(
        (entry) => entry.daoId.equals(daoId) && byteArraysEqual(entry.salt, salt)
      )
    ) {
      return;
    }
    contexts.push({ daoId, salt: Uint8Array.from(salt) });
  };

  if (spaceData.length >= 73) {
    pushContext(
      new PublicKey(spaceData.subarray(9, 41)),
      Uint8Array.from(spaceData.subarray(41, 73))
    );
  }
  if (spaceData.length >= 105) {
    pushContext(
      new PublicKey(spaceData.subarray(41, 73)),
      Uint8Array.from(spaceData.subarray(73, 105))
    );
  }

  if (contexts.length === 0) {
    const [derivedFromInput] = GrapeVerificationRegistry.deriveSpacePda(grapeSpaceInput);
    if (derivedFromInput.equals(resolvedSpace)) {
      for (const salt of extractVerificationSaltCandidates(spaceData)) {
        pushContext(grapeSpaceInput, salt);
      }
    }
  }

  return contexts;
}

function extractIdentitySeedCandidatesFromAccount(args: {
  identityAccount: PublicKey;
  identityData: Uint8Array;
  grapeSpace: PublicKey;
}): IdentitySeedCandidate[] {
  const { identityAccount, identityData, grapeSpace } = args;
  const candidates: IdentitySeedCandidate[] = [];
  for (const offset of [41, 73]) {
    if (identityData.length < offset + 33) {
      continue;
    }
    const platformSeed = identityData[offset];
    const idHash = Uint8Array.from(identityData.subarray(offset + 1, offset + 33));
    const [derivedIdentity] = GrapeVerificationRegistry.deriveIdentityPda(
      grapeSpace,
      platformSeed,
      idHash
    );
    if (!derivedIdentity.equals(identityAccount)) {
      continue;
    }
    if (
      candidates.some(
        (entry) =>
          entry.platformSeed === platformSeed && byteArraysEqual(entry.idHash, idHash)
      )
    ) {
      continue;
    }
    candidates.push({ platformSeed, idHash });
  }
  return candidates;
}

function shortHex(bytes: Uint8Array, take = 16) {
  return Buffer.from(bytes).toString("hex").slice(0, take);
}

function buildIdentityValueCandidates(raw: string): string[] {
  const value = raw.trim();
  if (!value) {
    return [];
  }
  const candidates = [value];
  if (value.startsWith("@") && value.length > 1) {
    const withoutAt = value.slice(1);
    if (!candidates.includes(withoutAt)) {
      candidates.push(withoutAt);
    }
  }
  return candidates;
}

async function sendInstructionWithWallet(args: {
  connection: Connection;
  wallet: WalletProvider;
  instruction: TransactionInstruction;
}): Promise<string> {
  const { connection, wallet, instruction } = args;
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Connected wallet does not support transaction signing.");
  }

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = wallet.publicKey;
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = latestBlockhash.blockhash;

  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    },
    "confirmed"
  );
  return signature;
}

async function resolveSdkClient(
  connection: Connection,
  wallet: WalletProvider | undefined,
  options?: { readOnly?: boolean }
) {
  const readOnly = options?.readOnly ?? false;
  const sdkAny = GPassSdk as Record<string, unknown>;
  const GpassClientCtor = sdkAny.GpassClient as (new (...args: unknown[]) => unknown) | undefined;

  if (typeof GpassClientCtor !== "function") {
    throw new Error(
      "Installed SDK does not export GpassClient. Please update @grapenpm/grape-access-sdk."
    );
  }

  if (!readOnly && (!wallet?.publicKey || !wallet.signTransaction)) {
    throw new Error("Connected wallet does not support transaction signing.");
  }

  const fallbackPublicKey = wallet?.publicKey ?? Keypair.generate().publicKey;
  const signTransaction = wallet?.signTransaction ?? (async (transaction: Transaction) => transaction);
  const signAllTransactions =
    wallet?.signAllTransactions ??
    (async (transactions: Transaction[]) => Promise.all(transactions.map((tx) => signTransaction(tx))));

  const anchorWallet: AnchorCompatibleWallet = {
    publicKey: fallbackPublicKey,
    signTransaction,
    signAllTransactions
  };

  const provider = new AnchorProvider(connection, anchorWallet as never, {
    commitment: "confirmed"
  });

  return new GpassClientCtor(provider, GPASS_PROGRAM_ID);
}

function extractSignature(result: unknown) {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const value = result as Record<string, unknown>;
  const signatureKeys = ["signature", "tx", "txSignature", "transactionSignature"];

  for (const key of signatureKeys) {
    const maybeSignature = value[key];
    if (typeof maybeSignature === "string") {
      return maybeSignature;
    }
  }

  return undefined;
}

function extractPassStatus(result: unknown): boolean | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const value = result as Record<string, unknown>;
  const passKeys = ["passed", "isPassed", "allowed", "accessGranted"];
  for (const key of passKeys) {
    const maybeValue = value[key];
    if (typeof maybeValue === "boolean") {
      return maybeValue;
    }
  }

  const nested = value.result;
  if (nested && typeof nested === "object") {
    const nestedValue = nested as Record<string, unknown>;
    for (const key of passKeys) {
      const maybeValue = nestedValue[key];
      if (typeof maybeValue === "boolean") {
        return maybeValue;
      }
    }
  }

  return undefined;
}

function toDisplayValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toDisplayValue(item));
  }

  if (typeof value === "object") {
    const maybePk = value as { toBase58?: () => string };
    if (typeof maybePk.toBase58 === "function") {
      return maybePk.toBase58();
    }

    const maybeBn = value as { constructor?: { name?: string }; toString?: () => string };
    if (maybeBn.constructor?.name === "BN" && typeof maybeBn.toString === "function") {
      return maybeBn.toString();
    }

    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = toDisplayValue(nestedValue);
    }
    return output;
  }

  return value;
}

function inferClusterFromEndpoint(endpoint: string) {
  const normalized = endpoint.toLowerCase();
  if (normalized.includes("devnet")) {
    return "devnet";
  }
  if (normalized.includes("testnet")) {
    return "testnet";
  }
  return "mainnet-beta";
}

function explorerLink(signature: string, endpoint: string) {
  const base = `https://explorer.solana.com/tx/${signature}`;
  const cluster = inferClusterFromEndpoint(endpoint);
  if (cluster === "mainnet-beta") {
    return base;
  }
  return `${base}?cluster=${cluster}`;
}

function endpointForCluster(cluster: ClusterKind, customRpc: string) {
  if (cluster === "custom") {
    return customRpc.trim() || undefined;
  }
  if (cluster === "mainnet-beta") {
    return SHYFT_MAINNET_RPC;
  }
  if (cluster === "testnet") {
    return "https://api.testnet.solana.com";
  }
  return "https://api.devnet.solana.com";
}

async function validateProgramOwnedAccount({
  connection,
  label,
  account,
  expectedOwner,
  required = false
}: {
  connection: Connection;
  label: string;
  account?: PublicKey;
  expectedOwner: PublicKey;
  required?: boolean;
}) {
  if (!account) {
    return required ? `${label} is required.` : null;
  }
  const accountInfo = await connection.getAccountInfo(account);
  if (!accountInfo) {
    return `${label} was not found on the selected network.`;
  }
  if (!accountInfo.owner.equals(expectedOwner)) {
    return `${label} has unexpected owner ${accountInfo.owner.toBase58()}. Expected ${expectedOwner.toBase58()}.`;
  }
  return null;
}

async function formatCheckGateError(error: unknown, connection: Connection | null) {
  if (error instanceof SendTransactionError) {
    let logs = error.logs ?? [];
    if (logs.length === 0 && connection) {
      try {
        logs = (await error.getLogs(connection)) ?? [];
      } catch {
        // Ignore log fetch failures.
      }
    }
    const borshLog = logs.find((line) => line.includes("BorshIoError"));
    if (borshLog) {
      return `${error.message} Likely cause: one of Reputation/Identity/Link accounts has the wrong account type for this gate.`;
    }
  }
  return error instanceof Error ? error.message : "Failed to check member access.";
}

async function fetchGateWithCompatibility(
  client: Record<string, unknown>,
  gateId: PublicKey
): Promise<{ gate: Record<string, unknown> | null; gatePda: PublicKey; sdkError?: Error }> {
  const [gatePda] = await findGatePda(gateId, GPASS_PROGRAM_ID);
  let gate: unknown = null;
  let sdkError: Error | undefined;

  const fetchGateMethod = client.fetchGate as ((input: PublicKey) => Promise<unknown>) | undefined;
  if (typeof fetchGateMethod === "function") {
    try {
      gate = await fetchGateMethod.call(client, gateId);
    } catch (error) {
      sdkError = error instanceof Error ? error : new Error("Unknown SDK fetchGate error.");
    }
  }

  if (!gate) {
    const clientAny = client as Record<string, unknown>;
    const program = clientAny.program as Record<string, unknown> | undefined;
    const accountNamespace = program?.account as Record<string, unknown> | undefined;
    const gateAccountClient =
      (accountNamespace?.Gate as Record<string, unknown> | undefined) ??
      (accountNamespace?.gate as Record<string, unknown> | undefined);

    const fetchNullable =
      gateAccountClient?.fetchNullable as ((address: PublicKey) => Promise<unknown>) | undefined;
    const fetchStrict =
      gateAccountClient?.fetch as ((address: PublicKey) => Promise<unknown>) | undefined;

    try {
      if (typeof fetchNullable === "function") {
        gate = await fetchNullable.call(gateAccountClient, gatePda);
      } else if (typeof fetchStrict === "function") {
        gate = await fetchStrict.call(gateAccountClient, gatePda);
      }
    } catch (error) {
      if (!sdkError) {
        sdkError = error instanceof Error ? error : new Error("Unknown Gate account fetch error.");
      }
    }
  }

  if (gate && typeof gate === "object") {
    return { gate: gate as Record<string, unknown>, gatePda, sdkError };
  }
  return { gate: null, gatePda, sdkError };
}

async function resolveVerificationSpaceContext(connection: Connection, grapeSpace: PublicKey) {
  const tryReadSpace = async (candidate: PublicKey) => {
    try {
      const space = await GrapeVerificationRegistry.fetchSpace(connection, candidate);
      if (!space || !space.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
        return null;
      }
      const saltCandidates = extractVerificationSaltCandidates(space.data);
      if (saltCandidates.length === 0) {
        return null;
      }
      return {
        space: candidate,
        saltCandidates,
        spaceData: Uint8Array.from(space.data)
      };
    } catch {
      return null;
    }
  };

  const direct = await tryReadSpace(grapeSpace);
  if (direct) {
    return direct;
  }

  try {
    const [derivedSpace] = GrapeVerificationRegistry.deriveSpacePda(grapeSpace);
    if (!derivedSpace.equals(grapeSpace)) {
      return await tryReadSpace(derivedSpace);
    }
  } catch {
    // Ignore and return null.
  }
  return null;
}

async function findWalletLinkedIdentity({
  connection,
  grapeSpace,
  walletHashes
}: {
  connection: Connection;
  grapeSpace: PublicKey;
  walletHashes: Uint8Array[];
}): Promise<{ identity: PublicKey; link: PublicKey } | null> {
  try {
    for (const walletHash of uniqueByteArrays(walletHashes)) {
      const links = await connection.getProgramAccounts(GRAPE_VERIFICATION_PROGRAM_ID, {
        filters: [{ memcmp: { offset: 41, bytes: bs58.encode(Buffer.from(walletHash)) } }]
      });

      for (const entry of links) {
        let parsed: ReturnType<typeof GrapeVerificationRegistry.parseLink>;
        try {
          parsed = GrapeVerificationRegistry.parseLink(entry.account.data);
        } catch {
          continue;
        }

        const identityInfo = await connection.getAccountInfo(parsed.identity);
        if (!identityInfo || !identityInfo.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
          continue;
        }
        if (!identityBelongsToSpace(identityInfo.data, grapeSpace)) {
          continue;
        }
        return { identity: parsed.identity, link: entry.pubkey };
      }
    }
  } catch {
    // Ignore lookup errors and fall back to other derivation paths.
  }
  return null;
}

async function gateExistsOnConnection(gateId: PublicKey, connection: Connection) {
  try {
    const client = (await resolveSdkClient(connection, undefined, { readOnly: true })) as Record<
      string,
      unknown
    >;
    const { gate } = await fetchGateWithCompatibility(client, gateId);
    return Boolean(gate);
  } catch {
    return false;
  }
}

async function discoverGateCluster(
  gateId: PublicKey,
  currentCluster: ClusterKind,
  customRpc: string
): Promise<ClusterKind | null> {
  const candidates: ClusterKind[] = ["mainnet-beta", "devnet", "testnet", "custom"];
  for (const candidate of candidates) {
    if (candidate === currentCluster) {
      continue;
    }
    const endpoint = endpointForCluster(candidate, customRpc);
    if (!endpoint) {
      continue;
    }
    const candidateConnection = new Connection(endpoint, "confirmed");
    if (await gateExistsOnConnection(gateId, candidateConnection)) {
      return candidate;
    }
  }
  return null;
}

function resolveCommunityProfile(gateId: string): CommunityProfile {
  if (!gateId) {
    return DEFAULT_COMMUNITY_PROFILE;
  }
  return COMMUNITY_PROFILES_BY_GATE[gateId] ?? DEFAULT_COMMUNITY_PROFILE;
}

function formatPlatformList(platforms: number[]) {
  if (!platforms.length) {
    return "any supported platform";
  }
  return platforms.map((entry) => PLATFORM_LABELS[entry] ?? `Platform ${entry}`).join(", ");
}

function renderEligibilitySummary(criteriaVariant?: { type: string; config: Record<string, unknown> }) {
  if (!criteriaVariant) {
    return ["Load a valid gate to view eligibility requirements."];
  }

  const { type, config } = criteriaVariant;
  switch (type) {
    case "minReputation": {
      const minPoints = asNumberValue(config.minPoints) ?? 0;
      const season = asNumberValue(config.season) ?? 0;
      return [
        `Hold at least ${minPoints} reputation points.`,
        `Reputation season: ${season}.`
      ];
    }
    case "verifiedIdentity": {
      const platforms = normalizePlatforms(config.platforms);
      return [`Verify identity on ${formatPlatformList(platforms)}.`];
    }
    case "verifiedWithWallet": {
      const platforms = normalizePlatforms(config.platforms);
      return [
        `Verify identity on ${formatPlatformList(platforms)}.`,
        "Link verified identity to your wallet."
      ];
    }
    case "combined": {
      const minPoints = asNumberValue(config.minPoints) ?? 0;
      const season = asNumberValue(config.season) ?? 0;
      const platforms = normalizePlatforms(config.platforms);
      const requirements = [
        `Hold at least ${minPoints} reputation points (season ${season}).`,
        `Verify identity on ${formatPlatformList(platforms)}.`
      ];
      if (Boolean(config.requireWalletLink)) {
        requirements.push("Wallet link is required.");
      }
      return requirements;
    }
    case "timeLockedReputation": {
      const minPoints = asNumberValue(config.minPoints) ?? 0;
      const season = asNumberValue(config.season) ?? 0;
      const holdSeconds = asNumberValue(config.minHoldDurationSeconds) ?? 0;
      return [
        `Hold at least ${minPoints} reputation points (season ${season}).`,
        `Maintain score for ${holdSeconds} seconds.`
      ];
    }
    case "multiDao": {
      const requiredGates = Array.isArray(config.requiredGates) ? config.requiredGates.length : 0;
      const requireAll = Boolean(config.requireAll);
      return [
        requireAll
          ? `Pass all required gates (${requiredGates} total).`
          : `Pass at least one required gate (${requiredGates} available).`
      ];
    }
    case "tokenHolding": {
      const minAmount = asNumberValue(config.minAmount) ?? 0;
      const checkAta = config.checkAta !== false;
      return [
        `Hold at least ${minAmount} tokens from the configured mint.`,
        checkAta ? "Associated token account check is enabled." : "Custom token account may be required."
      ];
    }
    case "nftCollection": {
      const minCount = asNumberValue(config.minCount) ?? 1;
      return [`Hold at least ${minCount} NFT(s) in the required collection.`];
    }
    case "customProgram":
      return ["Custom program criteria applies for this gate."];
    default:
      return ["Unknown criteria format. Verify SDK and gate configuration."];
  }
}

export default function AccessPage() {
  const wallet = useWallet();

  const [cluster, setCluster] = useState<ClusterKind>(DEFAULT_CLUSTER);
  const [customRpc, setCustomRpc] = useState("");

  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberForm);
  const [memberCheck, setMemberCheck] = useState<MemberCheckState>({
    status: "idle",
    message: "Connect your wallet and run a gate check."
  });
  const [memberDerive, setMemberDerive] = useState<MemberDeriveState>({
    status: "idle",
    message: "Use auto-derive to populate required accounts for your gate."
  });
  const [identityDebug, setIdentityDebug] = useState<IdentityDebugState>({
    status: "idle",
    message: "",
    lines: []
  });
  const [suggestedCluster, setSuggestedCluster] = useState<ClusterKind | null>(null);
  const [gateContext, setGateContext] = useState<GateContextState>({
    status: "idle",
    message: "Enter a gate ID to load community profile and requirements.",
    profile: DEFAULT_COMMUNITY_PROFILE
  });

  const [gateLoadBusy, setGateLoadBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberDeriveBusy, setMemberDeriveBusy] = useState(false);
  const [linkWalletBusy, setLinkWalletBusy] = useState(false);
  const [identityDebugBusy, setIdentityDebugBusy] = useState(false);
  const [lastRpcProbeSlot, setLastRpcProbeSlot] = useState<number | null>(null);
  const [derivedGatePda, setDerivedGatePda] = useState("");

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info">("info");

  useEffect(() => {
    if (typeof window !== "undefined" && !window.Buffer) {
      window.Buffer = Buffer;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const persistedCluster = window.localStorage.getItem("grape_access_cluster");
    const persistedCustomRpc = window.localStorage.getItem("grape_access_custom_rpc") ?? "";
    if (
      persistedCluster === "devnet" ||
      persistedCluster === "testnet" ||
      persistedCluster === "mainnet-beta" ||
      persistedCluster === "custom"
    ) {
      setCluster(persistedCluster);
    }
    if (persistedCustomRpc) {
      setCustomRpc(persistedCustomRpc);
    }

    const params = new URLSearchParams(window.location.search);
    const gateIdFromQuery = params.get("gateId")?.trim() ?? "";
    if (gateIdFromQuery) {
      try {
        setMemberForm((prev) => ({ ...prev, gateId: new PublicKey(gateIdFromQuery).toBase58() }));
      } catch {
        // Ignore malformed gate IDs in query params.
      }
    }

    const clusterFromQuery = params.get("cluster")?.trim();
    if (
      clusterFromQuery === "devnet" ||
      clusterFromQuery === "testnet" ||
      clusterFromQuery === "mainnet-beta" ||
      clusterFromQuery === "custom"
    ) {
      setCluster(clusterFromQuery);
    }

    const rpcFromQuery = params.get("rpc")?.trim();
    if (rpcFromQuery) {
      setCustomRpc(rpcFromQuery);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("grape_access_cluster", cluster);
  }, [cluster]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("grape_access_custom_rpc", customRpc);
  }, [customRpc]);

  const rpcEndpoint = useMemo(() => endpointForCluster(cluster, customRpc) ?? "", [cluster, customRpc]);

  const connection = useMemo(() => {
    if (!rpcEndpoint) {
      return null;
    }
    return new Connection(rpcEndpoint, "confirmed");
  }, [rpcEndpoint]);

  const isWalletConnected = Boolean(wallet.connected && wallet.publicKey);
  const connectedWalletAddress = wallet.publicKey?.toBase58() ?? "";

  const memberPreview = useMemo(
    () => ({
      gateId: memberForm.gateId,
      user: connectedWalletAddress || "wallet.publicKey",
      identityValue: memberForm.identityValue || undefined,
      reputationAccount: memberForm.reputationAccount || undefined,
      identityAccount: memberForm.identityAccount || undefined,
      linkAccount: memberForm.linkAccount || undefined,
      tokenAccount: memberForm.tokenAccount || undefined,
      storeRecord: memberForm.storeRecord
    }),
    [memberForm, connectedWalletAddress]
  );

  const eligibilitySummary = useMemo(
    () => renderEligibilitySummary(gateContext.criteriaVariant),
    [gateContext.criteriaVariant]
  );

  const progressStep = useMemo(() => {
    if (!isWalletConnected) {
      return 0;
    }
    if (gateContext.status !== "ready") {
      return 1;
    }
    return 2;
  }, [isWalletConnected, gateContext.status]);

  const notify = (message: string, severity: "success" | "error" | "info") => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const updateMemberForm = <K extends keyof MemberFormState>(key: K, value: MemberFormState[K]) => {
    setMemberForm((prev) => ({ ...prev, [key]: value }));
  };

  const syncUrl = (nextGateId: string) => {
    if (typeof window === "undefined") {
      return;
    }
    const nextUrl = new URL(window.location.href);
    if (nextGateId.trim()) {
      nextUrl.searchParams.set("gateId", nextGateId.trim());
    } else {
      nextUrl.searchParams.delete("gateId");
    }
    nextUrl.searchParams.set("cluster", cluster);
    if (cluster === "custom" && customRpc.trim()) {
      nextUrl.searchParams.set("rpc", customRpc.trim());
    } else {
      nextUrl.searchParams.delete("rpc");
    }
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    notify("Copied to clipboard.", "success");
  };

  const setMemberGateId = (value: string) => {
    updateMemberForm("gateId", value);
    syncUrl(value);
  };

  useEffect(() => {
    syncUrl(memberForm.gateId);
    // Keep URL network params aligned when user switches cluster/RPC.
  }, [cluster, customRpc]);

  const buildShareLink = (gateIdRaw: string) => {
    const gateId = gateIdRaw.trim();
    if (!gateId) {
      return "";
    }
    const normalizedGateId = parsePublicKey("Gate ID", gateId, true)!.toBase58();
    if (typeof window === "undefined") {
      return "";
    }
    const url = new URL(window.location.origin + "/access");
    url.searchParams.set("gateId", normalizedGateId);
    url.searchParams.set("cluster", cluster);
    if (cluster === "custom" && customRpc.trim()) {
      url.searchParams.set("rpc", customRpc.trim());
    }
    return url.toString();
  };

  const copyShareLink = async () => {
    try {
      const link = buildShareLink(memberForm.gateId);
      if (!link) {
        throw new Error("Gate ID is required before copying a share link.");
      }
      await navigator.clipboard.writeText(link);
      notify("Share link copied.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to copy share link.", "error");
    }
  };

  const getClient = async ({ readOnly = false }: { readOnly?: boolean } = {}) => {
    if (!connection) {
      throw new Error("Choose a valid RPC endpoint first.");
    }
    if (!readOnly && !wallet.publicKey) {
      throw new Error("Connect wallet before checking access.");
    }

    return (await resolveSdkClient(connection, wallet as unknown as WalletProvider, {
      readOnly
    })) as Record<string, unknown>;
  };

  const loadGateContext = async (
    gateIdRaw: string,
    { silent = true }: { silent?: boolean } = {}
  ): Promise<{ criteriaVariant: { type: string; config: Record<string, unknown> } } | null> => {
    const trimmedGateId = gateIdRaw.trim();
    if (!trimmedGateId) {
      setSuggestedCluster(null);
      setGateContext({
        status: "idle",
        message: "Enter a gate ID to load community profile and requirements.",
        profile: DEFAULT_COMMUNITY_PROFILE
      });
      return null;
    }

    let gateId: PublicKey;
    try {
      gateId = parsePublicKey("Gate ID", trimmedGateId, true)!;
    } catch {
      if (trimmedGateId.length < 32) {
        setSuggestedCluster(null);
        setGateContext({
          status: "idle",
          message: "Continue entering the gate ID.",
          profile: DEFAULT_COMMUNITY_PROFILE
        });
      } else {
        setSuggestedCluster(null);
        setGateContext({
          status: "error",
          message: "Gate ID format is invalid.",
          profile: DEFAULT_COMMUNITY_PROFILE
        });
      }
      return null;
    }

    if (!connection) {
      setSuggestedCluster(null);
      setGateContext({
        status: "error",
        gateId: gateId.toBase58(),
        message: "Choose a valid RPC endpoint first.",
        profile: resolveCommunityProfile(gateId.toBase58())
      });
      return null;
    }

    setGateContext((prev) => ({
      ...prev,
      status: "loading",
      gateId: gateId.toBase58(),
      message: "Loading gate configuration...",
      profile: resolveCommunityProfile(gateId.toBase58())
    }));

    let compatibilityErrorMessage: string | undefined;
    try {
      const probeSlot = await connection.getSlot("processed");
      setLastRpcProbeSlot(probeSlot);
      const client = await getClient({ readOnly: true });
      const { gate, sdkError } = await fetchGateWithCompatibility(client, gateId);
      compatibilityErrorMessage = sdkError?.message;

      if (!gate) {
        throw new Error("Gate not found for this gate ID.");
      }

      const criteriaVariant = extractCriteriaVariant(gate.criteria);
      if (!criteriaVariant) {
        throw new Error("Could not read gate criteria.");
      }

      setGateContext({
        status: "ready",
        gateId: gateId.toBase58(),
        message: `Gate loaded (RPC slot ${probeSlot}). You can now auto-derive accounts and run checks.`,
        criteriaVariant,
        gateTypeLabel: extractGateTypeLabel(gate.gateType),
        profile: resolveCommunityProfile(gateId.toBase58())
      });
      setSuggestedCluster(null);

      return { criteriaVariant };
    } catch (error) {
      let message = error instanceof Error ? error.message : "Failed to load gate.";
      let nextSuggestedCluster: ClusterKind | null = null;
      if (message.toLowerCase().includes("gate not found")) {
        let derivedGatePda: PublicKey | null = null;
        let derivedGateExists = false;
        try {
          [derivedGatePda] = await findGatePda(gateId, GPASS_PROGRAM_ID);
          if (derivedGatePda) {
            derivedGateExists = Boolean(await connection.getAccountInfo(derivedGatePda));
          }
        } catch {
          // Ignore PDA derivation diagnostics failure.
        }

        const discoveredCluster = await discoverGateCluster(gateId, cluster, customRpc);
        if (discoveredCluster) {
          nextSuggestedCluster = discoveredCluster;
          message = `Gate not found on ${cluster}. It appears on ${discoveredCluster}. Switch network and try again.`;
        } else if (derivedGatePda && !derivedGateExists) {
          message = `Gate ID is an identifier (not the on-chain gate account). Derived Gate PDA ${derivedGatePda.toBase58()} was not found on ${cluster}.`;
        } else if (derivedGatePda && derivedGateExists) {
          message = `Derived Gate PDA ${derivedGatePda.toBase58()} exists on ${cluster}, but SDK decode failed. Verify SDK/program compatibility.${compatibilityErrorMessage ? ` SDK detail: ${compatibilityErrorMessage}` : ""}`;
        } else {
          message =
            "Gate not found for this gate ID on the selected network. Check cluster/RPC or verify the gate exists on-chain.";
        }
      }
      setSuggestedCluster(nextSuggestedCluster);
      setGateContext({
        status: "error",
        gateId: gateId.toBase58(),
        message,
        profile: resolveCommunityProfile(gateId.toBase58())
      });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    }
  };

  const applySuggestedNetwork = () => {
    if (!suggestedCluster) {
      return;
    }
    setCluster(suggestedCluster);
    notify(`Switched network to ${suggestedCluster}.`, "info");
  };

  const handleLoadGate = async () => {
    if (!memberForm.gateId.trim()) {
      notify("Gate ID is required before loading.", "error");
      return;
    }
    if (!connection) {
      notify("Choose a valid RPC endpoint first.", "error");
      return;
    }

    setGateLoadBusy(true);
    try {
      const loaded = await loadGateContext(memberForm.gateId, { silent: false });
      if (loaded) {
        notify("Gate profile loaded.", "success");
      }
    } finally {
      setGateLoadBusy(false);
    }
  };

  useEffect(() => {
    if (!memberForm.gateId.trim()) {
      setDerivedGatePda("");
      setGateContext({
        status: "idle",
        message: "Enter a gate ID to load community profile and requirements.",
        profile: DEFAULT_COMMUNITY_PROFILE
      });
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadGateContext(memberForm.gateId, { silent: true });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [memberForm.gateId, rpcEndpoint]);

  useEffect(() => {
    let cancelled = false;
    const computeDerivedPda = async () => {
      const gateIdRaw = memberForm.gateId.trim();
      if (!gateIdRaw) {
        setDerivedGatePda("");
        return;
      }
      try {
        const gateId = parsePublicKey("Gate ID", gateIdRaw, true)!;
        const [gatePda] = await findGatePda(gateId, GPASS_PROGRAM_ID);
        if (!cancelled) {
          setDerivedGatePda(gatePda.toBase58());
        }
      } catch {
        if (!cancelled) {
          setDerivedGatePda("");
        }
      }
    };
    void computeDerivedPda();
    return () => {
      cancelled = true;
    };
  }, [memberForm.gateId]);

  const handleAutoDeriveMemberAccounts = async (
    { silent = false }: { silent?: boolean } = {}
  ): Promise<MemberFormState | null> => {
    if (!wallet.publicKey || !connection) {
      const message = "Connect wallet and choose a valid RPC endpoint first.";
      setMemberDerive({ status: "error", message });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    }

    const gateIdRaw = memberForm.gateId.trim();
    if (!gateIdRaw) {
      const message = "Gate ID is required before auto-deriving accounts.";
      setMemberDerive({ status: "error", message });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    }

    setMemberDeriveBusy(true);
    try {
      const loaded = await loadGateContext(gateIdRaw, { silent: false });
      if (!loaded) {
        const message = "Unable to derive accounts until gate profile loads successfully.";
        setMemberDerive({ status: "error", message });
        if (!silent) {
          notify(message, "error");
        }
        return null;
      }

      const criteriaVariant = loaded.criteriaVariant;
      const updates: Partial<MemberFormState> = {};
      const notes: string[] = [];
      const blockers: string[] = [];
      const addBlocker = (message: string) => {
        if (!blockers.includes(message)) {
          blockers.push(message);
        }
      };
      let derivedCount = 0;
      let selectedIdentity = asPublicKeyValue(memberForm.identityAccount);
      let selectedLink = asPublicKeyValue(memberForm.linkAccount);

      if (
        criteriaVariant.type === "minReputation" ||
        criteriaVariant.type === "timeLockedReputation" ||
        criteriaVariant.type === "combined"
      ) {
        const vineConfig = asPublicKeyValue(criteriaVariant.config.vineConfig);
        const season = asNumberValue(criteriaVariant.config.season);
        if (vineConfig && season !== undefined) {
          const [reputationPda] = VineReputationClient.getReputationPda(
            vineConfig,
            wallet.publicKey,
            season,
            VINE_REPUTATION_PROGRAM_ID
          );
          const nextReputation = reputationPda.toBase58();
          updates.reputationAccount = nextReputation;
          if (nextReputation !== memberForm.reputationAccount.trim()) {
            derivedCount += 1;
          }
        } else {
          notes.push("Could not derive reputation account from gate criteria.");
        }
      }

      if (
        criteriaVariant.type === "verifiedIdentity" ||
        criteriaVariant.type === "verifiedWithWallet" ||
        criteriaVariant.type === "combined"
      ) {
        const grapeSpaceInput = asPublicKeyValue(criteriaVariant.config.grapeSpace);
        const resolvedVerificationSpace = grapeSpaceInput
          ? await resolveVerificationSpaceContext(connection, grapeSpaceInput)
          : null;
        const grapeSpace = resolvedVerificationSpace?.space ?? grapeSpaceInput;
        const verificationSaltCandidates = resolvedVerificationSpace?.saltCandidates ?? [];
        const platforms = normalizePlatforms(criteriaVariant.config.platforms);
        if (!selectedIdentity && !selectedLink && grapeSpace && verificationSaltCandidates.length > 0) {
          const walletHashes = uniqueByteArrays(
            verificationSaltCandidates.map((salt) =>
              GrapeVerificationRegistry.walletHash(salt, wallet.publicKey!)
            )
          );
          const linked = await findWalletLinkedIdentity({
            connection,
            grapeSpace,
            walletHashes
          });
          if (linked) {
            selectedIdentity = linked.identity;
            selectedLink = linked.link;
            notes.push("Resolved identity and wallet link from verification registry.");
          }
        }

        if (!selectedIdentity) {
          const identityValueCandidates = buildIdentityValueCandidates(memberForm.identityValue);
          if (grapeSpace && identityValueCandidates.length > 0) {
            const platformCandidates = platforms.length > 0 ? platforms : [0];

            let fallbackIdentity: PublicKey | undefined;
            if (verificationSaltCandidates.length > 0) {
              for (const verificationSpaceSalt of verificationSaltCandidates) {
                for (const identityValueCandidate of identityValueCandidates) {
                  for (const platformSeed of platformCandidates) {
                    const tag = PLATFORM_TAGS[platformSeed];
                    if (!tag) {
                      continue;
                    }
                    const idHash = GrapeVerificationRegistry.identityHash(
                      verificationSpaceSalt,
                      tag,
                      identityValueCandidate
                    );
                    const [identityPda] = GrapeVerificationRegistry.deriveIdentityPda(
                      grapeSpace,
                      platformSeed,
                      idHash
                    );
                    fallbackIdentity = fallbackIdentity ?? identityPda;
                    const exists = await connection.getAccountInfo(identityPda);
                    if (exists) {
                      selectedIdentity = identityPda;
                      break;
                    }
                  }
                  if (selectedIdentity) {
                    break;
                  }
                }
                if (selectedIdentity) {
                  break;
                }
              }
            }

            if (!selectedIdentity) {
              for (const identityValueCandidate of identityValueCandidates) {
                const idHash = await sha256Text(identityValueCandidate);
                for (const platformSeed of platformCandidates) {
                  const [identityPda] = await findGrapeIdentityPda(
                    grapeSpace,
                    platformSeed,
                    idHash,
                    GRAPE_VERIFICATION_PROGRAM_ID
                  );
                  fallbackIdentity = fallbackIdentity ?? identityPda;
                  const exists = await connection.getAccountInfo(identityPda);
                  if (exists) {
                    selectedIdentity = identityPda;
                    break;
                  }
                }
                if (selectedIdentity) {
                  break;
                }
              }
            }

            if (!selectedIdentity && fallbackIdentity) {
              selectedIdentity = fallbackIdentity;
              notes.push("Identity PDA derived but account existence was not confirmed.");
            }
          } else {
            addBlocker(
              "Identity is required for this gate. Enter Identity Value or Identity Account."
            );
          }
        }

        if (selectedIdentity) {
          const nextIdentity = selectedIdentity.toBase58();
          updates.identityAccount = nextIdentity;
          if (nextIdentity !== memberForm.identityAccount.trim()) {
            derivedCount += 1;
          }
        }

        const requiresLink =
          criteriaVariant.type === "verifiedWithWallet" ||
          (criteriaVariant.type === "combined" && Boolean(criteriaVariant.config.requireWalletLink));

        if (requiresLink) {
          if (selectedLink) {
            const nextLink = selectedLink.toBase58();
            updates.linkAccount = nextLink;
            if (nextLink !== memberForm.linkAccount.trim()) {
              derivedCount += 1;
            }
          } else if (!selectedIdentity) {
            addBlocker("Wallet link is required but identity account is missing.");
          } else {
            if (verificationSaltCandidates.length > 0) {
              const registryWalletHashes = uniqueByteArrays(
                verificationSaltCandidates.map((salt) =>
                  GrapeVerificationRegistry.walletHash(salt, wallet.publicKey!)
                )
              );
              for (const registryWalletHash of registryWalletHashes) {
                const [registryLinkPda] = GrapeVerificationRegistry.deriveLinkPda(
                  selectedIdentity,
                  registryWalletHash
                );
                const registryLinkExists = await connection.getAccountInfo(registryLinkPda);
                if (registryLinkExists) {
                  selectedLink = registryLinkPda;
                  break;
                }
                const linkedWallets = await GrapeVerificationRegistry.fetchLinkedWallets(
                  connection,
                  selectedIdentity,
                  registryWalletHash,
                  GRAPE_VERIFICATION_PROGRAM_ID
                );
                const currentWalletLink = linkedWallets.find((entry) => entry.isCurrentWallet);
                if (currentWalletLink) {
                  selectedLink = currentWalletLink.pubkey;
                  break;
                }
              }
            }

            if (!selectedLink) {
              const walletHashCandidates: Uint8Array[] = [];
              const firstHash = await sha256Bytes(wallet.publicKey.toBytes());
              walletHashCandidates.push(firstHash);
              const secondHash = await sha256Text(wallet.publicKey.toBase58());
              if (!byteArraysEqual(secondHash, firstHash)) {
                walletHashCandidates.push(secondHash);
              }

              for (const walletHash of walletHashCandidates) {
                const [linkPda] = await findGrapeLinkPda(
                  selectedIdentity,
                  walletHash,
                  GRAPE_VERIFICATION_PROGRAM_ID
                );
                selectedLink = selectedLink ?? linkPda;
                const exists = await connection.getAccountInfo(linkPda);
                if (exists) {
                  selectedLink = linkPda;
                  break;
                }
              }
            }

            if (selectedLink) {
              const nextLink = selectedLink.toBase58();
              updates.linkAccount = nextLink;
              if (nextLink !== memberForm.linkAccount.trim()) {
                derivedCount += 1;
              }
            } else {
              addBlocker(
                "Wallet link is required for this gate. Enter Link Account manually if auto-derivation cannot find it."
              );
            }
          }
        }

        if (!selectedIdentity) {
          addBlocker("Could not resolve identity account from current inputs.");
        }
      }

      if (criteriaVariant.type === "tokenHolding") {
        const mint = asPublicKeyValue(criteriaVariant.config.mint);
        const checkAta = criteriaVariant.config.checkAta !== false;
        if (mint && checkAta) {
          const nextTokenAccount = deriveAtaAddress(mint, wallet.publicKey).toBase58();
          updates.tokenAccount = nextTokenAccount;
          if (nextTokenAccount !== memberForm.tokenAccount.trim()) {
            derivedCount += 1;
          }
        } else if (!checkAta) {
          notes.push("Gate expects a custom token account (ATA check disabled).");
        } else {
          notes.push("Could not derive token ATA from gate criteria.");
        }
      }

      const requiresReputation =
        criteriaVariant.type === "minReputation" ||
        criteriaVariant.type === "timeLockedReputation" ||
        criteriaVariant.type === "combined";
      const requiresIdentity =
        criteriaVariant.type === "verifiedIdentity" ||
        criteriaVariant.type === "verifiedWithWallet" ||
        criteriaVariant.type === "combined";
      const requiresLink =
        criteriaVariant.type === "verifiedWithWallet" ||
        (criteriaVariant.type === "combined" && Boolean(criteriaVariant.config.requireWalletLink));

      const resolvedReputation = asPublicKeyValue(updates.reputationAccount ?? memberForm.reputationAccount);
      const resolvedIdentity = asPublicKeyValue(updates.identityAccount ?? memberForm.identityAccount);
      const resolvedLink = asPublicKeyValue(updates.linkAccount ?? memberForm.linkAccount);
      const grapeSpace = asPublicKeyValue(criteriaVariant.config.grapeSpace);

      const reputationError = await validateProgramOwnedAccount({
        connection,
        label: "Reputation account",
        account: resolvedReputation,
        expectedOwner: VINE_REPUTATION_PROGRAM_ID,
        required: requiresReputation
      });
      if (reputationError) {
        addBlocker(reputationError);
      }

      if (requiresIdentity && grapeSpace && resolvedIdentity?.equals(grapeSpace)) {
        addBlocker("Identity account cannot be the Grape Space address. Use your identity PDA account.");
      }

      const identityError = await validateProgramOwnedAccount({
        connection,
        label: "Identity account",
        account: resolvedIdentity,
        expectedOwner: GRAPE_VERIFICATION_PROGRAM_ID,
        required: requiresIdentity
      });
      if (identityError) {
        addBlocker(identityError);
      }

      const linkError = await validateProgramOwnedAccount({
        connection,
        label: "Link account",
        account: resolvedLink,
        expectedOwner: GRAPE_VERIFICATION_PROGRAM_ID,
        required: requiresLink
      });
      if (linkError) {
        addBlocker(linkError);
      }

      setMemberForm((prev) => ({ ...prev, ...updates }));
      const mergedForm = { ...memberForm, ...updates };
      if (blockers.length > 0) {
        const message = `${blockers.join(" ")}${notes.length ? ` ${notes.join(" ")}` : ""}`;
        setMemberDerive({ status: "error", message });
        if (!silent) {
          notify(message, "error");
        }
        return null;
      }
      const message =
        derivedCount > 0
          ? `Derived ${derivedCount} account(s).${notes.length ? ` ${notes.join(" ")}` : ""}`
          : notes.length
            ? notes.join(" ")
            : "No accounts needed for this gate type.";
      setMemberDerive({ status: "success", message });
      if (!silent) {
        notify(message, "success");
      }
      return mergedForm;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to auto-derive member accounts.";
      setMemberDerive({ status: "error", message });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    } finally {
      setMemberDeriveBusy(false);
    }
  };

  const handleMemberCheck = async () => {
    if (!wallet.publicKey || !connection) {
      const message = "Connect wallet and choose a valid RPC endpoint first.";
      setMemberCheck({ status: "error", message });
      notify(message, "error");
      return;
    }

    setMemberBusy(true);
    try {
      const derivedForm = await handleAutoDeriveMemberAccounts({ silent: true });
      if (!derivedForm) {
        throw new Error(
          "Unable to prepare required accounts. For identity-based gates, provide Identity Value or Identity/Link account and retry."
        );
      }
      const effectiveForm = derivedForm ?? memberForm;

      const params = {
        gateId: parsePublicKey("Gate ID", effectiveForm.gateId, true)!,
        user: wallet.publicKey,
        reputationAccount: parsePublicKey("Reputation account", effectiveForm.reputationAccount, false),
        identityAccount: parsePublicKey("Identity account", effectiveForm.identityAccount, false),
        linkAccount: parsePublicKey("Link account", effectiveForm.linkAccount, false),
        tokenAccount: parsePublicKey("Token account", effectiveForm.tokenAccount, false),
        storeRecord: effectiveForm.storeRecord
      };

      const client = await getClient();
      const method = client.checkGate as ((arg: unknown) => unknown) | undefined;
      if (typeof method !== "function") {
        throw new Error("SDK client is missing checkGate.");
      }

      const result = await Promise.resolve(method.call(client, params));
      const signature = extractSignature(result);
      const passed = extractPassStatus(result);
      const resultMessage =
        passed === true
          ? "Access granted for this gate."
          : passed === false
            ? "Access not granted for this gate."
            : signature
              ? "Check transaction submitted."
              : "Check completed.";

      setMemberCheck({
        status: "success",
        message: resultMessage,
        signature,
        passed,
        response: toDisplayValue(result)
      });

      notify(
        signature ? `Member check submitted. Signature: ${signature}` : resultMessage,
        passed === false ? "info" : "success"
      );
    } catch (error) {
      const message = await formatCheckGateError(error, connection);
      setMemberCheck({ status: "error", message });
      notify(message, "error");
    } finally {
      setMemberBusy(false);
    }
  };

  const handleLinkWalletSelf = async () => {
    if (!wallet.publicKey || !connection) {
      const message = "Connect wallet and choose a valid RPC endpoint first.";
      setMemberDerive({ status: "error", message });
      notify(message, "error");
      return;
    }

    const gateIdRaw = memberForm.gateId.trim();
    if (!gateIdRaw) {
      const message = "Gate ID is required before linking your wallet.";
      setMemberDerive({ status: "error", message });
      notify(message, "error");
      return;
    }

    setLinkWalletBusy(true);
    try {
      const loaded = await loadGateContext(gateIdRaw, { silent: false });
      if (!loaded) {
        throw new Error("Unable to link wallet until gate profile loads successfully.");
      }

      const criteriaVariant = loaded.criteriaVariant;
      const isIdentityGate =
        criteriaVariant.type === "verifiedIdentity" ||
        criteriaVariant.type === "verifiedWithWallet" ||
        criteriaVariant.type === "combined";
      if (!isIdentityGate) {
        throw new Error("This gate does not use identity verification.");
      }

      const grapeSpaceInput = asPublicKeyValue(criteriaVariant.config.grapeSpace);
      if (!grapeSpaceInput) {
        throw new Error("Gate criteria is missing a valid Grape space.");
      }

      const resolvedVerificationSpace = await resolveVerificationSpaceContext(
        connection,
        grapeSpaceInput
      );
      if (!resolvedVerificationSpace) {
        throw new Error("Could not resolve verification space/salt from gate criteria.");
      }

      const grapeSpace = resolvedVerificationSpace.space;
      const linkContexts = extractVerificationLinkContexts({
        grapeSpaceInput,
        resolvedSpace: grapeSpace,
        spaceData: resolvedVerificationSpace.spaceData
      });
      if (linkContexts.length === 0) {
        throw new Error(
          "Could not resolve DAO + salt required for wallet linking in this verification space."
        );
      }

      const platforms = normalizePlatforms(criteriaVariant.config.platforms);
      const platformCandidates = platforms.length > 0 ? platforms : [0];
      const identityValueCandidates = buildIdentityValueCandidates(memberForm.identityValue);
      const attempts: Array<{
        daoId: PublicKey;
        salt: Uint8Array;
        platformSeed: number;
        idHash: Uint8Array;
        identity: PublicKey;
      }> = [];
      const seenAttemptKeys = new Set<string>();
      const pushAttempt = (attempt: {
        daoId: PublicKey;
        salt: Uint8Array;
        platformSeed: number;
        idHash: Uint8Array;
        identity: PublicKey;
      }) => {
        const key = [
          attempt.daoId.toBase58(),
          String(attempt.platformSeed),
          bs58.encode(Buffer.from(attempt.idHash)),
          bs58.encode(Buffer.from(attempt.salt))
        ].join(":");
        if (seenAttemptKeys.has(key)) {
          return;
        }
        seenAttemptKeys.add(key);
        attempts.push(attempt);
      };

      if (identityValueCandidates.length > 0) {
        for (const context of linkContexts) {
          for (const identityValueCandidate of identityValueCandidates) {
            for (const platformSeed of platformCandidates) {
              const tag = PLATFORM_TAGS[platformSeed];
              if (!tag) {
                continue;
              }
              const idHash = GrapeVerificationRegistry.identityHash(
                context.salt,
                tag,
                identityValueCandidate
              );
              const [identityPda] = GrapeVerificationRegistry.deriveIdentityPda(
                grapeSpace,
                platformSeed,
                idHash
              );
              const identityInfo = await connection.getAccountInfo(identityPda);
              if (!identityInfo || !identityInfo.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
                continue;
              }
              pushAttempt({
                daoId: context.daoId,
                salt: context.salt,
                platformSeed,
                idHash,
                identity: identityPda
              });
            }
          }
        }
      }

      if (attempts.length === 0) {
        const identityAccount = asPublicKeyValue(memberForm.identityAccount);
        if (identityAccount) {
          const identityInfo = await connection.getAccountInfo(identityAccount);
          if (identityInfo && identityInfo.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
            const seeds = extractIdentitySeedCandidatesFromAccount({
              identityAccount,
              identityData: identityInfo.data,
              grapeSpace
            });
            for (const seed of seeds) {
              for (const context of linkContexts) {
                pushAttempt({
                  daoId: context.daoId,
                  salt: context.salt,
                  platformSeed: seed.platformSeed,
                  idHash: seed.idHash,
                  identity: identityAccount
                });
              }
            }
          }
        }
      }

      if (attempts.length === 0) {
        throw new Error(
          "No verified identity was found. Enter Identity Value (exact verified platform ID) or a valid Identity Account, then retry."
        );
      }

      let lastError: Error | null = null;
      for (const attempt of attempts) {
        const walletHash = GrapeVerificationRegistry.walletHash(attempt.salt, wallet.publicKey);
        const built = GrapeVerificationRegistry.buildLinkWalletSelfIx({
          daoId: attempt.daoId,
          platformSeed: attempt.platformSeed,
          idHash: attempt.idHash,
          wallet: wallet.publicKey,
          walletHash,
          payer: wallet.publicKey,
          programId: GRAPE_VERIFICATION_PROGRAM_ID
        });
        if (!built.spaceAcct.equals(grapeSpace) || !built.identity.equals(attempt.identity)) {
          continue;
        }

        const existingLink = await connection.getAccountInfo(built.link);
        if (existingLink && existingLink.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
          setMemberForm((prev) => ({
            ...prev,
            identityAccount: built.identity.toBase58(),
            linkAccount: built.link.toBase58()
          }));
          const message = "Wallet link already exists for this identity.";
          setMemberDerive({ status: "success", message });
          notify(message, "success");
          await handleAutoDeriveMemberAccounts({ silent: true });
          return;
        }

        try {
          const signature = await sendInstructionWithWallet({
            connection,
            wallet: wallet as unknown as WalletProvider,
            instruction: built.ix
          });
          setMemberForm((prev) => ({
            ...prev,
            identityAccount: built.identity.toBase58(),
            linkAccount: built.link.toBase58()
          }));
          await handleAutoDeriveMemberAccounts({ silent: true });
          const message = `Wallet linked successfully. Signature: ${signature}`;
          setMemberDerive({ status: "success", message });
          notify(message, "success");
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error("Failed to submit link wallet transaction.");
        }
      }

      throw lastError ?? new Error("Failed to link wallet for the resolved identity.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to link wallet.";
      setMemberDerive({ status: "error", message });
      notify(message, "error");
    } finally {
      setLinkWalletBusy(false);
    }
  };

  const handleDebugIdentity = async () => {
    if (!wallet.publicKey || !connection) {
      const message = "Connect wallet and choose a valid RPC endpoint first.";
      setIdentityDebug({ status: "error", message, lines: [] });
      notify(message, "error");
      return;
    }

    const gateIdRaw = memberForm.gateId.trim();
    if (!gateIdRaw) {
      const message = "Gate ID is required before running identity debug.";
      setIdentityDebug({ status: "error", message, lines: [] });
      notify(message, "error");
      return;
    }

    setIdentityDebugBusy(true);
    try {
      const loaded = await loadGateContext(gateIdRaw, { silent: false });
      if (!loaded) {
        throw new Error("Unable to debug identity until gate profile loads successfully.");
      }

      const criteriaVariant = loaded.criteriaVariant;
      const isIdentityGate =
        criteriaVariant.type === "verifiedIdentity" ||
        criteriaVariant.type === "verifiedWithWallet" ||
        criteriaVariant.type === "combined";
      if (!isIdentityGate) {
        throw new Error("This gate does not use identity verification.");
      }

      const grapeSpaceInput = asPublicKeyValue(criteriaVariant.config.grapeSpace);
      if (!grapeSpaceInput) {
        throw new Error("Gate criteria is missing a valid Grape space.");
      }

      const lines: string[] = [];
      const platforms = normalizePlatforms(criteriaVariant.config.platforms);
      const platformCandidates = platforms.length > 0 ? platforms : [0];
      lines.push(`Gate criteria type: ${criteriaVariant.type}`);
      lines.push(`Wallet: ${wallet.publicKey.toBase58()}`);
      lines.push(`Input grapeSpace: ${grapeSpaceInput.toBase58()}`);
      lines.push(
        `Platforms: ${platformCandidates.map((p) => `${p}:${PLATFORM_TAGS[p] ?? "unknown"}`).join(", ")}`
      );

      const resolvedVerificationSpace = await resolveVerificationSpaceContext(
        connection,
        grapeSpaceInput
      );
      if (!resolvedVerificationSpace) {
        throw new Error("Could not resolve verification space/salt from gate criteria.");
      }

      const grapeSpace = resolvedVerificationSpace.space;
      const linkContexts = extractVerificationLinkContexts({
        grapeSpaceInput,
        resolvedSpace: grapeSpace,
        spaceData: resolvedVerificationSpace.spaceData
      });
      lines.push(`Resolved grapeSpace: ${grapeSpace.toBase58()}`);
      lines.push(`Salt candidates: ${resolvedVerificationSpace.saltCandidates.length}`);
      lines.push(`Link contexts: ${linkContexts.length}`);
      for (const [index, context] of linkContexts.entries()) {
        lines.push(
          `  - context#${index + 1} daoId=${context.daoId.toBase58()} saltHex=${shortHex(context.salt, 20)}`
        );
      }

      const identityValueCandidates = buildIdentityValueCandidates(memberForm.identityValue);
      lines.push(`Identity Value provided: ${identityValueCandidates.length > 0 ? "yes" : "no"}`);
      if (identityValueCandidates.length > 0) {
        lines.push(`Identity Value candidates: ${identityValueCandidates.join(", ")}`);
      }

      const providedIdentity = asPublicKeyValue(memberForm.identityAccount);
      if (providedIdentity) {
        const info = await connection.getAccountInfo(providedIdentity);
        if (!info) {
          lines.push(`Identity Account input: ${providedIdentity.toBase58()} (missing on network)`);
        } else {
          const ownerOk = info.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID);
          const belongs = identityBelongsToSpace(info.data, grapeSpace);
          lines.push(
            `Identity Account input: ${providedIdentity.toBase58()} (ownerOk=${ownerOk}, belongsToSpace=${belongs})`
          );
          if (ownerOk) {
            const seeds = extractIdentitySeedCandidatesFromAccount({
              identityAccount: providedIdentity,
              identityData: info.data,
              grapeSpace
            });
            lines.push(`Identity Account seed candidates: ${seeds.length}`);
            for (const seed of seeds) {
              lines.push(
                `  - platform=${seed.platformSeed}:${PLATFORM_TAGS[seed.platformSeed] ?? "unknown"} idHashHex=${shortHex(seed.idHash, 24)}`
              );
            }
          }
        }
      } else {
        lines.push("Identity Account input: none");
      }

      if (identityValueCandidates.length > 0) {
        lines.push("Derived identity candidates from Identity Value:");
        let foundAny = false;
        for (const context of linkContexts) {
          for (const identityValueCandidate of identityValueCandidates) {
            for (const platformSeed of platformCandidates) {
              const tag = PLATFORM_TAGS[platformSeed];
              if (!tag) {
                continue;
              }
              const idHash = GrapeVerificationRegistry.identityHash(
                context.salt,
                tag,
                identityValueCandidate
              );
              const [identityPda] = GrapeVerificationRegistry.deriveIdentityPda(
                grapeSpace,
                platformSeed,
                idHash
              );
              const identityInfo = await connection.getAccountInfo(identityPda);
              const exists = Boolean(identityInfo);
              if (exists) {
                foundAny = true;
              }
              lines.push(
                `  - value=${identityValueCandidate} daoId=${context.daoId.toBase58()} platform=${platformSeed}:${tag} identity=${identityPda.toBase58()} exists=${exists} idHashHex=${shortHex(idHash, 24)}`
              );
            }
          }
        }
        if (!foundAny) {
          lines.push("  (No derived identity account exists for the provided Identity Value.)");
        }
      }

      lines.push("Wallet-hash link scan:");
      let totalLinkMatches = 0;
      for (const [index, context] of linkContexts.entries()) {
        const walletHash = GrapeVerificationRegistry.walletHash(context.salt, wallet.publicKey);
        const links = await connection.getProgramAccounts(GRAPE_VERIFICATION_PROGRAM_ID, {
          filters: [{ memcmp: { offset: 41, bytes: bs58.encode(Buffer.from(walletHash)) } }]
        });
        totalLinkMatches += links.length;
        lines.push(
          `  - context#${index + 1} walletHashHex=${shortHex(walletHash, 24)} linkMatches=${links.length}`
        );
        for (const link of links.slice(0, 5)) {
          let parsed: ReturnType<typeof GrapeVerificationRegistry.parseLink> | null = null;
          try {
            parsed = GrapeVerificationRegistry.parseLink(link.account.data);
          } catch {
            lines.push(`    * ${link.pubkey.toBase58()} parseFailed=true`);
            continue;
          }
          const identityInfo = await connection.getAccountInfo(parsed.identity);
          const belongs = identityInfo
            ? identityBelongsToSpace(identityInfo.data, grapeSpace)
            : false;
          lines.push(
            `    * ${link.pubkey.toBase58()} identity=${parsed.identity.toBase58()} belongsToSpace=${belongs}`
          );
        }
      }
      if (totalLinkMatches === 0) {
        lines.push("  (No wallet-link account matched this wallet in the resolved verification space.)");
      }

      const message = "Identity debug complete.";
      setIdentityDebug({ status: "success", message, lines });
      notify(message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to debug identity.";
      setIdentityDebug({ status: "error", message, lines: [] });
      notify(message, "error");
    } finally {
      setIdentityDebugBusy(false);
    }
  };

  const ctaActions =
    memberCheck.passed === true
      ? gateContext.profile.passActions
      : memberCheck.passed === false
        ? gateContext.profile.failActions
        : [];

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }} className="dramatic-shell">
      <Paper className="panel" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2.2}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              background: `linear-gradient(120deg, ${gateContext.profile.accent}33 0%, rgba(10,16,30,0.6) 60%)`,
              border: `1px solid ${gateContext.profile.accent}66`
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
            >
              <Box>
                <Typography variant="h5">{gateContext.profile.name}</Typography>
                <Typography color="text.secondary">{gateContext.profile.subtitle}</Typography>
                {gateContext.gateTypeLabel && (
                  <Typography sx={{ mt: 0.7, fontSize: "0.85rem", color: "text.secondary" }}>
                    Gate Type: {gateContext.gateTypeLabel}
                  </Typography>
                )}
              </Box>
              <WalletMultiButton />
            </Stack>
          </Box>

          <Stepper activeStep={progressStep} alternativeLabel>
            <Step completed={isWalletConnected}>
              <StepLabel>Connect Wallet</StepLabel>
            </Step>
            <Step completed={gateContext.status === "ready"}>
              <StepLabel>Load Gate Profile</StepLabel>
            </Step>
            <Step completed={memberCheck.status === "success" || memberCheck.status === "error"}>
              <StepLabel>Run Access Check</StepLabel>
            </Step>
          </Stepper>

          {!isWalletConnected && (
            <Alert severity="info">Connect your wallet, then run your access check.</Alert>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <FormControl fullWidth>
              <InputLabel>Network</InputLabel>
              <Select
                label="Network"
                value={cluster}
                onChange={(event) => setCluster(event.target.value as ClusterKind)}
              >
                <MenuItem value="mainnet-beta">Mainnet Beta</MenuItem>
                <MenuItem value="devnet">Devnet</MenuItem>
                <MenuItem value="testnet">Testnet</MenuItem>
                <MenuItem value="custom">Custom RPC</MenuItem>
              </Select>
            </FormControl>
            {cluster === "custom" && (
              <TextField
                fullWidth
                label="Custom RPC URL"
                value={customRpc}
                onChange={(event) => setCustomRpc(event.target.value)}
                placeholder="https://..."
              />
            )}
          </Stack>

          <TextField
            fullWidth
            label="Gate ID"
            value={memberForm.gateId}
            onChange={(event) => setMemberGateId(event.target.value)}
            helperText="Gate ID identifier (not the gate PDA account address)."
          />
          {derivedGatePda && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: -0.6 }}>
              <Typography sx={{ color: "text.secondary", fontSize: "0.84rem" }}>
                Derived Gate PDA: <span className="mono">{derivedGatePda}</span>
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={() => void copyText(derivedGatePda)}
                sx={{ justifyContent: "flex-start", px: 0 }}
              >
                Copy PDA
              </Button>
            </Stack>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <Button
              variant="outlined"
              onClick={() => void handleLoadGate()}
              disabled={gateLoadBusy || !memberForm.gateId || !connection}
            >
              {gateLoadBusy ? "Loading Gate..." : "Load Gate"}
            </Button>
            {lastRpcProbeSlot !== null && (
              <Typography sx={{ alignSelf: "center", color: "text.secondary", fontSize: "0.84rem" }}>
                Last RPC Slot Probe: {lastRpcProbeSlot}
              </Typography>
            )}
          </Stack>

          <Alert severity={gateContext.status === "error" ? "error" : gateContext.status === "ready" ? "success" : "info"}>
            {gateContext.status === "loading" ? "Loading gate profile..." : gateContext.message}
          </Alert>
          {suggestedCluster && (
            <Button
              variant="outlined"
              onClick={applySuggestedNetwork}
              sx={{ alignSelf: "flex-start" }}
            >
              Switch To {suggestedCluster}
            </Button>
          )}

          <Paper variant="outlined" sx={{ p: 2, borderColor: "rgba(109, 184, 255, 0.24)" }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Eligibility Summary
            </Typography>
            <Stack spacing={0.6}>
              {eligibilitySummary.map((line) => (
                <Typography key={line} sx={{ fontSize: "0.9rem", color: "text.secondary" }}>
                  • {line}
                </Typography>
              ))}
            </Stack>
          </Paper>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <Button
              variant="outlined"
              onClick={() => void handleAutoDeriveMemberAccounts()}
              disabled={
                memberDeriveBusy ||
                linkWalletBusy ||
                identityDebugBusy ||
                !memberForm.gateId ||
                !isWalletConnected ||
                !connection
              }
            >
              {memberDeriveBusy ? "Deriving..." : "Auto-Derive Accounts"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => void handleLinkWalletSelf()}
              disabled={
                linkWalletBusy ||
                memberDeriveBusy ||
                identityDebugBusy ||
                !memberForm.gateId ||
                !isWalletConnected ||
                !connection
              }
            >
              {linkWalletBusy ? "Linking..." : "Link Wallet"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => void handleDebugIdentity()}
              disabled={
                identityDebugBusy ||
                memberDeriveBusy ||
                linkWalletBusy ||
                !memberForm.gateId ||
                !isWalletConnected ||
                !connection
              }
            >
              {identityDebugBusy ? "Debugging..." : "Debug Identity"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => void copyShareLink()}
              disabled={!memberForm.gateId}
              startIcon={<ContentCopyRoundedIcon />}
            >
              Copy Share Link
            </Button>
          </Stack>

          <Alert severity={memberDerive.status === "error" ? "error" : "info"}>
            {memberDerive.message}
          </Alert>
          {identityDebug.status !== "idle" && (
            <Paper
              variant="outlined"
              sx={{ p: 1.5, borderColor: "rgba(109, 184, 255, 0.24)", backgroundColor: "rgba(6, 14, 24, 0.5)" }}
            >
              <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
                Identity Debug
              </Typography>
              <Alert severity={identityDebug.status === "error" ? "error" : "info"} sx={{ mb: 1 }}>
                {identityDebug.message}
              </Alert>
              {identityDebug.lines.length > 0 && (
                <Typography
                  component="pre"
                  sx={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: "0.78rem",
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    m: 0
                  }}
                >
                  {identityDebug.lines.join("\n")}
                </Typography>
              )}
            </Paper>
          )}

          <TextField
            fullWidth
            label="Identity Value (optional)"
            value={memberForm.identityValue}
            onChange={(event) => updateMemberForm("identityValue", event.target.value)}
            helperText="Enter exact platform ID/handle used in verification. If it starts with @, both with and without @ are tried."
          />
          <TextField
            fullWidth
            label="Reputation Account (optional)"
            value={memberForm.reputationAccount}
            onChange={(event) => updateMemberForm("reputationAccount", event.target.value)}
          />
          <TextField
            fullWidth
            label="Identity Account (optional)"
            value={memberForm.identityAccount}
            onChange={(event) => updateMemberForm("identityAccount", event.target.value)}
            helperText="Identity PDA account (not the grapeSpace config address)."
          />
          <TextField
            fullWidth
            label="Link Account (optional)"
            value={memberForm.linkAccount}
            onChange={(event) => updateMemberForm("linkAccount", event.target.value)}
          />
          <TextField
            fullWidth
            label="Token Account (optional)"
            value={memberForm.tokenAccount}
            onChange={(event) => updateMemberForm("tokenAccount", event.target.value)}
          />

          <FormControlLabel
            control={
              <Switch
                checked={memberForm.storeRecord}
                onChange={(event) => updateMemberForm("storeRecord", event.target.checked)}
              />
            }
            label="Store my check record on-chain"
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <Button variant="outlined" onClick={() => void copyText(JSON.stringify(memberPreview, null, 2))}>
              Copy Check Payload
            </Button>
            <Button
              variant="contained"
              onClick={handleMemberCheck}
              disabled={memberBusy || !isWalletConnected || !connection}
              startIcon={memberBusy ? <CircularProgress size={16} color="inherit" /> : <ShieldRoundedIcon />}
            >
              {memberBusy ? "Checking..." : "Check My Access"}
            </Button>
          </Stack>

          <Divider />

          <Alert
            icon={
              memberCheck.passed === true ? (
                <CheckCircleRoundedIcon fontSize="inherit" />
              ) : memberCheck.passed === false || memberCheck.status === "error" ? (
                <ErrorOutlineRoundedIcon fontSize="inherit" />
              ) : undefined
            }
            severity={
              memberCheck.status === "error"
                ? "error"
                : memberCheck.passed === true
                  ? "success"
                  : memberCheck.passed === false
                    ? "warning"
                    : "info"
            }
          >
            {memberCheck.message}
          </Alert>

          {(memberCheck.passed === true || memberCheck.passed === false || memberCheck.status === "error") && (
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderColor:
                  memberCheck.passed === true
                    ? "rgba(61, 215, 164, 0.4)"
                    : memberCheck.passed === false
                      ? "rgba(255, 183, 77, 0.45)"
                      : "rgba(244, 67, 54, 0.4)",
                backgroundColor:
                  memberCheck.passed === true
                    ? "rgba(34, 177, 131, 0.12)"
                    : memberCheck.passed === false
                      ? "rgba(255, 167, 38, 0.12)"
                      : "rgba(244, 67, 54, 0.12)"
              }}
            >
              <Stack spacing={1.2}>
                <Typography variant="subtitle1">
                  {memberCheck.passed === true
                    ? "You are in."
                    : memberCheck.passed === false
                      ? "You are close."
                      : "Action needed."}
                </Typography>
                <Typography color="text.secondary">{gateContext.profile.supportLabel}</Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  {ctaActions.map((action) => (
                    <Button
                      key={action.href + action.label}
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      variant="outlined"
                    >
                      {action.label}
                    </Button>
                  ))}
                  {memberCheck.signature && (
                    <Button
                      href={explorerLink(memberCheck.signature, rpcEndpoint)}
                      target="_blank"
                      rel="noreferrer"
                      variant="text"
                    >
                      View Transaction
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Paper>
          )}

          {memberCheck.signature && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button href={explorerLink(memberCheck.signature, rpcEndpoint)} target="_blank" rel="noreferrer">
                View Transaction
              </Button>
              <Button onClick={() => void copyText(memberCheck.signature ?? "")}>Copy Signature</Button>
            </Stack>
          )}

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              maxHeight: 300,
              overflow: "auto",
              backgroundColor: "rgba(10, 16, 30, 0.92)",
              borderColor: "rgba(109, 184, 255, 0.24)"
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Check Payload
            </Typography>
            <Typography component="pre" className="mono" sx={{ m: 0, fontSize: "0.78rem" }}>
              {JSON.stringify(memberPreview, null, 2)}
            </Typography>
            {Boolean(memberCheck.response) && (
              <>
                <Divider sx={{ my: 1.2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Response
                </Typography>
                <Typography component="pre" className="mono" sx={{ m: 0, fontSize: "0.74rem" }}>
                  {JSON.stringify(memberCheck.response, null, 2)}
                </Typography>
              </>
            )}
          </Paper>

          <Box>
            <Button href="/" variant="text" size="small">
              Back to Console
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3200}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
}
