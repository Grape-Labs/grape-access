"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
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
import { AnchorProvider, BorshAccountsCoder } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { BaseWalletMultiButton } from "@solana/wallet-adapter-react-ui";
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
  verificationMode?: "transaction" | "rpc";
  checkedAtLabel?: string;
  verificationSlot?: number;
  gateExplorerUrl?: string;
  userExplorerUrl?: string;
  proofItems?: VerificationProofItem[];
  response?: unknown;
}

interface VerificationProofItem {
  label: string;
  address: string;
  url: string;
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
type AccessViewMode = "simple" | "advanced";

interface CommunityAction {
  label: string;
  href: string;
}

interface CommunityProfile {
  name: string;
  subtitle: string;
  accent: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  supportLabel: string;
  supportUrl: string;
  passActions: CommunityAction[];
  failActions: CommunityAction[];
}

interface GateContextState {
  status: "idle" | "loading" | "ready" | "error";
  message: string;
  gateId?: string;
  metadataUri?: string;
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

interface ParsedVerificationIdentity {
  version: number;
  space: PublicKey;
  platform: number;
  idHash: Uint8Array;
  verified: boolean;
  verifiedAt: number;
  expiresAt: number;
  attestedBy: PublicKey;
  bump: number;
}

const DEFAULT_COMMUNITY_PROFILE: CommunityProfile = {
  name: "Grape Community Access",
  subtitle: "Community-verified access powered by on-chain gate checks.",
  accent: "#6db8ff",
  description:
    "Connect your wallet and run an on-chain check to verify your eligibility for this community.",
  logoUrl: "",
  bannerUrl: "",
  supportLabel: "Need help? Contact your community moderators.",
  supportUrl: "",
  passActions: [],
  failActions: []
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
  findAccessPda,
  findGatePda,
  findGrapeIdentityPda,
  findGrapeLinkPda
} = GPassSdk;
const findPrimaryAccessPda = (findAccessPda ?? findGatePda) as typeof findGatePda;

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const SHYFT_MAINNET_RPC =
  process.env.NEXT_PUBLIC_SHYFT_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";
const DEFAULT_CLUSTER: ClusterKind = "mainnet-beta";
const ACCESS_WALLET_BUTTON_LABELS = {
  "change-wallet": "Change wallet",
  connecting: "Connecting ...",
  "copy-address": "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Connect"
} as const;
const ACCESS_SUCCESS_SPARKS = [
  { x: 8, tx: -34, ty: -112, delay: 10, color: "#7df6d1" },
  { x: 16, tx: -12, ty: -126, delay: 55, color: "#6db8ff" },
  { x: 24, tx: 16, ty: -104, delay: 90, color: "#9be7ff" },
  { x: 33, tx: -24, ty: -132, delay: 120, color: "#7df6d1" },
  { x: 42, tx: 20, ty: -116, delay: 150, color: "#6db8ff" },
  { x: 50, tx: -6, ty: -138, delay: 185, color: "#c5f9ea" },
  { x: 58, tx: 24, ty: -122, delay: 220, color: "#7fd0ff" },
  { x: 67, tx: -26, ty: -128, delay: 250, color: "#7df6d1" },
  { x: 75, tx: 12, ty: -110, delay: 285, color: "#6db8ff" },
  { x: 84, tx: -18, ty: -118, delay: 320, color: "#9be7ff" },
  { x: 92, tx: 32, ty: -106, delay: 355, color: "#7df6d1" }
] as const;

const defaultMemberForm: MemberFormState = {
  gateId: "",
  identityValue: "",
  reputationAccount: "",
  identityAccount: "",
  linkAccount: "",
  tokenAccount: "",
  storeRecord: true
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

function readU16Le(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.length) {
    throw new Error("u16 out of bounds");
  }
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU64Le(bytes: Uint8Array, offset: number): bigint {
  if (offset + 8 > bytes.length) {
    throw new Error("u64 out of bounds");
  }
  let value = BigInt(0);
  for (let index = 7; index >= 0; index -= 1) {
    value = (value << BigInt(8)) + BigInt(bytes[offset + index]);
  }
  return value;
}

function readI64Le(bytes: Uint8Array, offset: number): number {
  if (offset + 8 > bytes.length) {
    throw new Error("i64 out of bounds");
  }
  return Number(Buffer.from(bytes.subarray(offset, offset + 8)).readBigInt64LE(0));
}

async function decodeVineReputationFlexible(data: Uint8Array | Buffer) {
  try {
    const decoded = await VineReputationClient.decodeReputation(data);
    return {
      user: decoded.user,
      season: decoded.season,
      points: decoded.points,
      lastUpdateSlot: decoded.lastUpdateSlot,
      layout: "legacy" as const
    };
  } catch {
    const bytes = Uint8Array.from(data);
    // Newer layout observed in vine-reputation-client internals:
    // [8..9]=version, [9..41]=config, [41..73]=user, [73..75]=season, [75..83]=points, [83..91]=lastUpdate
    if (bytes.length >= 91) {
      let offset = 8;
      offset += 1; // version
      offset += 32; // config
      const user = new PublicKey(bytes.subarray(offset, offset + 32));
      offset += 32;
      const season = readU16Le(bytes, offset);
      offset += 2;
      const points = readU64Le(bytes, offset);
      offset += 8;
      const lastUpdateSlot = readU64Le(bytes, offset);
      return {
        user,
        season,
        points,
        lastUpdateSlot,
        layout: "extended" as const
      };
    }
    throw new Error("Unsupported reputation account layout.");
  }
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
  if (spaceData.length >= 72) {
    salts.push(Uint8Array.from(spaceData.subarray(40, 72)));
  }
  if (spaceData.length >= 105) {
    salts.push(Uint8Array.from(spaceData.subarray(73, 105)));
  }
  if (spaceData.length >= 73) {
    salts.push(Uint8Array.from(spaceData.subarray(41, 73)));
  }
  if (spaceData.length >= 137) {
    salts.push(Uint8Array.from(spaceData.subarray(105, 137)));
  }
  if (spaceData.length >= 138) {
    salts.push(Uint8Array.from(spaceData.subarray(106, 138)));
  }
  if (spaceData.length >= 139) {
    salts.push(Uint8Array.from(spaceData.subarray(107, 139)));
  }
  return uniqueByteArrays(salts);
}

function getAccessLikeAccountNamesFromIdl(): string[] {
  const sdkAny = GPassSdk as Record<string, unknown>;
  const idl = sdkAny.IDL as { accounts?: Array<{ name?: string }> } | undefined;
  if (!idl?.accounts) {
    return [];
  }
  return idl.accounts
    .map((account) => account.name)
    .filter((name): name is string => Boolean(name && /(access|gate)/i.test(name)));
}

function decodeAccessLikeAccountData(data: Buffer | Uint8Array): Record<string, unknown> | null {
  const sdkAny = GPassSdk as Record<string, unknown>;
  const idl = sdkAny.IDL;
  if (!idl) {
    return null;
  }
  try {
    const coder = new BorshAccountsCoder(idl as any);
    const bytes = Buffer.from(data);
    const accountNames = getAccessLikeAccountNamesFromIdl();
    for (const accountName of accountNames) {
      const discriminator = BorshAccountsCoder.accountDiscriminator(accountName);
      if (bytes.subarray(0, 8).equals(discriminator)) {
        return coder.decodeUnchecked(accountName, bytes) as Record<string, unknown>;
      }
    }
  } catch {
    // Ignore decode failures and let caller continue with other fallbacks.
  }
  return null;
}

function identityBelongsToSpace(identityData: Uint8Array, grapeSpace: PublicKey) {
  const spaceBytes = grapeSpace.toBytes();
  if (identityData.length >= 40) {
    if (byteArraysEqual(identityData.subarray(8, 40), spaceBytes)) {
      return true;
    }
  }
  if (identityData.length >= 41) {
    if (byteArraysEqual(identityData.subarray(9, 41), spaceBytes)) {
      return true;
    }
  }
  if (identityData.length >= 72) {
    if (byteArraysEqual(identityData.subarray(40, 72), spaceBytes)) {
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

function parseVerificationIdentityData(
  identityData: Uint8Array | Buffer
): ParsedVerificationIdentity | null {
  const bytes = Uint8Array.from(identityData);
  for (const offset of [8, 0]) {
    if (bytes.length < offset + 120) {
      continue;
    }
    try {
      const version = bytes[offset];
      const space = new PublicKey(bytes.subarray(offset + 1, offset + 33));
      const platform = bytes[offset + 33];
      const idHash = Uint8Array.from(bytes.subarray(offset + 34, offset + 66));
      const verifiedRaw = bytes[offset + 66];
      if (verifiedRaw !== 0 && verifiedRaw !== 1) {
        continue;
      }
      const verified = verifiedRaw === 1;
      const verifiedAt = readI64Le(bytes, offset + 67);
      const expiresAt = readI64Le(bytes, offset + 75);
      const attestedBy = new PublicKey(bytes.subarray(offset + 83, offset + 115));
      const bump = bytes[offset + 115];
      return {
        version,
        space,
        platform,
        idHash,
        verified,
        verifiedAt,
        expiresAt,
        attestedBy,
        bump
      };
    } catch {
      // Ignore and try fallback offset.
    }
  }
  return null;
}

function getIdentityGateEligibilityIssue(args: {
  identityData: Uint8Array | Buffer;
  grapeSpace: PublicKey;
  allowedPlatforms: number[];
  nowUnix: number;
}): string | null {
  const { identityData, grapeSpace, allowedPlatforms, nowUnix } = args;
  const parsed = parseVerificationIdentityData(identityData);
  if (!parsed) {
    return "Identity account data could not be parsed.";
  }
  if (!parsed.space.equals(grapeSpace)) {
    return "Identity account does not belong to this gate's verification space.";
  }
  if (!parsed.verified) {
    return "Identity account is not currently verified.";
  }
  if (parsed.expiresAt > 0 && nowUnix > parsed.expiresAt) {
    return "Identity verification is expired.";
  }
  if (allowedPlatforms.length > 0 && !allowedPlatforms.includes(parsed.platform)) {
    return `Identity platform ${parsed.platform} is not allowed by this gate.`;
  }
  return null;
}

function discoverVerificationDaoOffsets(spaceData: Uint8Array, resolvedSpace: PublicKey) {
  const discoveredDaoOffsets: Array<{ offset: number; daoId: PublicKey }> = [];
  for (let offset = 0; offset + 32 <= spaceData.length; offset += 1) {
    try {
      const daoId = new PublicKey(spaceData.subarray(offset, offset + 32));
      const [derivedSpace] = GrapeVerificationRegistry.deriveSpacePda(daoId);
      if (!derivedSpace.equals(resolvedSpace)) {
        continue;
      }
      if (discoveredDaoOffsets.some((entry) => entry.daoId.equals(daoId))) {
        continue;
      }
      discoveredDaoOffsets.push({ offset, daoId });
    } catch {
      // Ignore invalid windows.
    }
  }
  return discoveredDaoOffsets;
}

function extractVerificationSaltCandidatesForResolvedSpace(
  spaceData: Uint8Array,
  resolvedSpace: PublicKey
) {
  const salts = extractVerificationSaltCandidates(spaceData);
  const discoveredDaoOffsets = discoverVerificationDaoOffsets(spaceData, resolvedSpace);
  const pushIfPresent = (start: number) => {
    if (start < 0 || start + 32 > spaceData.length) {
      return;
    }
    salts.push(Uint8Array.from(spaceData.subarray(start, start + 32)));
  };

  for (const entry of discoveredDaoOffsets) {
    // Known layouts observed in the wild:
    // - identity/hash salt at dao_offset + 32
    // - secondary salt variants at dao_offset + 64 and dao_offset + 98
    pushIfPresent(entry.offset + 32);
    pushIfPresent(entry.offset + 64);
    pushIfPresent(entry.offset + 98);
  }

  return uniqueByteArrays(salts);
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

  const pushContextByOffsets = (daoStart: number, saltStart: number) => {
    if (spaceData.length < saltStart + 32) {
      return;
    }
    try {
      pushContext(
        new PublicKey(spaceData.subarray(daoStart, daoStart + 32)),
        Uint8Array.from(spaceData.subarray(saltStart, saltStart + 32))
      );
    } catch {
      // Ignore invalid bytes that are not a valid public key.
    }
  };

  const discoveredDaoOffsets = discoverVerificationDaoOffsets(spaceData, resolvedSpace);

  for (const entry of discoveredDaoOffsets) {
    pushContextByOffsets(entry.offset, entry.offset + 32);
    pushContextByOffsets(entry.offset, entry.offset + 64);
  }

  const saltCandidates = extractVerificationSaltCandidates(spaceData);
  const [derivedFromInput] = GrapeVerificationRegistry.deriveSpacePda(grapeSpaceInput);
  if (contexts.length === 0 && derivedFromInput.equals(resolvedSpace)) {
    for (const salt of saltCandidates) {
      pushContext(grapeSpaceInput, salt);
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
  for (const offset of [40, 41, 72, 73]) {
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

  if (candidates.length === 0) {
    for (let offset = 0; offset + 33 <= identityData.length; offset += 1) {
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
  const lowercase = value.toLowerCase();
  if (!candidates.includes(lowercase)) {
    candidates.push(lowercase);
  }
  if (value.startsWith("@") && value.length > 1) {
    const withoutAt = value.slice(1);
    if (!candidates.includes(withoutAt)) {
      candidates.push(withoutAt);
    }
    const withoutAtLowercase = withoutAt.toLowerCase();
    if (!candidates.includes(withoutAtLowercase)) {
      candidates.push(withoutAtLowercase);
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

async function simulateInstructionWithFeePayer(args: {
  connection: Connection;
  feePayer: PublicKey;
  instruction: TransactionInstruction;
}) {
  const { connection, feePayer, instruction } = args;
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = feePayer;
  const latestBlockhash = await connection.getLatestBlockhash("processed");
  transaction.recentBlockhash = latestBlockhash.blockhash;
  return connection.simulateTransaction(transaction);
}

async function resolveSdkClient(
  connection: Connection,
  wallet: WalletProvider | undefined,
  options?: { readOnly?: boolean }
) {
  const readOnly = options?.readOnly ?? false;
  const sdkAny = GPassSdk as Record<string, unknown>;
  const AccessClientCtor =
    (sdkAny.GrapeAccessClient as (new (...args: unknown[]) => unknown) | undefined) ??
    (sdkAny.GpassClient as (new (...args: unknown[]) => unknown) | undefined);

  if (typeof AccessClientCtor !== "function") {
    throw new Error(
      "Installed SDK does not export GrapeAccessClient/GpassClient. Please update @grapenpm/grape-access-sdk."
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

  return new AccessClientCtor(provider, GPASS_PROGRAM_ID);
}

function getSdkClientMethod<T extends (...args: any[]) => any>(
  client: Record<string, unknown>,
  names: string[]
): T | undefined {
  for (const name of names) {
    const candidate = client[name];
    if (typeof candidate === "function") {
      return candidate as T;
    }
  }
  return undefined;
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

function hasCustomProgramErrorCode(value: unknown, code: number): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "number") {
    return value === code;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasCustomProgramErrorCode(entry, code));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.Custom === "number" && record.Custom === code) {
      return true;
    }
    return Object.values(record).some((entry) => hasCustomProgramErrorCode(entry, code));
  }
  return false;
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

function explorerAddressLink(address: string, endpoint: string) {
  const base = `https://explorer.solana.com/address/${address}`;
  const cluster = inferClusterFromEndpoint(endpoint);
  if (cluster === "mainnet-beta") {
    return base;
  }
  return `${base}?cluster=${cluster}`;
}

function shortenAddress(address: string, start = 4, end = 4) {
  if (!address || address.length <= start + end + 3) {
    return address;
  }
  return `${address.slice(0, start)}...${address.slice(-end)}`;
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

function summarizeEndpointForDisplay(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return "(not configured)";
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return `${parsed.protocol}//${host}`;
  } catch {
    const urlMatch = trimmed.match(/https?:\/\/[^\s/]+/i);
    return urlMatch?.[0] || trimmed;
  }
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

async function validateCheckGateInputs(args: {
  connection: Connection;
  criteriaVariant: { type: string; config: Record<string, unknown> };
  user: PublicKey;
  reputationAccount?: PublicKey;
  identityAccount?: PublicKey;
  linkAccount?: PublicKey;
  tokenAccount?: PublicKey;
}) {
  const {
    connection,
    criteriaVariant,
    user,
    reputationAccount,
    identityAccount,
    linkAccount,
    tokenAccount
  } = args;
  const issues: string[] = [];
  const { type, config } = criteriaVariant;

  const requiresReputation =
    type === "minReputation" || type === "timeLockedReputation" || type === "combined";
  if (requiresReputation) {
    if (!reputationAccount) {
      issues.push("Reputation account is required for this gate.");
    } else {
      const repInfo = await connection.getAccountInfo(reputationAccount);
      if (!repInfo) {
        issues.push("Reputation account was not found on the selected network.");
      } else if (!repInfo.owner.equals(VINE_REPUTATION_PROGRAM_ID)) {
        issues.push(
          `Reputation account has owner ${repInfo.owner.toBase58()} but expected ${VINE_REPUTATION_PROGRAM_ID.toBase58()}.`
        );
      } else {
        try {
          const decoded = await decodeVineReputationFlexible(repInfo.data);
          const expectedSeason = asNumberValue(config.season);
          const vineConfig = asPublicKeyValue(config.vineConfig);
          if (!decoded.user.equals(user)) {
            issues.push(`Reputation account user ${decoded.user.toBase58()} does not match connected wallet.`);
          }
          if (expectedSeason !== undefined && decoded.season !== expectedSeason) {
            issues.push(
              `Reputation account season ${decoded.season} does not match gate season ${expectedSeason}.`
            );
          }
          if (vineConfig && expectedSeason !== undefined) {
            const [expectedReputationPda] = VineReputationClient.getReputationPda(
              vineConfig,
              user,
              expectedSeason,
              VINE_REPUTATION_PROGRAM_ID
            );
            if (!expectedReputationPda.equals(reputationAccount)) {
              issues.push(
                `Reputation account does not match expected PDA ${expectedReputationPda.toBase58()} for this gate.`
              );
            }
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : "decode failed";
          issues.push(`Reputation account is not a valid Vine Reputation account (${detail}).`);
        }
      }
    }
  }

  const requiresIdentity = type === "verifiedIdentity" || type === "verifiedWithWallet" || type === "combined";
  const requiresLink =
    type === "verifiedWithWallet" || (type === "combined" && Boolean(config.requireWalletLink));

  const grapeSpaceInput = asPublicKeyValue(config.grapeSpace);
  const allowedPlatforms = normalizePlatforms(config.platforms);
  const resolvedVerificationSpace =
    requiresIdentity && grapeSpaceInput
      ? await resolveVerificationSpaceContext(connection, grapeSpaceInput)
      : null;
  const grapeSpace = resolvedVerificationSpace?.space ?? grapeSpaceInput;

  if (requiresIdentity) {
    if (!identityAccount) {
      issues.push("Identity account is required for this gate.");
    } else {
      const identityInfo = await connection.getAccountInfo(identityAccount);
      if (!identityInfo) {
        issues.push("Identity account was not found on the selected network.");
      } else if (!identityInfo.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
        issues.push(
          `Identity account has owner ${identityInfo.owner.toBase58()} but expected ${GRAPE_VERIFICATION_PROGRAM_ID.toBase58()}.`
        );
      } else if (grapeSpace) {
        const identityIssue = getIdentityGateEligibilityIssue({
          identityData: identityInfo.data,
          grapeSpace,
          allowedPlatforms,
          nowUnix: Math.floor(Date.now() / 1000)
        });
        if (identityIssue) {
          issues.push(identityIssue);
        }
      }
    }
  }

  if (linkAccount) {
    const linkInfo = await connection.getAccountInfo(linkAccount);
    if (!linkInfo) {
      issues.push("Link account was not found on the selected network.");
    } else if (!linkInfo.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
      issues.push(
        `Link account has owner ${linkInfo.owner.toBase58()} but expected ${GRAPE_VERIFICATION_PROGRAM_ID.toBase58()}.`
      );
    } else {
      let parsedLink: ReturnType<typeof GrapeVerificationRegistry.parseLink> | null = null;
      try {
        parsedLink = GrapeVerificationRegistry.parseLink(linkInfo.data);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "parse failed";
        issues.push(`Link account is not a valid verification link account (${detail}).`);
      }
      if (parsedLink) {
        if (identityAccount && !parsedLink.identity.equals(identityAccount)) {
          issues.push("Link account points to a different identity account.");
        }
        const walletSaltCandidates = resolvedVerificationSpace?.saltCandidates ?? [];
        if (walletSaltCandidates.length > 0) {
          const walletHashes = walletSaltCandidates.map((salt) =>
            GrapeVerificationRegistry.walletHash(salt, user)
          );
          if (!walletHashes.some((hash) => byteArraysEqual(hash, parsedLink.walletHash))) {
            const actualLinkHash = Buffer.from(parsedLink.walletHash).toString("hex").slice(0, 24);
            issues.push(
              `Link account wallet hash (${actualLinkHash}) does not match this wallet for the gate's salts.`
            );
          }
        }
      }
    }
  } else if (requiresLink) {
    issues.push("Link account is required for this gate.");
  }

  if (type === "tokenHolding" && !tokenAccount) {
    issues.push("Token account is required for token-holding gates.");
  }

  return issues;
}

interface CheckGateInputParams {
  accessId?: PublicKey;
  gateId: PublicKey;
  user: PublicKey;
  reputationAccount?: PublicKey;
  identityAccount?: PublicKey;
  linkAccount?: PublicKey;
  tokenAccount?: PublicKey;
  storeRecord: boolean;
}

async function runCheckGateBorshDiagnostics(args: {
  connection: Connection;
  client: Record<string, unknown>;
  params: CheckGateInputParams;
}) {
  const { connection, client, params } = args;
  const diagnostics: string[] = [];

  const buildInstruction = getSdkClientMethod<
    ((input: CheckGateInputParams) => Promise<TransactionInstruction>)
  >(client, ["buildCheckAccessInstruction", "buildCheckGateInstruction"]);
  if (!buildInstruction) {
    return diagnostics;
  }

  const variants: Array<{
    label: string;
    mutate: Partial<CheckGateInputParams>;
  }> = [
    { label: "full", mutate: {} },
    { label: "without reputation", mutate: { reputationAccount: undefined } },
    { label: "without identity", mutate: { identityAccount: undefined } },
    { label: "without link", mutate: { linkAccount: undefined } }
  ];

  const variantResults: Array<{ label: string; borsh: boolean; summary: string }> = [];
  for (const variant of variants) {
    try {
      const input = { ...params, ...variant.mutate };
      const instruction = await buildInstruction.call(client, input);
      const simulation = await simulateInstructionWithFeePayer({
        connection,
        feePayer: params.user,
        instruction
      });
      const logs = simulation.value.logs ?? [];
      const borsh = logs.some((line) => line.includes("BorshIoError"));
      const summary = simulation.value.err
        ? `err=${JSON.stringify(simulation.value.err)}`
        : "ok";
      variantResults.push({ label: variant.label, borsh, summary });
    } catch (error) {
      const summary = error instanceof Error ? error.message : "simulation failed";
      variantResults.push({ label: variant.label, borsh: false, summary });
    }
  }

  const full = variantResults.find((entry) => entry.label === "full");
  if (full?.borsh) {
    const withoutReputation = variantResults.find((entry) => entry.label === "without reputation");
    const withoutIdentity = variantResults.find((entry) => entry.label === "without identity");
    const withoutLink = variantResults.find((entry) => entry.label === "without link");

    if (withoutReputation && !withoutReputation.borsh) {
      diagnostics.push("Borsh failure disappears when reputation account is removed.");
    }
    if (withoutIdentity && !withoutIdentity.borsh) {
      diagnostics.push("Borsh failure disappears when identity account is removed.");
    }
    if (withoutLink && !withoutLink.borsh) {
      diagnostics.push("Borsh failure disappears when link account is removed.");
    }
  }

  const accountChecks: Array<{
    label: string;
    account?: PublicKey;
    expectedOwner: PublicKey;
  }> = [
    { label: "Reputation", account: params.reputationAccount, expectedOwner: VINE_REPUTATION_PROGRAM_ID },
    { label: "Identity", account: params.identityAccount, expectedOwner: GRAPE_VERIFICATION_PROGRAM_ID },
    { label: "Link", account: params.linkAccount, expectedOwner: GRAPE_VERIFICATION_PROGRAM_ID }
  ];

  for (const check of accountChecks) {
    if (!check.account) {
      continue;
    }
    const info = await connection.getAccountInfo(check.account);
    if (!info) {
      diagnostics.push(`${check.label} account is missing on selected network.`);
      continue;
    }
    diagnostics.push(
      `${check.label} account owner=${info.owner.toBase58()} dataLen=${info.data.length}`
    );
    if (!info.owner.equals(check.expectedOwner)) {
      diagnostics.push(
        `${check.label} owner mismatch (expected ${check.expectedOwner.toBase58()}).`
      );
    }
  }

  const reputationInfo =
    params.reputationAccount ? await connection.getAccountInfo(params.reputationAccount) : null;
  if (reputationInfo && reputationInfo.owner.equals(VINE_REPUTATION_PROGRAM_ID)) {
    try {
      const decoded = await decodeVineReputationFlexible(reputationInfo.data);
      diagnostics.push(
        `Reputation decode ok (layout=${decoded.layout}, season=${decoded.season}, user=${decoded.user.toBase58()})`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "decode failed";
      diagnostics.push(`Reputation decode failed: ${detail}`);
    }
  }

  if (variantResults.length > 0) {
    diagnostics.push(
      `Variant simulation: ${variantResults.map((entry) => `${entry.label}(${entry.borsh ? "borsh" : entry.summary})`).join(", ")}`
    );
  }

  return diagnostics;
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
  gateId: PublicKey,
  connection?: Connection
): Promise<{ gate: Record<string, unknown> | null; gatePda: PublicKey; sdkError?: Error }> {
  const [gatePda] = await findPrimaryAccessPda(gateId, GPASS_PROGRAM_ID);
  let gate: unknown = null;
  let sdkError: Error | undefined;

  const fetchGateMethod = getSdkClientMethod<((input: PublicKey) => Promise<unknown>)>(client, [
    "fetchAccess",
    "fetchGate"
  ]);
  if (typeof fetchGateMethod === "function") {
    try {
      gate = await fetchGateMethod.call(client, gateId);
    } catch (error) {
      sdkError = error instanceof Error ? error : new Error("Unknown SDK fetchGate error.");
    }
  }

  if (!gate) {
    if (connection) {
      try {
        const rawMatches = await connection.getProgramAccounts(GPASS_PROGRAM_ID, {
          filters: [{ memcmp: { offset: 9, bytes: gateId.toBase58() } }]
        });
        const decoded = rawMatches
          .map((entry) => decodeAccessLikeAccountData(entry.account.data))
          .find((entry) => Boolean(entry));
        if (decoded) {
          gate = decoded;
        }
      } catch {
        // Ignore raw fallback failures.
      }
    }
  }

  if (!gate) {
    const clientAny = client as Record<string, unknown>;
    const program = clientAny.program as Record<string, unknown> | undefined;
    const accountNamespace = program?.account as Record<string, unknown> | undefined;
    const gateAccountClient =
      (accountNamespace?.Access as Record<string, unknown> | undefined) ??
      (accountNamespace?.access as Record<string, unknown> | undefined) ??
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
      const saltCandidates = extractVerificationSaltCandidatesForResolvedSpace(space.data, candidate);
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
  walletHashes,
  allowedPlatforms,
  nowUnix
}: {
  connection: Connection;
  grapeSpace: PublicKey;
  walletHashes: Uint8Array[];
  allowedPlatforms: number[];
  nowUnix: number;
}): Promise<{ identity: PublicKey; link: PublicKey } | null> {
  try {
    const candidates: Array<{
      identity: PublicKey;
      link: PublicKey;
      platform: number;
      linkedAt: number;
    }> = [];
    const seenCandidates = new Set<string>();
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
        const identityIssue = getIdentityGateEligibilityIssue({
          identityData: identityInfo.data,
          grapeSpace,
          allowedPlatforms,
          nowUnix
        });
        if (identityIssue) {
          continue;
        }
        const identityParsed = parseVerificationIdentityData(identityInfo.data);
        if (!identityParsed) {
          continue;
        }
        const key = `${parsed.identity.toBase58()}:${entry.pubkey.toBase58()}`;
        if (seenCandidates.has(key)) {
          continue;
        }
        seenCandidates.add(key);
        candidates.push({
          identity: parsed.identity,
          link: entry.pubkey,
          platform: identityParsed.platform,
          linkedAt: parsed.linkedAt
        });
      }
    }
    if (candidates.length > 0) {
      const platformOrder = new Map<number, number>();
      for (const [index, platform] of allowedPlatforms.entries()) {
        if (!platformOrder.has(platform)) {
          platformOrder.set(platform, index);
        }
      }
      candidates.sort((left, right) => {
        const leftOrder = platformOrder.get(left.platform) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = platformOrder.get(right.platform) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return right.linkedAt - left.linkedAt;
      });
      const best = candidates[0];
      return { identity: best.identity, link: best.link };
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
    const { gate } = await fetchGateWithCompatibility(client, gateId, connection);
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

function resolveMetadataHttpUri(uri: string) {
  const trimmed = uri.trim();
  if (trimmed.startsWith("irys://")) {
    return `https://uploader.irys.xyz/${trimmed.slice("irys://".length)}`;
  }
  if (trimmed.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${trimmed.slice("ipfs://".length)}`;
  }
  if (trimmed.startsWith("ar://")) {
    return `https://arweave.net/${trimmed.slice("ar://".length)}`;
  }
  return trimmed;
}

function resolveCommunityProfile(
  gateId: string,
  metadataProfileOverrides?: Partial<CommunityProfile>
): CommunityProfile {
  const base = gateId ? COMMUNITY_PROFILES_BY_GATE[gateId] ?? DEFAULT_COMMUNITY_PROFILE : DEFAULT_COMMUNITY_PROFILE;
  const merged = { ...base } as CommunityProfile;
  if (metadataProfileOverrides) {
    for (const key of Object.keys(metadataProfileOverrides) as Array<keyof CommunityProfile>) {
      const value = metadataProfileOverrides[key];
      if (value !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = value as unknown;
      }
    }
  }
  return {
    ...merged,
    passActions:
      metadataProfileOverrides?.passActions && metadataProfileOverrides.passActions.length > 0
        ? metadataProfileOverrides.passActions
        : base.passActions,
    failActions:
      metadataProfileOverrides?.failActions && metadataProfileOverrides.failActions.length > 0
        ? metadataProfileOverrides.failActions
        : base.failActions
  };
}

function parseCommunityProfileFromMetadata(raw: unknown): Partial<CommunityProfile> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const metadata = raw as Record<string, unknown>;
  const branding =
    metadata.branding && typeof metadata.branding === "object"
      ? (metadata.branding as Record<string, unknown>)
      : {};
  const support =
    metadata.support && typeof metadata.support === "object"
      ? (metadata.support as Record<string, unknown>)
      : {};
  const integrations =
    metadata.integrations && typeof metadata.integrations === "object"
      ? (metadata.integrations as Record<string, unknown>)
      : {};
  const links =
    metadata.links && typeof metadata.links === "object"
      ? (metadata.links as Record<string, unknown>)
      : {};

  const parseActions = (input: unknown): CommunityAction[] => {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const action = entry as Record<string, unknown>;
        const label = typeof action.label === "string" ? action.label.trim() : "";
        const href = typeof action.href === "string" ? action.href.trim() : "";
        if (!label || !href) {
          return null;
        }
        return { label, href };
      })
      .filter((entry): entry is CommunityAction => Boolean(entry));
  };
  const parseManifestUri = (input: unknown): string => {
    if (typeof input !== "string") {
      return "";
    }
    return resolveMetadataHttpUri(input).trim();
  };

  const passActions = parseActions(metadata.passActions);
  const failActions = parseActions(metadata.failActions);
  const discord = integrations.discord && typeof integrations.discord === "object"
    ? (integrations.discord as Record<string, unknown>)
    : {};
  const telegram = integrations.telegram && typeof integrations.telegram === "object"
    ? (integrations.telegram as Record<string, unknown>)
    : {};

  const supportUrl =
    typeof support.url === "string"
      ? support.url.trim()
      : typeof branding.supportUrl === "string"
        ? branding.supportUrl.trim()
        : "";
  const verifyUrl = typeof links.verifyUrl === "string" ? links.verifyUrl.trim() : "";
  const supportLabel =
    typeof support.label === "string"
      ? support.label.trim()
      : typeof branding.supportLabel === "string"
        ? branding.supportLabel.trim()
        : "";

  const integrationActions: CommunityAction[] = [];
  const discordInvite = typeof discord.inviteUrl === "string" ? discord.inviteUrl.trim() : "";
  if (discordInvite) {
    integrationActions.push({ label: "Join Discord", href: discordInvite });
  }
  const telegramInvite = typeof telegram.inviteUrl === "string" ? telegram.inviteUrl.trim() : "";
  if (telegramInvite) {
    integrationActions.push({ label: "Join Telegram", href: telegramInvite });
  }

  return {
    name:
      typeof branding.name === "string" && branding.name.trim()
        ? branding.name.trim()
        : undefined,
    subtitle:
      typeof branding.subtitle === "string" && branding.subtitle.trim()
        ? branding.subtitle.trim()
        : undefined,
    accent:
      typeof branding.themeColor === "string" && branding.themeColor.trim()
        ? branding.themeColor.trim()
        : typeof branding.accent === "string" && branding.accent.trim()
          ? branding.accent.trim()
          : undefined,
    description:
      typeof branding.description === "string" && branding.description.trim()
        ? branding.description.trim()
        : undefined,
    logoUrl: parseManifestUri(branding.logo) || undefined,
    bannerUrl: parseManifestUri(branding.banner) || undefined,
    supportLabel: supportLabel || undefined,
    supportUrl: resolveMetadataHttpUri(supportUrl) || undefined,
    passActions:
      passActions.length > 0
        ? passActions
        : supportUrl
          ? [{ label: "Community Support", href: supportUrl }]
          : integrationActions,
    failActions:
      failActions.length > 0
        ? failActions
        : verifyUrl
          ? [{ label: "Verify Access", href: verifyUrl }]
          : supportUrl
            ? [{ label: "How To Qualify", href: supportUrl }]
          : integrationActions
  };
}

async function fetchGateMetadataDocument(metadataUri: string) {
  const resolvedUri = resolveMetadataHttpUri(metadataUri);
  const response = await fetch(resolvedUri, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Metadata fetch failed (${response.status}).`);
  }
  const json = (await response.json()) as unknown;
  return {
    resolvedUri,
    json
  };
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
      const requiredGates = Array.isArray(config.requiredAccessSpaces)
        ? config.requiredAccessSpaces.length
        : Array.isArray(config.requiredGates)
          ? config.requiredGates.length
          : 0;
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
  const [networkSettingsOpen, setNetworkSettingsOpen] = useState(false);
  const [accessViewMode, setAccessViewMode] = useState<AccessViewMode>("simple");
  const autoDeriveKeyRef = useRef("");

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
  const [successCelebrationActive, setSuccessCelebrationActive] = useState(false);
  const [successCelebrationNonce, setSuccessCelebrationNonce] = useState(0);
  const successCelebrationKeyRef = useRef("");

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

    const persistedViewMode = window.localStorage.getItem("grape_access_view_mode");
    if (persistedViewMode === "simple" || persistedViewMode === "advanced") {
      setAccessViewMode(persistedViewMode);
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
    window.localStorage.setItem("grape_access_view_mode", accessViewMode);
  }, [accessViewMode]);

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
  const rpcEndpointDisplay = useMemo(
    () => summarizeEndpointForDisplay(rpcEndpoint),
    [rpcEndpoint]
  );
  const networkLabel = useMemo(() => {
    if (cluster === "mainnet-beta") {
      return "Mainnet Beta";
    }
    if (cluster === "devnet") {
      return "Devnet";
    }
    if (cluster === "testnet") {
      return "Testnet";
    }
    return "Custom RPC";
  }, [cluster]);

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
  const isAdvancedMode = accessViewMode === "advanced";

  useEffect(() => {
    if (memberCheck.status !== "success" || memberCheck.passed !== true) {
      return;
    }
    const celebrationKey = `${memberCheck.signature ?? ""}|${memberCheck.message}`;
    if (successCelebrationKeyRef.current === celebrationKey) {
      return;
    }
    successCelebrationKeyRef.current = celebrationKey;
    setSuccessCelebrationNonce((prev) => prev + 1);
    setSuccessCelebrationActive(true);
    const timer = window.setTimeout(() => setSuccessCelebrationActive(false), 1900);
    return () => window.clearTimeout(timer);
  }, [memberCheck.status, memberCheck.passed, memberCheck.signature, memberCheck.message]);

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

  const buildAdminConsoleLink = (gateIdRaw: string) => {
    const gateId = gateIdRaw.trim();
    if (!gateId) {
      return "";
    }
    const normalizedGateId = parsePublicKey("Gate ID", gateId, true)!.toBase58();
    if (typeof window === "undefined") {
      return "";
    }
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("tab", "admin");
    url.searchParams.set("adminGate", normalizedGateId);
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

  const openAdminConsole = () => {
    try {
      const link = buildAdminConsoleLink(memberForm.gateId);
      if (!link) {
        throw new Error("Gate ID is required before opening admin console.");
      }
      window.location.assign(link);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to open admin console.", "error");
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
      metadataUri: undefined,
      message: "Loading gate configuration...",
      profile: resolveCommunityProfile(gateId.toBase58())
    }));

    let compatibilityErrorMessage: string | undefined;
    try {
      const probeSlot = await connection.getSlot("processed");
      setLastRpcProbeSlot(probeSlot);
      const client = await getClient({ readOnly: true });
      const { gate, sdkError } = await fetchGateWithCompatibility(client, gateId, connection);
      compatibilityErrorMessage = sdkError?.message;

      if (!gate) {
        throw new Error("Gate not found for this gate ID.");
      }

      const criteriaVariant = extractCriteriaVariant(gate.criteria);
      if (!criteriaVariant) {
        throw new Error("Could not read gate criteria.");
      }

      const gateRecord = gate as Record<string, unknown>;
      const metadataUri =
        typeof gateRecord.metadataUri === "string" ? gateRecord.metadataUri.trim() : "";
      let profileOverrides: Partial<CommunityProfile> = {};
      if (metadataUri) {
        try {
          const { json } = await fetchGateMetadataDocument(metadataUri);
          profileOverrides = parseCommunityProfileFromMetadata(json);
        } catch {
          // Metadata is optional; keep static profile fallback.
        }
      }

      setGateContext({
        status: "ready",
        gateId: gateId.toBase58(),
        metadataUri: metadataUri || undefined,
        message: `Gate loaded (RPC slot ${probeSlot}). Required accounts are auto-derived for access checks.`,
        criteriaVariant,
        gateTypeLabel: extractGateTypeLabel(gateRecord.gateType ?? gateRecord.accessType),
        profile: resolveCommunityProfile(gateId.toBase58(), profileOverrides)
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
          [derivedGatePda] = await findPrimaryAccessPda(gateId, GPASS_PROGRAM_ID);
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
        await handleAutoDeriveMemberAccounts({ silent: true, skipGateReload: true });
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
        const [gatePda] = await findPrimaryAccessPda(gateId, GPASS_PROGRAM_ID);
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
    { silent = false, skipGateReload = false }: { silent?: boolean; skipGateReload?: boolean } = {}
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
      const loaded =
        skipGateReload &&
        gateContext.status === "ready" &&
        gateContext.criteriaVariant &&
        gateContext.gateId === gateIdRaw
          ? { criteriaVariant: gateContext.criteriaVariant }
          : await loadGateContext(gateIdRaw, { silent });
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
          const reputationInfo = await connection.getAccountInfo(reputationPda);
          if (reputationInfo && reputationInfo.owner.equals(VINE_REPUTATION_PROGRAM_ID)) {
            const nextReputation = reputationPda.toBase58();
            updates.reputationAccount = nextReputation;
            if (nextReputation !== memberForm.reputationAccount.trim()) {
              derivedCount += 1;
            }
          } else {
            addBlocker(
              "Could not find a valid reputation account for this wallet on the configured season/vineConfig."
            );
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
        const nowUnix = Math.floor(Date.now() / 1000);

        if (selectedIdentity && grapeSpace) {
          const selectedIdentityInfo = await connection.getAccountInfo(selectedIdentity);
          const selectedIdentityIssue =
            !selectedIdentityInfo || !selectedIdentityInfo.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)
              ? "Identity account is missing or has invalid owner."
              : getIdentityGateEligibilityIssue({
                  identityData: selectedIdentityInfo.data,
                  grapeSpace,
                  allowedPlatforms: platforms,
                  nowUnix
                });
          if (selectedIdentityIssue) {
            selectedIdentity = undefined;
            selectedLink = undefined;
            notes.push("Existing identity account does not satisfy gate criteria; attempting re-derive.");
          }
        }

        if (!selectedIdentity && !selectedLink && grapeSpace && verificationSaltCandidates.length > 0) {
          const walletHashes = uniqueByteArrays(
            verificationSaltCandidates.map((salt) =>
              GrapeVerificationRegistry.walletHash(salt, wallet.publicKey!)
            )
          );
          const linked = await findWalletLinkedIdentity({
            connection,
            grapeSpace,
            walletHashes,
            allowedPlatforms: platforms,
            nowUnix
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
                    if (
                      exists &&
                      exists.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID) &&
                      !getIdentityGateEligibilityIssue({
                        identityData: exists.data,
                        grapeSpace,
                        allowedPlatforms: platforms,
                        nowUnix
                      })
                    ) {
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
                  if (
                    exists &&
                    exists.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID) &&
                    !getIdentityGateEligibilityIssue({
                      identityData: exists.data,
                      grapeSpace,
                      allowedPlatforms: platforms,
                      nowUnix
                    })
                  ) {
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
            const selectedLinkInfo = await connection.getAccountInfo(selectedLink);
            let selectedLinkValid = Boolean(
              selectedLinkInfo && selectedLinkInfo.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)
            );
            if (selectedLinkValid && selectedLinkInfo) {
              try {
                const parsedSelectedLink = GrapeVerificationRegistry.parseLink(selectedLinkInfo.data);
                if (!selectedIdentity || !parsedSelectedLink.identity.equals(selectedIdentity)) {
                  selectedLinkValid = false;
                } else if (verificationSaltCandidates.length > 0) {
                  const candidateHashes = verificationSaltCandidates.map((salt) =>
                    GrapeVerificationRegistry.walletHash(salt, wallet.publicKey!)
                  );
                  if (!candidateHashes.some((hash) => byteArraysEqual(hash, parsedSelectedLink.walletHash))) {
                    selectedLinkValid = false;
                  }
                }
              } catch {
                selectedLinkValid = false;
              }
            }
            if (!selectedLinkValid) {
              selectedLink = undefined;
              notes.push("Existing link account does not match selected identity/wallet; attempting re-derive.");
            }
          }

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

  useEffect(() => {
    if (!isWalletConnected || !connection) {
      return;
    }
    if (gateContext.status !== "ready" || !gateContext.gateId) {
      return;
    }
    if (memberDeriveBusy || memberBusy || gateLoadBusy) {
      return;
    }
    const key = [gateContext.gateId, rpcEndpoint, connectedWalletAddress].join(":");
    if (autoDeriveKeyRef.current === key) {
      return;
    }
    autoDeriveKeyRef.current = key;
    void handleAutoDeriveMemberAccounts({ silent: true, skipGateReload: true });
  }, [
    isWalletConnected,
    connection,
    gateContext.status,
    gateContext.gateId,
    rpcEndpoint,
    connectedWalletAddress,
    memberDeriveBusy,
    memberBusy,
    gateLoadBusy
  ]);

  const handleMemberCheck = async () => {
    if (!wallet.publicKey || !connection) {
      const message = "Connect wallet and choose a valid RPC endpoint first.";
      setMemberCheck({ status: "error", message });
      notify(message, "error");
      return;
    }

    setMemberBusy(true);
    let latestCheckParams: CheckGateInputParams | null = null;
    let latestClient: Record<string, unknown> | null = null;
    try {
      const derivedForm = await handleAutoDeriveMemberAccounts({ silent: true });
      if (!derivedForm) {
        throw new Error(
          "Unable to prepare required accounts. For identity-based gates, provide Identity Value or Identity/Link account and retry."
        );
      }
      const effectiveForm = derivedForm ?? memberForm;

      const params = {
        accessId: parsePublicKey("Gate ID", effectiveForm.gateId, true)!,
        gateId: parsePublicKey("Gate ID", effectiveForm.gateId, true)!,
        user: wallet.publicKey,
        reputationAccount: parsePublicKey("Reputation account", effectiveForm.reputationAccount, false),
        identityAccount: parsePublicKey("Identity account", effectiveForm.identityAccount, false),
        linkAccount: parsePublicKey("Link account", effectiveForm.linkAccount, false),
        tokenAccount: parsePublicKey("Token account", effectiveForm.tokenAccount, false),
        storeRecord: effectiveForm.storeRecord
      };
      latestCheckParams = params;

      const loadedGate = await loadGateContext(effectiveForm.gateId, { silent: true });
      if (!loadedGate) {
        throw new Error("Unable to load gate criteria before checking access.");
      }
      const validationIssues = await validateCheckGateInputs({
        connection,
        criteriaVariant: loadedGate.criteriaVariant,
        user: params.user,
        reputationAccount: params.reputationAccount,
        identityAccount: params.identityAccount,
        linkAccount: params.linkAccount,
        tokenAccount: params.tokenAccount
      });
      if (validationIssues.length > 0) {
        throw new Error(`Check input validation failed. ${validationIssues.join(" ")}`);
      }

      const shouldStoreRecord = Boolean(effectiveForm.storeRecord);
      const [gatePda] = await findPrimaryAccessPda(params.gateId, GPASS_PROGRAM_ID);
      const checkedAtLabel = new Date().toLocaleString();
      const gateExplorerUrl = explorerAddressLink(gatePda.toBase58(), rpcEndpoint);
      const userExplorerUrl = explorerAddressLink(params.user.toBase58(), rpcEndpoint);
      const proofItems: VerificationProofItem[] = [
        {
          label: "Gate account",
          address: gatePda.toBase58(),
          url: gateExplorerUrl
        },
        {
          label: "User wallet",
          address: params.user.toBase58(),
          url: userExplorerUrl
        }
      ];
      if (params.reputationAccount) {
        proofItems.push({
          label: "Reputation account",
          address: params.reputationAccount.toBase58(),
          url: explorerAddressLink(params.reputationAccount.toBase58(), rpcEndpoint)
        });
      }
      if (params.identityAccount) {
        proofItems.push({
          label: "Identity account",
          address: params.identityAccount.toBase58(),
          url: explorerAddressLink(params.identityAccount.toBase58(), rpcEndpoint)
        });
      }
      if (params.linkAccount) {
        proofItems.push({
          label: "Link account",
          address: params.linkAccount.toBase58(),
          url: explorerAddressLink(params.linkAccount.toBase58(), rpcEndpoint)
        });
      }
      if (params.tokenAccount) {
        proofItems.push({
          label: "Token account",
          address: params.tokenAccount.toBase58(),
          url: explorerAddressLink(params.tokenAccount.toBase58(), rpcEndpoint)
        });
      }

      let result: unknown;
      let signature: string | undefined;
      let passed: boolean;
      let verificationSlot: number | undefined;
      if (shouldStoreRecord) {
        const client = await getClient();
        latestClient = client;
        const checkMethod = getSdkClientMethod<((arg: unknown) => unknown)>(client, [
          "checkAccess",
          "checkGate"
        ]);
        if (!checkMethod) {
          throw new Error("SDK client is missing checkAccess/checkGate.");
        }
        result = await Promise.resolve(checkMethod.call(client, params));
        signature = extractSignature(result);
        // On-chain check_gate returns an error when the gate is not passed.
        // So if rpc() succeeds, treat that as passed unless SDK explicitly returns false.
        passed = extractPassStatus(result) ?? true;
      } else {
        const readOnlyClient = await getClient({ readOnly: true });
        latestClient = readOnlyClient;
        const buildInstruction = getSdkClientMethod<((arg: unknown) => Promise<TransactionInstruction>)>(
          readOnlyClient,
          ["buildCheckAccessInstruction", "buildCheckGateInstruction"]
        );
        if (!buildInstruction) {
          throw new Error("SDK client is missing buildCheckAccessInstruction/buildCheckGateInstruction.");
        }
        const instruction = await buildInstruction.call(readOnlyClient, {
          ...params,
          storeRecord: false
        });
        const simulation = await simulateInstructionWithFeePayer({
          connection,
          feePayer: params.user,
          instruction
        });
        verificationSlot = simulation.context.slot;
        const simulationErr = simulation.value.err;
        if (!simulationErr) {
          passed = true;
        } else if (hasCustomProgramErrorCode(simulationErr, 6002)) {
          passed = false;
        } else {
          const logs = simulation.value.logs ?? [];
          const logSummary = logs.length > 0 ? ` Logs: ${logs.join(" | ")}` : "";
          throw new Error(`RPC simulation failed: ${JSON.stringify(simulationErr)}.${logSummary}`);
        }
        result = {
          mode: "rpc-simulation",
          slot: simulation.context.slot,
          err: simulationErr,
          logs: simulation.value.logs ?? [],
          unitsConsumed: simulation.value.unitsConsumed ?? null
        };
      }
      const resultMessage =
        passed === true
          ? shouldStoreRecord
            ? "Access granted for this gate."
            : "Access granted (RPC simulation, no transaction sent)."
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
        verificationMode: shouldStoreRecord ? "transaction" : "rpc",
        checkedAtLabel,
        verificationSlot,
        gateExplorerUrl,
        userExplorerUrl,
        proofItems,
        response: toDisplayValue(result)
      });

      notify(
        signature ? `Member check submitted. Signature: ${signature}` : resultMessage,
        passed === false ? "info" : "success"
      );
    } catch (error) {
      let message = await formatCheckGateError(error, connection);

      let borshDetected = false;
      if (error instanceof SendTransactionError) {
        let logs = error.logs ?? [];
        if (logs.length === 0 && connection) {
          try {
            logs = (await error.getLogs(connection)) ?? [];
          } catch {
            // Ignore log fetch failures.
          }
        }
        borshDetected = logs.some(
          (line) => line.includes("BorshIoError") || line.includes("Not all bytes read")
        );
      } else if (error instanceof Error) {
        borshDetected =
          error.message.includes("BorshIoError") || error.message.includes("Not all bytes read");
      }

      if (borshDetected && connection && latestCheckParams && latestClient) {
        try {
          const diagnostics = await runCheckGateBorshDiagnostics({
            connection,
            client: latestClient,
            params: latestCheckParams
          });
          if (diagnostics.length > 0) {
            message = `${message} Diagnostics: ${diagnostics.join(" ")}`;
          }
        } catch {
          // Ignore diagnostic failures and keep original error.
        }
      }

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

      const sharedWalletSaltCandidates = uniqueByteArrays(
        resolvedVerificationSpace.saltCandidates.length > 0
          ? resolvedVerificationSpace.saltCandidates
          : linkContexts.map((context) => context.salt)
      );

      let lastError: Error | null = null;
      for (const attempt of attempts) {
        const attemptWalletSaltCandidates = uniqueByteArrays([
          attempt.salt,
          ...sharedWalletSaltCandidates
        ]);
        const seenLinkAccounts = new Set<string>();

        for (const walletSalt of attemptWalletSaltCandidates) {
          const walletHash = GrapeVerificationRegistry.walletHash(walletSalt, wallet.publicKey);
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
          if (seenLinkAccounts.has(built.link.toBase58())) {
            continue;
          }
          seenLinkAccounts.add(built.link.toBase58());

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

          const simulation = await simulateInstructionWithFeePayer({
            connection,
            feePayer: wallet.publicKey,
            instruction: built.ix
          });
          const simulationLogs = simulation.value.logs ?? [];
          const hasWalletHashMismatch = simulationLogs.some((line) =>
            line.includes("WalletHashMismatch")
          );
          if (hasWalletHashMismatch) {
            continue;
          }
          if (simulation.value.err) {
            lastError = new Error(
              [
                "Link attempt simulation failed.",
                `daoId=${attempt.daoId.toBase58()}`,
                `platform=${attempt.platformSeed}:${PLATFORM_TAGS[attempt.platformSeed] ?? "unknown"}`,
                `identity=${attempt.identity.toBase58()}`,
                `link=${built.link.toBase58()}`,
                `walletSaltHex=${shortHex(walletSalt, 24)}`,
                `walletHashHex=${shortHex(walletHash, 24)}`,
                `simulationErr=${JSON.stringify(simulation.value.err)}`,
                simulationLogs.length > 0
                  ? `logs=${simulationLogs.slice(-8).join(" | ")}`
                  : ""
              ]
                .filter(Boolean)
                .join(" ")
            );
            continue;
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
            let errorMessage =
              error instanceof Error ? error.message : "Failed to submit link wallet transaction.";
            if (error instanceof SendTransactionError) {
              let logs = error.logs ?? [];
              if (logs.length === 0) {
                try {
                  logs = (await error.getLogs(connection)) ?? [];
                } catch {
                  // Ignore log fetch failures and keep original error text.
                }
              }
              if (logs.length > 0) {
                errorMessage = `${errorMessage} Logs: ${logs.slice(-8).join(" | ")}`;
              }
            }
            lastError = new Error(
              [
                "Link attempt failed.",
                `daoId=${attempt.daoId.toBase58()}`,
                `platform=${attempt.platformSeed}:${PLATFORM_TAGS[attempt.platformSeed] ?? "unknown"}`,
                `identity=${attempt.identity.toBase58()}`,
                `link=${built.link.toBase58()}`,
                `walletSaltHex=${shortHex(walletSalt, 24)}`,
                `walletHashHex=${shortHex(walletHash, 24)}`,
                errorMessage
              ].join(" ")
            );
          }
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
      const walletSaltCandidates = uniqueByteArrays([
        ...resolvedVerificationSpace.saltCandidates,
        ...linkContexts.map((context) => context.salt)
      ]);
      for (const [index, walletSalt] of walletSaltCandidates.entries()) {
        const walletHash = GrapeVerificationRegistry.walletHash(walletSalt, wallet.publicKey);
        const links = await connection.getProgramAccounts(GRAPE_VERIFICATION_PROGRAM_ID, {
          filters: [{ memcmp: { offset: 41, bytes: bs58.encode(Buffer.from(walletHash)) } }]
        });
        totalLinkMatches += links.length;
        lines.push(
          `  - salt#${index + 1} saltHex=${shortHex(walletSalt, 24)} walletHashHex=${shortHex(walletHash, 24)} linkMatches=${links.length}`
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
              position: "relative",
              zIndex: 20,
              overflow: "visible",
              isolation: "isolate",
              backgroundColor: "rgba(7,12,22,0.92)",
              backgroundImage: gateContext.profile.bannerUrl
                ? `url(${gateContext.profile.bannerUrl})`
                : `linear-gradient(120deg, ${gateContext.profile.accent}33 0%, rgba(10,16,30,0.6) 60%)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              border: `1px solid ${gateContext.profile.accent}66`,
              "&::before": {
                content: '""',
                position: "absolute",
                inset: 0,
                zIndex: 0,
                borderRadius: "inherit",
                background: gateContext.profile.bannerUrl
                  ? "linear-gradient(120deg, rgba(8,12,20,0.78) 0%, rgba(8,12,20,0.62) 55%, rgba(8,12,20,0.7) 100%)"
                  : "linear-gradient(120deg, rgba(8,12,20,0.66) 0%, rgba(8,12,20,0.5) 100%)"
              },
              "&::after": {
                content: '""',
                position: "absolute",
                inset: 0,
                zIndex: 0,
                borderRadius: "inherit",
                pointerEvents: "none",
                background: `radial-gradient(120% 100% at 0% 0%, ${gateContext.profile.accent}33 0%, transparent 58%)`
              }
            }}
          >
            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                p: { xs: 1.2, md: 1.4 },
                borderRadius: 1.6,
                backgroundColor: "rgba(7,12,22,0.62)",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
                backdropFilter: "blur(4px)"
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.4}
                  alignItems={{ xs: "flex-start", sm: "center" }}
                >
                  {gateContext.profile.logoUrl && (
                    <Box
                      component="img"
                      src={gateContext.profile.logoUrl}
                      alt={`${gateContext.profile.name} logo`}
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 1.6,
                        objectFit: "cover",
                        border: "1px solid rgba(255,255,255,0.28)",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.28)"
                      }}
                    />
                  )}
                  <Box>
                    <Typography
                      variant="h5"
                      sx={{ color: "rgba(247, 250, 255, 0.98)", textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}
                    >
                      {gateContext.profile.name}
                    </Typography>
                    <Typography sx={{ color: "rgba(230, 238, 252, 0.92)", textShadow: "0 1px 2px rgba(0,0,0,0.32)" }}>
                      {gateContext.profile.subtitle}
                    </Typography>
                    {gateContext.profile.description && (
                      <Typography
                        sx={{
                          mt: 0.7,
                          fontSize: "0.9rem",
                          color: "rgba(226, 236, 252, 0.92)",
                          maxWidth: 760,
                          textShadow: "0 1px 2px rgba(0,0,0,0.3)"
                        }}
                      >
                        {gateContext.profile.description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mt: 0.8 }}>
                      <Box
                        sx={{
                          width: 11,
                          height: 11,
                          borderRadius: "50%",
                          backgroundColor: gateContext.profile.accent,
                          border: "1px solid rgba(255,255,255,0.35)"
                        }}
                      />
                      <Typography sx={{ fontSize: "0.8rem", color: "rgba(230, 238, 252, 0.9)" }}>
                        Theme accent: <span className="mono">{gateContext.profile.accent}</span>
                      </Typography>
                    </Stack>
                  </Box>
                </Stack>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  {gateContext.profile.supportUrl && (
                    <Button
                      size="small"
                      variant="outlined"
                      href={gateContext.profile.supportUrl}
                      target="_blank"
                      rel="noreferrer"
                      sx={{
                        borderColor: "rgba(240,246,255,0.4)",
                        color: "rgba(247,250,255,0.96)",
                        backgroundColor: "rgba(8,12,20,0.32)"
                      }}
                    >
                      {gateContext.profile.supportLabel || "Community Support"}
                    </Button>
                  )}
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <IconButton
                      onClick={() => setNetworkSettingsOpen(true)}
                      aria-label="Open network settings"
                      sx={{
                        border: "1px solid",
                        borderColor: "rgba(109, 184, 255, 0.34)",
                        color: "rgba(228, 238, 255, 0.9)",
                        width: 34,
                        height: 34
                      }}
                    >
                      <SettingsRoundedIcon fontSize="small" />
                    </IconButton>
                    <BaseWalletMultiButton labels={ACCESS_WALLET_BUTTON_LABELS} />
                  </Stack>
                </Stack>
              </Stack>
              <Box sx={{ mt: 0.5 }}>
                {gateContext.gateTypeLabel && (
                  <Typography sx={{ mt: 0.7, fontSize: "0.85rem", color: "rgba(226, 236, 252, 0.9)" }}>
                    Gate Type: {gateContext.gateTypeLabel}
                  </Typography>
                )}
                {gateContext.metadataUri && (
                  <Typography
                    sx={{
                      mt: 0.4,
                      fontSize: "0.8rem",
                      color: "rgba(220, 232, 251, 0.86)",
                      wordBreak: "break-all"
                    }}
                  >
                    Metadata URI: <span className="mono">{gateContext.metadataUri}</span>
                  </Typography>
                )}
              </Box>
            </Box>
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

          <TextField
            fullWidth
            label="Gate ID"
            value={memberForm.gateId}
            onChange={(event) => setMemberGateId(event.target.value)}
            helperText={`Gate ID identifier (not the gate PDA account address). Network: ${networkLabel}.`}
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
            <Button
              variant="outlined"
              onClick={openAdminConsole}
              disabled={!memberForm.gateId}
            >
              Manage Gate (Admin)
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

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }}>
            <FormControl sx={{ minWidth: 220 }}>
              <InputLabel>Access Mode</InputLabel>
              <Select
                label="Access Mode"
                value={accessViewMode}
                onChange={(event) => setAccessViewMode(event.target.value as AccessViewMode)}
              >
                <MenuItem value="simple">Simple</MenuItem>
                <MenuItem value="advanced">Advanced</MenuItem>
              </Select>
            </FormControl>
            {!isAdvancedMode && (
              <Typography sx={{ color: "text.secondary", fontSize: "0.88rem" }}>
                Accounts auto-derive after gate load.
              </Typography>
            )}
          </Stack>

          {isAdvancedMode && (
            <>
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
                  sx={{
                    p: 1.5,
                    borderColor: "rgba(109, 184, 255, 0.24)",
                    backgroundColor: "rgba(6, 14, 24, 0.5)"
                  }}
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
            </>
          )}

          {!isAdvancedMode && memberDerive.status === "error" && (
            <Alert severity="error">{memberDerive.message}</Alert>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={memberForm.storeRecord}
                onChange={(event) => updateMemberForm("storeRecord", event.target.checked)}
              />
            }
            label="Store my check record on-chain"
          />

          {isAdvancedMode ? (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button variant="outlined" onClick={() => void copyText(JSON.stringify(memberPreview, null, 2))}>
                Copy Check Payload
              </Button>
              <Button
                variant="contained"
                onClick={handleMemberCheck}
                disabled={memberBusy || !isWalletConnected || !connection || gateContext.status !== "ready"}
                startIcon={memberBusy ? <CircularProgress size={16} color="inherit" /> : <ShieldRoundedIcon />}
              >
                {memberBusy ? "Checking..." : "Check My Access"}
              </Button>
            </Stack>
          ) : (
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={handleMemberCheck}
              disabled={memberBusy || !isWalletConnected || !connection || gateContext.status !== "ready"}
              startIcon={memberBusy ? <CircularProgress size={18} color="inherit" /> : <ShieldRoundedIcon />}
              sx={{ py: 1.25, fontSize: "1.04rem", fontWeight: 700 }}
            >
              {memberBusy ? "Checking Access..." : "Check My Access"}
            </Button>
          )}

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
                position: "relative",
                overflow: "hidden",
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
                      : "rgba(244, 67, 54, 0.12)",
                boxShadow:
                  memberCheck.passed === true && successCelebrationActive
                    ? "0 0 0 1px rgba(125, 246, 209, 0.22), 0 0 28px rgba(109, 184, 255, 0.24)"
                    : undefined
              }}
            >
              {memberCheck.passed === true && successCelebrationActive && (
                <Box key={successCelebrationNonce} className="access-wow-overlay">
                  <Box className="access-wow-glow" />
                  <Box className="access-wow-ring" />
                  {ACCESS_SUCCESS_SPARKS.map((spark, index) => (
                    <Box
                      key={`${successCelebrationNonce}-${index}`}
                      className="access-wow-spark"
                      style={
                        {
                          "--sx": `${spark.x}%`,
                          "--tx": `${spark.tx}px`,
                          "--ty": `${spark.ty}px`,
                          "--sd": `${spark.delay}ms`,
                          "--sc": spark.color
                        } as CSSProperties
                      }
                    />
                  ))}
                </Box>
              )}
              <Stack spacing={1.2}>
                <Typography variant="subtitle1">
                  {memberCheck.passed === true
                    ? "You are in."
                    : memberCheck.passed === false
                      ? "You are close."
                      : "Action needed."}
                </Typography>
                {gateContext.profile.supportLabel && (
                  <Typography color="text.secondary">{gateContext.profile.supportLabel}</Typography>
                )}
                {memberCheck.checkedAtLabel && (
                  <Typography variant="caption" color="text.secondary">
                    {memberCheck.verificationMode === "rpc"
                      ? "Verified via RPC"
                      : "Verified on-chain"}
                    {`: ${memberCheck.checkedAtLabel}`}
                    {typeof memberCheck.verificationSlot === "number"
                      ? ` (slot ${memberCheck.verificationSlot})`
                      : ""}
                  </Typography>
                )}
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
                  {gateContext.profile.supportUrl && (
                    <Button
                      href={gateContext.profile.supportUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="outlined"
                    >
                      Community Support
                    </Button>
                  )}
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
                  {!memberCheck.signature && memberCheck.gateExplorerUrl && (
                    <Button
                      href={memberCheck.gateExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="text"
                    >
                      View Gate
                    </Button>
                  )}
                  {!memberCheck.signature && memberCheck.userExplorerUrl && (
                    <Button
                      href={memberCheck.userExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="text"
                    >
                      View Wallet
                    </Button>
                  )}
                </Stack>
                {memberCheck.proofItems && memberCheck.proofItems.length > 0 && (
                  <Stack spacing={0.45}>
                    <Typography variant="caption" color="text.secondary">
                      Verification proof accounts
                    </Typography>
                    <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                      {memberCheck.proofItems.map((item) => (
                        <Button
                          key={`${item.label}:${item.address}`}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          variant="text"
                          size="small"
                          title={`${item.label}: ${item.address}`}
                          sx={{ minWidth: 0, px: 0.6, py: 0.2, textTransform: "none", fontSize: "0.74rem" }}
                        >
                          {item.label}: {shortenAddress(item.address)}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </Paper>
          )}

          {isAdvancedMode && (
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
          )}

          <Box>
            <Button href="/" variant="text" size="small">
              Back to Console
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Dialog
        open={networkSettingsOpen}
        onClose={() => setNetworkSettingsOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Network Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={1.4} sx={{ mt: 0.6 }}>
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
            <Typography variant="caption" color="text.secondary" className="mono">
              Active endpoint: {rpcEndpointDisplay}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNetworkSettingsOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>

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
