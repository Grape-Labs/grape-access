"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputAdornment,
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
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import { Buffer } from "buffer";
import { AnchorProvider, BorshAccountsCoder } from "@coral-xyz/anchor";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl
} from "@solana/web3.js";
import bs58 from "bs58";
import * as GPassSdk from "@grapenpm/grape-access-sdk";
import * as GrapeVerificationRegistry from "@grapenpm/grape-verification-registry";
import * as VineReputationClient from "@grapenpm/vine-reputation-client";

type CriteriaKind =
  | "minReputation"
  | "verifiedIdentity"
  | "verifiedWithWallet"
  | "combined"
  | "timeLockedReputation"
  | "multiDao"
  | "tokenHolding"
  | "nftCollection"
  | "customProgram";

type GateTypeKind = "singleUse" | "reusable" | "timeLimited" | "subscription";
type ClusterKind = "devnet" | "testnet" | "mainnet-beta" | "custom";
type AccessCheckMode = "simple" | "advanced";
type GateEditorMode = "create" | "edit";
const SHYFT_MAINNET_RPC =
  process.env.NEXT_PUBLIC_SHYFT_MAINNET_RPC?.trim() ||
  "https://api.mainnet-beta.solana.com";
const DEFAULT_CLUSTER: ClusterKind = "mainnet-beta";
const GPASS_ADMIN_WALLET = "GScbAQoP73BsUZDXSpe8yLCteUx7MJn1qzWATZapTbWt";

interface WalletProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  connected?: boolean;
  publicKey?: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey } | void>;
  disconnect: () => Promise<void>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
}

interface AnchorCompatibleWallet {
  publicKey: PublicKey;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
}

declare global {
  interface Window {
    Buffer?: typeof Buffer;
  }
}

interface CreateFormState {
  gateId: string;
  authority: string;
  metadataUri: string;
  metadataName: string;
  metadataSubtitle: string;
  metadataDescription: string;
  metadataLogoUri: string;
  metadataBannerUri: string;
  metadataAccent: string;
  metadataSupportLabel: string;
  metadataSupportUrl: string;
  metadataDiscordGuildId: string;
  metadataDiscordPassRoleId: string;
  metadataDiscordFailAction: string;
  metadataTelegramChatId: string;
  metadataTelegramPassEntitlement: string;
  metadataRevalidationIntervalSeconds: string;
  metadataRevalidationLeaseSeconds: string;
  metadataVerifyUrl: string;
  criteriaKind: CriteriaKind;
  gateTypeKind: GateTypeKind;
  selectedPlatforms: number[];
  vineConfig: string;
  minPoints: string;
  season: string;
  grapeSpace: string;
  requireWalletLink: boolean;
  minHoldDurationSeconds: string;
  requiredGates: string;
  requireAll: boolean;
  mint: string;
  minAmount: string;
  checkAta: boolean;
  collectionMint: string;
  minCount: string;
  programId: string;
  instructionDataHex: string;
  durationSeconds: string;
  intervalSeconds: string;
}

interface CheckFormState {
  gateId: string;
  user: string;
  reputationAccount: string;
  identityAccount: string;
  linkAccount: string;
  tokenAccount: string;
  storeRecord: boolean;
}

interface CheckDeriveState {
  status: "idle" | "success" | "error";
  message: string;
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

interface AdminFormState {
  authorityFilter: string;
  selectedGateId: string;
  metadataUri: string;
  setActiveValue: boolean;
  newAuthority: string;
  closeRecipient: string;
  closeRecordUser: string;
}

interface AdminGateItem {
  pda: string;
  gateId: string;
  authority: string;
  isActive: boolean;
  totalChecks: string;
  successfulChecks: string;
  hasKnownStats: boolean;
  statsLabel: string;
}

interface AdminGateUserItem {
  pda: string;
  user: string;
  passed: boolean;
  checkedAt: number;
  checkedAtLabel: string;
}

interface GateTemplate {
  id: string;
  title: string;
  description: string;
  criteriaKind: CriteriaKind;
  gateTypeKind: GateTypeKind;
  defaults: Partial<CreateFormState>;
}

interface ActivityItem {
  label: string;
  message: string;
  signature?: string;
  createdAt: number;
}

type AdminBusyAction =
  | ""
  | "loadGates"
  | "loadUsers"
  | "fetchGate"
  | "loadEditor"
  | "updateMetadataUri"
  | "setActive"
  | "setAuthority"
  | "updateCriteria"
  | "closeGate"
  | "closeRecord"
  | "emergencyCloseGate";

type AdminConfirmAction =
  | ""
  | "setAuthority"
  | "closeGate"
  | "closeRecord"
  | "emergencyCloseGate";

const {
  GPASS_PROGRAM_ID,
  GRAPE_VERIFICATION_PROGRAM_ID,
  VINE_REPUTATION_PROGRAM_ID,
  VerificationPlatform,
  AccessCriteriaFactory,
  AccessTypeFactory,
  findAccessPda,
  GateCriteriaFactory,
  GateTypeFactory,
  findGatePda,
  findGrapeIdentityPda,
  findGrapeLinkPda
} = GPassSdk;

const CriteriaFactory = (AccessCriteriaFactory ?? GateCriteriaFactory) as typeof GateCriteriaFactory;
const TypeFactory = (AccessTypeFactory ?? GateTypeFactory) as typeof GateTypeFactory;
const findPrimaryAccessPda = (findAccessPda ?? findGatePda) as typeof findGatePda;

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const createSteps = ["Choose Template", "Configure Gate", "Review & Execute"];
const primaryTabItems = [
  { label: "Create Gate", value: 0 },
  { label: "Check Access", value: 2 },
  { label: "Admin Console", value: 3 },
  { label: "Community Gate", value: 4 }
] as const;
const CHECK_INSTRUCTION_DISCRIMINATORS = new Set([
  "4a3e2abc60e53f32", // check_access
  "87c05f46a62dcf29", // check_gate (legacy)
  "097d0319a9f78d68", // checkAccess (IDL/client compatibility)
  "71f768eb3121169a" // checkGate (IDL/client compatibility)
]);
const CHECK_RECORD_OWNER_OFFSETS = [8, 9] as const;

const criteriaOptions: { value: CriteriaKind; label: string }[] = [
  { value: "combined", label: "Reputation + Verified Identity" },
  { value: "minReputation", label: "Reputation Only" },
  { value: "verifiedIdentity", label: "Verified Identity" },
  { value: "verifiedWithWallet", label: "Verified Identity + Wallet Link" },
  { value: "timeLockedReputation", label: "Time-Locked Reputation" },
  { value: "multiDao", label: "Multi-DAO Gate" },
  { value: "tokenHolding", label: "Token Holding" },
  { value: "nftCollection", label: "NFT Collection" },
  { value: "customProgram", label: "Custom Program" }
];

const gateTypeOptions: { value: GateTypeKind; label: string }[] = [
  { value: "singleUse", label: "Single Use" },
  { value: "reusable", label: "Reusable" },
  { value: "timeLimited", label: "Time Limited" },
  { value: "subscription", label: "Subscription" }
];

const platformOptions = [
  { label: "Discord", value: VerificationPlatform.Discord as number, icon: "D", bg: "#5865F2", fg: "#F6F8FF" },
  { label: "Telegram", value: VerificationPlatform.Telegram as number, icon: "T", bg: "#2AABEE", fg: "#F6FEFF" },
  { label: "X", value: VerificationPlatform.Twitter as number, icon: "X", bg: "#0f1218", fg: "#F5F7FA" },
  { label: "Email", value: VerificationPlatform.Email as number, icon: "@", bg: "#1f2937", fg: "#EFF6FF" }
];
const PLATFORM_LABELS: Record<number, string> = Object.fromEntries(
  platformOptions.map((option) => [option.value, option.label])
) as Record<number, string>;
const PLATFORM_TAGS: Record<number, string> = {
  0: "discord",
  1: "telegram",
  2: "twitter",
  3: "email"
};

const defaultCreateForm: CreateFormState = {
  gateId: "",
  authority: "",
  metadataUri: "",
  metadataName: "",
  metadataSubtitle: "",
  metadataDescription: "",
  metadataLogoUri: "",
  metadataBannerUri: "",
  metadataAccent: "#6db8ff",
  metadataSupportLabel: "",
  metadataSupportUrl: "",
  metadataDiscordGuildId: "",
  metadataDiscordPassRoleId: "",
  metadataDiscordFailAction: "remove_role",
  metadataTelegramChatId: "",
  metadataTelegramPassEntitlement: "member",
  metadataRevalidationIntervalSeconds: "3600",
  metadataRevalidationLeaseSeconds: "86400",
  metadataVerifyUrl: "",
  criteriaKind: "combined",
  gateTypeKind: "timeLimited",
  selectedPlatforms: [VerificationPlatform.Discord as number],
  vineConfig: "",
  minPoints: "1000",
  season: "1",
  grapeSpace: "",
  requireWalletLink: true,
  minHoldDurationSeconds: "86400",
  requiredGates: "",
  requireAll: true,
  mint: "",
  minAmount: "1",
  checkAta: true,
  collectionMint: "",
  minCount: "1",
  programId: "",
  instructionDataHex: "",
  durationSeconds: "604800",
  intervalSeconds: "2592000"
};

const defaultCheckForm: CheckFormState = {
  gateId: "",
  user: "",
  reputationAccount: "",
  identityAccount: "",
  linkAccount: "",
  tokenAccount: "",
  storeRecord: true
};

const defaultCheckDeriveState: CheckDeriveState = {
  status: "idle",
  message: "Accounts are derived automatically from gate + user wallet."
};

const defaultMemberForm: MemberFormState = {
  gateId: "",
  identityValue: "",
  reputationAccount: "",
  identityAccount: "",
  linkAccount: "",
  tokenAccount: "",
  storeRecord: false
};

const defaultAdminForm: AdminFormState = {
  authorityFilter: "",
  selectedGateId: "",
  metadataUri: "",
  setActiveValue: true,
  newAuthority: "",
  closeRecipient: "",
  closeRecordUser: ""
};

const templates: GateTemplate[] = [
  {
    id: "community-rep",
    title: "Community Reputation",
    description: "Require a minimum reputation score and verified social identity.",
    criteriaKind: "combined",
    gateTypeKind: "timeLimited",
    defaults: {
      minPoints: "1000",
      season: "1",
      durationSeconds: "604800",
      selectedPlatforms: [VerificationPlatform.Discord as number],
      requireWalletLink: true
    }
  },
  {
    id: "token-community",
    title: "Token Holder",
    description: "Grant access to holders of a token, with reusable checks.",
    criteriaKind: "tokenHolding",
    gateTypeKind: "reusable",
    defaults: {
      minAmount: "1",
      checkAta: true
    }
  },
  {
    id: "nft-club",
    title: "NFT Club",
    description: "Require users to hold at least one NFT in your collection.",
    criteriaKind: "nftCollection",
    gateTypeKind: "reusable",
    defaults: {
      minCount: "1"
    }
  }
];

function splitCsv(raw: string) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(label: string, raw: string, min = 0) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }
  if (value < min) {
    throw new Error(`${label} must be greater than or equal to ${min}.`);
  }
  return value;
}

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

function parseHexBuffer(raw: string) {
  const clean = raw.trim().replace(/^0x/, "");
  if (!clean) {
    return Buffer.alloc(0);
  }
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error("Instruction data must be valid even-length hex.");
  }
  return Buffer.from(clean, "hex");
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

function asBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }
  return undefined;
}

function asCounterString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    return /^[0-9]+$/.test(trimmed) ? trimmed : undefined;
  }
  if (typeof value === "object") {
    const maybe = value as { toString?: () => string };
    if (typeof maybe.toString === "function") {
      try {
        const rendered = maybe.toString().trim();
        if (/^[0-9]+$/.test(rendered)) {
          return rendered;
        }
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function pickCounterFromAccount(
  account: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const direct = asCounterString(account[key]);
    if (direct !== undefined) {
      return direct;
    }
  }
  const nestedData =
    account.data && typeof account.data === "object"
      ? (account.data as Record<string, unknown>)
      : undefined;
  if (!nestedData) {
    return undefined;
  }
  for (const key of keys) {
    const nested = asCounterString(nestedData[key]);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function bytesFromUnknown(value: unknown): Uint8Array | null {
  if (!value) {
    return null;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof Buffer) {
    return Uint8Array.from(value);
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((entry) => Number(entry) & 0xff));
  }
  if (typeof value === "object") {
    const maybeObject = value as { data?: unknown };
    if (Array.isArray(maybeObject.data)) {
      return Uint8Array.from(maybeObject.data.map((entry) => Number(entry) & 0xff));
    }
    if (maybeObject.data instanceof Uint8Array) {
      return Uint8Array.from(maybeObject.data);
    }
  }
  return null;
}

function toPubkeyString(value: unknown): string {
  const pk = asPublicKeyValue(value);
  if (pk) {
    return pk.toBase58();
  }
  return typeof value === "string" ? value : "";
}

function readAuthorityString(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    const maybePk = value as { toBase58?: () => string };
    if (typeof maybePk.toBase58 === "function") {
      try {
        return maybePk.toBase58();
      } catch {
        return "";
      }
    }
  }
  return "";
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

function decodeAccessLikeAccountData(
  data: Buffer | Uint8Array
): Record<string, unknown> | null {
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
        const decoded = coder.decodeUnchecked(accountName, bytes) as Record<string, unknown>;
        return decoded;
      }
    }
  } catch {
    // Ignore decode failures and let higher-level fallbacks continue.
  }

  return null;
}

function readAccessIdFromRawData(data: Buffer | Uint8Array): PublicKey | undefined {
  const bytes = Buffer.from(data);
  if (bytes.length < 41) {
    return undefined;
  }
  try {
    return new PublicKey(bytes.subarray(9, 41));
  } catch {
    return undefined;
  }
}

function matchesCheckInstructionDiscriminator(dataBase58: string): boolean {
  if (!dataBase58) {
    return false;
  }
  try {
    const bytes = bs58.decode(dataBase58);
    if (bytes.length < 8) {
      return false;
    }
    const discriminatorHex = Buffer.from(bytes.subarray(0, 8)).toString("hex");
    return CHECK_INSTRUCTION_DISCRIMINATORS.has(discriminatorHex);
  } catch {
    return false;
  }
}

function getCheckRecordLikeAccountNamesFromIdl(): string[] {
  const sdkAny = GPassSdk as Record<string, unknown>;
  const idl = sdkAny.IDL as { accounts?: Array<{ name?: string }> } | undefined;
  if (!idl?.accounts) {
    return [];
  }
  return idl.accounts
    .map((account) => account.name)
    .filter((name): name is string => Boolean(name && /checkrecord/i.test(name)));
}

function decodeCheckRecordLikeAccountData(
  data: Buffer | Uint8Array
): Record<string, unknown> | null {
  const sdkAny = GPassSdk as Record<string, unknown>;
  const idl = sdkAny.IDL;
  if (!idl) {
    return null;
  }

  try {
    const coder = new BorshAccountsCoder(idl as any);
    const bytes = Buffer.from(data);
    const accountNames = getCheckRecordLikeAccountNamesFromIdl();
    for (const accountName of accountNames) {
      const discriminator = BorshAccountsCoder.accountDiscriminator(accountName);
      if (bytes.subarray(0, 8).equals(discriminator)) {
        return coder.decodeUnchecked(accountName, bytes) as Record<string, unknown>;
      }
    }
  } catch {
    // Ignore decode failures and let higher-level fallbacks continue.
  }

  return null;
}

function readGateCheckRecordFromRawData(
  data: Buffer | Uint8Array
): { gate: PublicKey; user: PublicKey; passed: boolean; checkedAt: number } | null {
  const bytes = Buffer.from(data);
  if (bytes.length < 82 || bytes.length > 120) {
    return null;
  }

  const parseAtOffset = (gateOffset: number) => {
    const userOffset = gateOffset + 32;
    const passedOffset = userOffset + 32;
    const checkedAtOffset = passedOffset + 1;
    const minLen = checkedAtOffset + 8 + 1; // checked_at + bump
    if (bytes.length < minLen) {
      return null;
    }
    const passedByte = bytes[passedOffset];
    if (passedByte !== 0 && passedByte !== 1) {
      return null;
    }
    try {
      const gate = new PublicKey(bytes.subarray(gateOffset, gateOffset + 32));
      const user = new PublicKey(bytes.subarray(userOffset, userOffset + 32));
      const checkedAtBig = bytes.readBigInt64LE(checkedAtOffset);
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
      const checkedAt =
        checkedAtBig > maxSafe || checkedAtBig < minSafe ? 0 : Number(checkedAtBig);
      return {
        gate,
        user,
        passed: passedByte === 1,
        checkedAt
      };
    } catch {
      return null;
    }
  };

  return parseAtOffset(9) ?? parseAtOffset(8);
}

function buildCreateFormUpdatesFromGateData(gateData: Record<string, unknown>): Partial<CreateFormState> {
  const criteriaVariant = extractCriteriaVariant(gateData.criteria);
  if (!criteriaVariant) {
    throw new Error("Could not decode gate criteria.");
  }

  const updates: Partial<CreateFormState> = {
    criteriaKind: criteriaVariant.type as CriteriaKind
  };
  const gateId = toPubkeyString(gateData.gateId ?? gateData.accessId);
  const authority = toPubkeyString(gateData.authority);
  const metadataUri = typeof gateData.metadataUri === "string" ? gateData.metadataUri : "";
  if (gateId) {
    updates.gateId = gateId;
  }
  if (authority) {
    updates.authority = authority;
  }
  if (metadataUri) {
    updates.metadataUri = metadataUri;
  }

  const config = criteriaVariant.config;
  const minPoints = asNumberValue(config.minPoints);
  const season = asNumberValue(config.season);
  const grapeSpace = toPubkeyString(config.grapeSpace);
  const vineConfig = toPubkeyString(config.vineConfig);
  const platforms = normalizePlatforms(config.platforms);

  switch (criteriaVariant.type) {
    case "minReputation": {
      if (vineConfig) {
        updates.vineConfig = vineConfig;
      }
      if (minPoints !== undefined) {
        updates.minPoints = String(minPoints);
      }
      if (season !== undefined) {
        updates.season = String(season);
      }
      break;
    }
    case "verifiedIdentity": {
      if (grapeSpace) {
        updates.grapeSpace = grapeSpace;
      }
      if (platforms.length > 0) {
        updates.selectedPlatforms = platforms;
      }
      break;
    }
    case "verifiedWithWallet": {
      if (grapeSpace) {
        updates.grapeSpace = grapeSpace;
      }
      if (platforms.length > 0) {
        updates.selectedPlatforms = platforms;
      }
      break;
    }
    case "combined": {
      if (vineConfig) {
        updates.vineConfig = vineConfig;
      }
      if (minPoints !== undefined) {
        updates.minPoints = String(minPoints);
      }
      if (season !== undefined) {
        updates.season = String(season);
      }
      if (grapeSpace) {
        updates.grapeSpace = grapeSpace;
      }
      if (platforms.length > 0) {
        updates.selectedPlatforms = platforms;
      }
      const requireWalletLink = asBooleanValue(config.requireWalletLink);
      if (requireWalletLink !== undefined) {
        updates.requireWalletLink = requireWalletLink;
      }
      break;
    }
    case "timeLockedReputation": {
      if (vineConfig) {
        updates.vineConfig = vineConfig;
      }
      if (minPoints !== undefined) {
        updates.minPoints = String(minPoints);
      }
      if (season !== undefined) {
        updates.season = String(season);
      }
      const minHold = asNumberValue(config.minHoldDurationSeconds);
      if (minHold !== undefined) {
        updates.minHoldDurationSeconds = String(minHold);
      }
      break;
    }
    case "multiDao": {
      const requiredRaw = Array.isArray(config.requiredAccessSpaces)
        ? config.requiredAccessSpaces
        : Array.isArray(config.requiredGates)
          ? config.requiredGates
          : [];
      const required = requiredRaw
        .map((entry) => toPubkeyString(entry))
        .filter((entry) => Boolean(entry));
      updates.requiredGates = required.join(", ");
      const requireAll = asBooleanValue(config.requireAll);
      if (requireAll !== undefined) {
        updates.requireAll = requireAll;
      }
      break;
    }
    case "tokenHolding": {
      const mint = toPubkeyString(config.mint);
      if (mint) {
        updates.mint = mint;
      }
      const minAmount = asNumberValue(config.minAmount);
      if (minAmount !== undefined) {
        updates.minAmount = String(minAmount);
      }
      const checkAta = asBooleanValue(config.checkAta);
      if (checkAta !== undefined) {
        updates.checkAta = checkAta;
      }
      break;
    }
    case "nftCollection": {
      const collectionMint = toPubkeyString(config.collectionMint);
      if (collectionMint) {
        updates.collectionMint = collectionMint;
      }
      const minCount = asNumberValue(config.minCount);
      if (minCount !== undefined) {
        updates.minCount = String(minCount);
      }
      break;
    }
    case "customProgram": {
      const programId = toPubkeyString(config.programId);
      if (programId) {
        updates.programId = programId;
      }
      const bytes = bytesFromUnknown(config.instructionData);
      if (bytes) {
        updates.instructionDataHex = Buffer.from(bytes).toString("hex");
      }
      break;
    }
    default:
      break;
  }

  const gateType = gateData.gateType ?? gateData.accessType;
  if (gateType && typeof gateType === "object") {
    const gateTypeObj = gateType as Record<string, unknown>;
    if ("singleUse" in gateTypeObj) {
      updates.gateTypeKind = "singleUse";
    } else if ("reusable" in gateTypeObj) {
      updates.gateTypeKind = "reusable";
    } else if ("timeLimited" in gateTypeObj) {
      updates.gateTypeKind = "timeLimited";
      const cfg =
        gateTypeObj.timeLimited && typeof gateTypeObj.timeLimited === "object"
          ? (gateTypeObj.timeLimited as Record<string, unknown>)
          : null;
      const duration = cfg ? asNumberValue(cfg.durationSeconds) : undefined;
      if (duration !== undefined) {
        updates.durationSeconds = String(duration);
      }
    } else if ("subscription" in gateTypeObj) {
      updates.gateTypeKind = "subscription";
      const cfg =
        gateTypeObj.subscription && typeof gateTypeObj.subscription === "object"
          ? (gateTypeObj.subscription as Record<string, unknown>)
          : null;
      const interval = cfg ? asNumberValue(cfg.intervalSeconds) : undefined;
      if (interval !== undefined) {
        updates.intervalSeconds = String(interval);
      }
    }
  }

  return updates;
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
  return error instanceof Error ? error.message : "Failed to check gate.";
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

function byteArraysEqual(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function readI64Le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 8 > bytes.length) {
    return 0;
  }
  const view = Buffer.from(bytes);
  const value = view.readBigInt64LE(offset);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
  if (value > maxSafe || value < minSafe) {
    return 0;
  }
  return Number(value);
}

function parseVerificationIdentityData(
  identityData: Uint8Array | Buffer
): { platform: number; verified: boolean; verifiedAt: number; expiresAt: number } | null {
  const bytes = Uint8Array.from(identityData);
  for (const offset of [8, 0]) {
    if (bytes.length < offset + 83) {
      continue;
    }
    try {
      const platform = bytes[offset + 33];
      const verifiedRaw = bytes[offset + 66];
      if (verifiedRaw !== 0 && verifiedRaw !== 1) {
        continue;
      }
      const verified = verifiedRaw === 1;
      const verifiedAt = readI64Le(bytes, offset + 67);
      const expiresAt = readI64Le(bytes, offset + 75);
      return { platform, verified, verifiedAt, expiresAt };
    } catch {
      // Ignore and try fallback offset.
    }
  }
  return null;
}

function identityBelongsToSpace(identityData: Uint8Array | Buffer, grapeSpace: PublicKey): boolean {
  const bytes = Uint8Array.from(identityData);
  const spaceBytes = grapeSpace.toBytes();
  if (bytes.length >= 40 && byteArraysEqual(bytes.subarray(8, 40), spaceBytes)) {
    return true;
  }
  if (bytes.length >= 41 && byteArraysEqual(bytes.subarray(9, 41), spaceBytes)) {
    return true;
  }
  if (bytes.length >= 72 && byteArraysEqual(bytes.subarray(40, 72), spaceBytes)) {
    return true;
  }
  if (bytes.length >= 73 && byteArraysEqual(bytes.subarray(41, 73), spaceBytes)) {
    return true;
  }
  return false;
}

function getIdentityGateEligibilityIssue(args: {
  identityData: Uint8Array | Buffer;
  grapeSpace: PublicKey;
  allowedPlatforms: number[];
  nowUnix: number;
}): string | null {
  const { identityData, grapeSpace, allowedPlatforms, nowUnix } = args;
  if (!identityBelongsToSpace(identityData, grapeSpace)) {
    return "Identity account does not belong to this gate's verification space.";
  }
  const parsed = parseVerificationIdentityData(identityData);
  if (!parsed) {
    return "Identity account data could not be parsed.";
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
      verifiedAt: number;
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
          verifiedAt: identityParsed.verifiedAt,
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
        if (left.verifiedAt !== right.verifiedAt) {
          return right.verifiedAt - left.verifiedAt;
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

async function getLinkedIdentityForUser(args: {
  connection: Connection;
  user: PublicKey;
  grapeSpace: PublicKey;
  verificationSpaceSaltCandidates: Uint8Array[];
  allowedPlatforms: number[];
  nowUnix: number;
}) {
  const { connection, user, grapeSpace, verificationSpaceSaltCandidates, allowedPlatforms, nowUnix } =
    args;
  if (verificationSpaceSaltCandidates.length === 0) {
    return null;
  }
  const walletHashes = uniqueByteArrays(
    verificationSpaceSaltCandidates.map((spaceSalt) =>
      GrapeVerificationRegistry.walletHash(spaceSalt, user)
    )
  );
  return findWalletLinkedIdentity({
    connection,
    grapeSpace,
    walletHashes,
    allowedPlatforms,
    nowUnix
  });
}

async function validateExistingIdentityForGate(args: {
  connection: Connection;
  identity: PublicKey;
  grapeSpace: PublicKey;
  allowedPlatforms: number[];
  nowUnix: number;
}) {
  const { connection, identity, grapeSpace, allowedPlatforms, nowUnix } = args;
  const info = await connection.getAccountInfo(identity);
  if (!info || !info.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
    return "Identity account is missing or has invalid owner.";
  }
  return getIdentityGateEligibilityIssue({
    identityData: info.data,
    grapeSpace,
    allowedPlatforms,
    nowUnix
  });
}

async function validateExistingLinkForUser(args: {
  connection: Connection;
  link: PublicKey;
  identity: PublicKey;
  user: PublicKey;
  verificationSpaceSaltCandidates: Uint8Array[];
}) {
  const { connection, link, identity, user, verificationSpaceSaltCandidates } = args;
  const info = await connection.getAccountInfo(link);
  if (!info || !info.owner.equals(GRAPE_VERIFICATION_PROGRAM_ID)) {
    return "Link account is missing or has invalid owner.";
  }
  try {
    const parsed = GrapeVerificationRegistry.parseLink(info.data);
    if (!parsed.identity.equals(identity)) {
      return "Link account points to a different identity.";
    }
    if (verificationSpaceSaltCandidates.length > 0) {
      const candidateHashes = verificationSpaceSaltCandidates.map((salt) =>
        GrapeVerificationRegistry.walletHash(salt, user)
      );
      if (!candidateHashes.some((hash) => byteArraysEqual(hash, parsed.walletHash))) {
        return "Link account wallet hash does not match this user for the gate's verification salts.";
      }
    }
    return null;
   } catch {
    return "Link account data could not be parsed.";
  }
}

async function deriveRequiredLinkForUser(args: {
  connection: Connection;
  identity: PublicKey;
  user: PublicKey;
  verificationSpaceSaltCandidates: Uint8Array[];
}) {
  const { connection, identity, user, verificationSpaceSaltCandidates } = args;
  const registryWalletHashes = uniqueByteArrays(
    verificationSpaceSaltCandidates.map((spaceSalt) =>
      GrapeVerificationRegistry.walletHash(spaceSalt, user)
    )
  );
  for (const registryWalletHash of registryWalletHashes) {
    const [registryLinkPda] = GrapeVerificationRegistry.deriveLinkPda(identity, registryWalletHash);
    const registryLinkExists = await connection.getAccountInfo(registryLinkPda);
    if (registryLinkExists) {
      return registryLinkPda;
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

function uniqueByteArrays(values: Uint8Array[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const value of values) {
    if (!out.some((entry) => Buffer.from(entry).equals(Buffer.from(value)))) {
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
    pushIfPresent(entry.offset + 32);
    pushIfPresent(entry.offset + 64);
    pushIfPresent(entry.offset + 98);
  }

  return uniqueByteArrays(salts);
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
    (sdkAny.GpassClient as
    | (new (...args: unknown[]) => unknown)
    | undefined);

  if (typeof AccessClientCtor !== "function") {
    throw new Error(
      "Installed SDK does not export GrapeAccessClient/GpassClient. Please update @grapenpm/grape-access-sdk."
    );
  }

  if (!readOnly && (!wallet?.publicKey || !wallet.signTransaction)) {
    throw new Error("Connected wallet does not support transaction signing.");
  }

  const fallbackPublicKey = wallet?.publicKey ?? Keypair.generate().publicKey;
  const signTransaction =
    wallet?.signTransaction ??
    (async (transaction: Transaction) => transaction);
  const signAllTransactions =
    wallet?.signAllTransactions ??
    (async (transactions: Transaction[]) => Promise.all(transactions.map((tx) => signTransaction(tx))));

  const anchorWallet: AnchorCompatibleWallet = {
    publicKey: fallbackPublicKey,
    signTransaction,
    signAllTransactions
  };

  const provider = new AnchorProvider(connection, anchorWallet as any, {
    commitment: "confirmed"
  });

  return new AccessClientCtor(provider, GPASS_PROGRAM_ID);
}

async function executeSdkMethod({
  action,
  params,
  connection,
  wallet
}: {
  action: "create" | "check";
  params: unknown;
  connection: Connection;
  wallet: WalletProvider;
}) {
  const client = await resolveSdkClient(connection, wallet);
  const clientAny = client as Record<string, unknown>;
  const methodNames =
    action === "create"
      ? ["initializeAccess", "initializeGate"]
      : ["checkAccess", "checkGate"];
  const method = methodNames
    .map((name) => clientAny[name] as ((arg: unknown) => unknown) | undefined)
    .find((candidate) => typeof candidate === "function");

  if (!method) {
    throw new Error(
      `SDK client is missing ${methodNames.join(" / ")}. Please verify @grapenpm/grape-access-sdk version.`
    );
  }

  return await Promise.resolve(method.call(client, params));
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

function buildMetadataCriteriaSummary(form: CreateFormState): string[] {
  const selectedPlatformLabels =
    form.selectedPlatforms.length > 0
      ? form.selectedPlatforms.map((platform) => PLATFORM_LABELS[platform] ?? `Platform ${platform}`).join(", ")
      : "any";
  switch (form.criteriaKind) {
    case "combined":
      return [
        `Minimum reputation: ${form.minPoints} (season ${form.season})`,
        `Verification platforms: ${selectedPlatformLabels}`,
        form.requireWalletLink ? "Wallet link required" : "Wallet link optional"
      ];
    case "minReputation":
      return [`Minimum reputation: ${form.minPoints} (season ${form.season})`];
    case "verifiedIdentity":
    case "verifiedWithWallet":
      return [`Verification platforms: ${selectedPlatformLabels}`];
    case "timeLockedReputation":
      return [
        `Minimum reputation: ${form.minPoints} (season ${form.season})`,
        `Minimum hold: ${form.minHoldDurationSeconds} seconds`
      ];
    case "multiDao":
      return [
        `Required access spaces: ${splitCsv(form.requiredGates).length}`,
        form.requireAll ? "Must pass all configured spaces" : "Pass any configured space"
      ];
    case "tokenHolding":
      return [`Minimum token amount: ${form.minAmount}`, form.checkAta ? "ATA enforced" : "Custom token account allowed"];
    case "nftCollection":
      return [`Minimum NFTs: ${form.minCount}`];
    case "customProgram":
      return [`Custom program: ${form.programId || "not set"}`];
    default:
      return [];
  }
}

function buildAccessMetadataManifest(form: CreateFormState) {
  const eligibilitySummary = buildMetadataCriteriaSummary(form).join(". ");
  const discordEnabled = Boolean(form.metadataDiscordGuildId || form.metadataDiscordPassRoleId);
  const telegramEnabled = Boolean(form.metadataTelegramChatId || form.metadataTelegramPassEntitlement);

  return {
    schema: "grape.access-manifest.v1",
    generatedAt: new Date().toISOString(),
    gateId: form.gateId || null,
    accessId: form.gateId || null,
    branding: {
      name: form.metadataName || null,
      subtitle: form.metadataSubtitle || null,
      description: form.metadataDescription || null,
      logo: form.metadataLogoUri || null,
      banner: form.metadataBannerUri || null,
      themeColor: form.metadataAccent || null,
      accent: form.metadataAccent || null,
      supportLabel: form.metadataSupportLabel || null,
      supportUrl: form.metadataSupportUrl || null
    },
    eligibility: {
      criteriaKind: form.criteriaKind,
      accessTypeKind: form.gateTypeKind,
      summary: eligibilitySummary
    },
    integrations: {
      discord: discordEnabled
        ? {
            guildId: form.metadataDiscordGuildId || null,
            passRoleId: form.metadataDiscordPassRoleId || null,
            failAction: form.metadataDiscordFailAction || "remove_role"
          }
        : null,
      telegram: telegramEnabled
        ? {
            chatId: form.metadataTelegramChatId || null,
            passEntitlement: form.metadataTelegramPassEntitlement || "member"
          }
        : null
    },
    revalidation: {
      intervalSeconds: Number.parseInt(form.metadataRevalidationIntervalSeconds, 10) || 3600,
      leaseSeconds: Number.parseInt(form.metadataRevalidationLeaseSeconds, 10) || 86400
    },
    links: {
      verifyUrl: form.metadataVerifyUrl || null
    }
  };
}

function resolveIrysNetwork(cluster: ClusterKind) {
  return cluster === "mainnet-beta" ? "mainnet" : "devnet";
}

function resolveMetadataHttpUri(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("irys://")) {
    const id = trimmed.slice("irys://".length).trim();
    return id ? `https://uploader.irys.xyz/${id}` : "";
  }
  return trimmed;
}

function pickPreferredIrysUri(input: {
  uri?: string;
  uploaderUrl?: string;
  gatewayUrl?: string;
  irysUri?: string;
}) {
  const candidates = [input.uri, input.uploaderUrl, input.gatewayUrl, input.irysUri];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = resolveMetadataHttpUri(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

interface IrysPaymentRequirement {
  recipient: string;
  requiredLamports: number;
  requiredSol?: string;
  network?: "mainnet" | "devnet" | string;
}

interface IrysUploadApiResponse {
  uri?: string;
  uploaderUrl?: string;
  gatewayUrl?: string;
  irysUri?: string;
  id?: string;
  error?: string;
  paymentRequired?: IrysPaymentRequirement;
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

function explorerLink(signature: string, cluster: ClusterKind) {
  const base = `https://explorer.solana.com/tx/${signature}`;
  if (cluster === "mainnet-beta") {
    return base;
  }
  if (cluster === "custom") {
    return `${base}?cluster=custom`;
  }
  return `${base}?cluster=${cluster}`;
}

function explorerAddressLink(address: string, cluster: ClusterKind) {
  const base = `https://explorer.solana.com/address/${address}`;
  if (cluster === "mainnet-beta") {
    return base;
  }
  if (cluster === "custom") {
    return `${base}?cluster=custom`;
  }
  return `${base}?cluster=${cluster}`;
}

function formatCheckedAt(checkedAt: number): string {
  if (!Number.isFinite(checkedAt) || checkedAt <= 0) {
    return "n/a";
  }
  const date = new Date(checkedAt * 1000);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleString();
}

export default function Page() {
  const wallet = useWallet();
  const [tab, setTab] = useState(0);
  const [createStep, setCreateStep] = useState(0);
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [editorMode, setEditorMode] = useState<GateEditorMode>("create");
  const [editorTargetGateId, setEditorTargetGateId] = useState("");

  const [cluster, setCluster] = useState<ClusterKind>(DEFAULT_CLUSTER);
  const [customRpc, setCustomRpc] = useState("");
  const [checkAccessMode, setCheckAccessMode] = useState<AccessCheckMode>("simple");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [createForm, setCreateForm] = useState<CreateFormState>({
    ...defaultCreateForm,
    ...templates[0].defaults,
    criteriaKind: templates[0].criteriaKind,
    gateTypeKind: templates[0].gateTypeKind
  });
  const [checkForm, setCheckForm] = useState<CheckFormState>(defaultCheckForm);
  const [checkDerive, setCheckDerive] = useState<CheckDeriveState>(defaultCheckDeriveState);
  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberForm);
  const [memberCheck, setMemberCheck] = useState<MemberCheckState>({
    status: "idle",
    message: "Connect your wallet and run a gate check."
  });
  const [memberDerive, setMemberDerive] = useState<MemberDeriveState>({
    status: "idle",
    message: "Use auto-derive to populate required accounts for your gate."
  });
  const [adminForm, setAdminForm] = useState<AdminFormState>(defaultAdminForm);
  const [adminGates, setAdminGates] = useState<AdminGateItem[]>([]);
  const [adminGateUsers, setAdminGateUsers] = useState<AdminGateUserItem[]>([]);
  const [adminGateUsersStatus, setAdminGateUsersStatus] = useState("No users loaded yet.");
  const [adminGateDetails, setAdminGateDetails] = useState<Record<string, unknown> | null>(null);

  const [createBusy, setCreateBusy] = useState(false);
  const [metadataUploadBusy, setMetadataUploadBusy] = useState(false);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [bannerUploadBusy, setBannerUploadBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkDeriveBusy, setCheckDeriveBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberDeriveBusy, setMemberDeriveBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState<AdminBusyAction>("");
  const [adminConfirmAction, setAdminConfirmAction] = useState<AdminConfirmAction>("");
  const [adminRpcProbeSlot, setAdminRpcProbeSlot] = useState<number | null>(null);
  const [adminLoadStatus, setAdminLoadStatus] = useState("Ready");

  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info">(
    "info"
  );
  const checkDeriveAutoKeyRef = useRef("");
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.Buffer) {
      window.Buffer = Buffer;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const persistedCheckAccessMode = window.localStorage.getItem("grape_access_check_mode");
    if (persistedCheckAccessMode === "simple" || persistedCheckAccessMode === "advanced") {
      setCheckAccessMode(persistedCheckAccessMode);
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
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("grape_access_check_mode", checkAccessMode);
  }, [checkAccessMode]);

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

  useEffect(() => {
    const connectedPublicKey = wallet.publicKey;
    if (!connectedPublicKey) {
      return;
    }

    setAdminForm((prev) =>
      prev.authorityFilter ? prev : { ...prev, authorityFilter: connectedPublicKey.toBase58() }
    );
  }, [wallet.publicKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const clusterFromQuery = searchParams.get("cluster")?.trim();
    if (
      clusterFromQuery === "devnet" ||
      clusterFromQuery === "testnet" ||
      clusterFromQuery === "mainnet-beta" ||
      clusterFromQuery === "custom"
    ) {
      setCluster(clusterFromQuery);
    }
    const rpcFromQuery = searchParams.get("rpc")?.trim();
    if (rpcFromQuery) {
      setCustomRpc(rpcFromQuery);
    }

    const tabFromQuery = searchParams.get("tab")?.trim().toLowerCase();
    if (tabFromQuery === "admin") {
      setTab(3);
    } else if (tabFromQuery === "member") {
      setTab(1);
    } else if (tabFromQuery === "check") {
      setTab(2);
    } else if (tabFromQuery === "create") {
      setTab(0);
    }

    const adminGateFromQuery = searchParams.get("adminGate")?.trim() ?? "";
    if (adminGateFromQuery) {
      try {
        const normalizedGate = new PublicKey(adminGateFromQuery).toBase58();
        setTab(3);
        setAdminForm((prev) => ({ ...prev, selectedGateId: normalizedGate }));
        return;
      } catch {
        // Ignore malformed adminGate query param.
      }
    }

    const gateIdFromQuery = searchParams.get("gateId")?.trim() ?? "";
    if (!gateIdFromQuery) {
      return;
    }
    try {
      new PublicKey(gateIdFromQuery);
    } catch {
      return;
    }

    const accessUrl = new URL(window.location.origin + "/access");
    accessUrl.searchParams.set("gateId", gateIdFromQuery);
    if (clusterFromQuery) {
      accessUrl.searchParams.set("cluster", clusterFromQuery);
    }
    if (rpcFromQuery) {
      accessUrl.searchParams.set("rpc", rpcFromQuery);
    }
    window.location.replace(accessUrl.toString());
  }, []);

  const rpcEndpoint = useMemo(() => {
    if (cluster === "custom") {
      return customRpc.trim();
    }
    if (cluster === "mainnet-beta") {
      return SHYFT_MAINNET_RPC;
    }
    return clusterApiUrl(cluster);
  }, [cluster, customRpc]);

  const rpcDisplayLabel = useMemo(() => {
    if (cluster === "custom") {
      return customRpc.trim() ? "Custom RPC configured" : "Custom RPC not set";
    }
    if (cluster === "mainnet-beta") {
      return "Shyft (preferred, hidden)";
    }
    if (cluster === "testnet") {
      return "Solana Testnet Public RPC";
    }
    return "Solana Devnet Public RPC";
  }, [cluster, customRpc]);

  const connection = useMemo(() => {
    if (!rpcEndpoint) {
      return null;
    }
    return new Connection(rpcEndpoint, "confirmed");
  }, [rpcEndpoint]);

  const isWalletConnected = Boolean(wallet.connected && wallet.publicKey);
  const connectedWalletAddress = wallet.publicKey?.toBase58() ?? "";
  const isAdminWalletConnected =
    isWalletConnected && connectedWalletAddress === GPASS_ADMIN_WALLET;
  const selectedAdminGate = useMemo(
    () => adminGates.find((gate) => gate.gateId === adminForm.selectedGateId),
    [adminGates, adminForm.selectedGateId]
  );
  const selectedGateAuthority = useMemo(() => {
    if (selectedAdminGate?.authority) {
      return selectedAdminGate.authority;
    }
    if (adminGateDetails) {
      const authorityFromDetails = readAuthorityString(
        (adminGateDetails as Record<string, unknown>).authority
      );
      if (authorityFromDetails) {
        return authorityFromDetails;
      }
    }
    return "";
  }, [selectedAdminGate, adminGateDetails]);
  const isSelectedGateAuthority = Boolean(
    connectedWalletAddress && selectedGateAuthority && selectedGateAuthority === connectedWalletAddress
  );
  const canAttemptSelectedGateWrite = Boolean(
    isWalletConnected &&
      adminForm.selectedGateId.trim() &&
      (!selectedGateAuthority || selectedGateAuthority === connectedWalletAddress)
  );
  const selectedGatePassRate = useMemo(() => {
    if (!selectedAdminGate) {
      return null;
    }
    if (!selectedAdminGate.hasKnownStats) {
      return "Unknown";
    }
    const total = Number.parseInt(selectedAdminGate.totalChecks, 10);
    const passed = Number.parseInt(selectedAdminGate.successfulChecks, 10);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(passed) || passed < 0) {
      return "0%";
    }
    return `${Math.round((passed / total) * 100)}%`;
  }, [selectedAdminGate]);
  const isAdvancedCheckMode = checkAccessMode === "advanced";
  const isEditMode = editorMode === "edit";
  const editorGateId = editorTargetGateId || adminForm.selectedGateId.trim();

  const programCards = useMemo(
    () => [
      { label: "Grape Access Program", value: GPASS_PROGRAM_ID.toBase58() },
      {
        label: "OG Reputation Program",
        value: VINE_REPUTATION_PROGRAM_ID.toBase58()
      },
      {
        label: "Grape Verification Program",
        value: GRAPE_VERIFICATION_PROGRAM_ID.toBase58()
      }
    ],
    []
  );

  const createPreview = useMemo(
    () => ({
      gateId: createForm.gateId,
      authority: createForm.authority || "wallet.publicKey",
      metadataUri: createForm.metadataUri || undefined,
      criteria: {
        type: createForm.criteriaKind,
        vineConfig: createForm.vineConfig,
        minPoints: createForm.minPoints,
        season: createForm.season,
        grapeSpace: createForm.grapeSpace,
        platforms: createForm.selectedPlatforms,
        requireWalletLink: createForm.requireWalletLink,
        minHoldDurationSeconds: createForm.minHoldDurationSeconds,
        requiredGates: splitCsv(createForm.requiredGates),
        requireAll: createForm.requireAll,
        mint: createForm.mint,
        minAmount: createForm.minAmount,
        checkAta: createForm.checkAta,
        collectionMint: createForm.collectionMint,
        minCount: createForm.minCount,
        programId: createForm.programId,
        instructionDataHex: createForm.instructionDataHex
      },
      gateType: {
        type: createForm.gateTypeKind,
        durationSeconds: createForm.durationSeconds,
        intervalSeconds: createForm.intervalSeconds
      },
      metadataManifest:
        createForm.metadataName ||
        createForm.metadataSubtitle ||
        createForm.metadataDescription ||
        createForm.metadataLogoUri ||
        createForm.metadataBannerUri ||
        createForm.metadataSupportLabel ||
        createForm.metadataSupportUrl ||
        createForm.metadataDiscordGuildId ||
        createForm.metadataDiscordPassRoleId ||
        createForm.metadataTelegramChatId ||
        createForm.metadataVerifyUrl
          ? buildAccessMetadataManifest(createForm)
          : undefined
    }),
    [createForm]
  );

  const createMetadataManifestPreview = useMemo(
    () =>
      buildAccessMetadataManifest(createForm),
    [createForm]
  );

  const hasMetadataManifestDraft = useMemo(
    () =>
      Boolean(
        createForm.metadataName ||
          createForm.metadataSubtitle ||
        createForm.metadataDescription ||
        createForm.metadataLogoUri ||
        createForm.metadataBannerUri ||
        createForm.metadataSupportLabel ||
        createForm.metadataSupportUrl ||
        createForm.metadataDiscordGuildId ||
        createForm.metadataDiscordPassRoleId ||
        createForm.metadataTelegramChatId ||
        createForm.metadataVerifyUrl
      ),
    [createForm]
  );
  const gateBuilderPreview = useMemo(() => {
    if (!isEditMode) {
      return createPreview;
    }
    return {
      mode: "edit",
      targetGateId: editorGateId || "(not set)",
      action: "updateGateCriteria",
      criteria: createPreview.criteria
    };
  }, [isEditMode, editorGateId, createPreview]);

  const checkPreview = useMemo(
    () => ({
      gateId: checkForm.gateId,
      user: checkForm.user,
      reputationAccount: checkForm.reputationAccount || undefined,
      identityAccount: checkForm.identityAccount || undefined,
      linkAccount: checkForm.linkAccount || undefined,
      tokenAccount: checkForm.tokenAccount || undefined,
      storeRecord: checkForm.storeRecord
    }),
    [checkForm]
  );

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

  const selectedGateShareLink = useMemo(() => {
    const gateId = adminForm.selectedGateId.trim();
    if (!gateId || typeof window === "undefined") {
      return "";
    }

    try {
      parsePublicKey("Gate ID", gateId, true);
    } catch {
      return "";
    }

    const url = new URL(window.location.origin + "/access");
    url.searchParams.set("gateId", gateId);
    url.searchParams.set("cluster", cluster);
    if (cluster === "custom" && customRpc.trim()) {
      url.searchParams.set("rpc", customRpc.trim());
    }
    return url.toString();
  }, [adminForm.selectedGateId, cluster, customRpc]);

  const notify = (message: string, severity: "success" | "error" | "info") => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const updateCreateForm = <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCheckForm = <K extends keyof CheckFormState>(key: K, value: CheckFormState[K]) => {
    setCheckForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateMemberForm = <K extends keyof MemberFormState>(
    key: K,
    value: MemberFormState[K]
  ) => {
    setMemberForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateAdminForm = <K extends keyof AdminFormState>(
    key: K,
    value: AdminFormState[K]
  ) => {
    setAdminForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    setAdminGateUsers([]);
    setAdminGateUsersStatus("No users loaded yet.");
  }, [adminForm.selectedGateId]);

  const appendActivity = (entry: { label: string; message: string; signature?: string }) => {
    setActivity((prev) => [{ ...entry, createdAt: Date.now() }, ...prev]);
  };

  const getAdminClient = async ({ readOnly = false }: { readOnly?: boolean } = {}) => {
    if (!connection) {
      throw new Error("Choose a valid RPC endpoint first.");
    }
    if (!readOnly && !wallet.publicKey) {
      throw new Error("Connect wallet before running admin write actions.");
    }

    return (await resolveSdkClient(connection, wallet as unknown as WalletProvider, {
      readOnly
    })) as Record<string, unknown>;
  };

  const getMemberClient = async () => {
    if (!wallet.publicKey || !connection) {
      throw new Error("Connect wallet and choose a valid RPC endpoint first.");
    }

    return (await resolveSdkClient(connection, wallet as unknown as WalletProvider)) as Record<
      string,
      unknown
    >;
  };

  const fetchGateRecordById = async (gateId: PublicKey): Promise<Record<string, unknown> | null> => {
    const client = await getAdminClient({ readOnly: true });
    const [gatePda] = await findPrimaryAccessPda(gateId, GPASS_PROGRAM_ID);
    const fetchGateMethod = getSdkClientMethod<((input: PublicKey) => Promise<unknown>)>(client, [
      "fetchAccess",
      "fetchGate"
    ]);

    let gate: unknown = null;
    if (typeof fetchGateMethod === "function") {
      try {
        gate = await fetchGateMethod.call(client, gateId);
      } catch {
        gate = null;
      }
    }

    if (!gate) {
      if (connection) {
        try {
          const rawMatches = await connection.getProgramAccounts(GPASS_PROGRAM_ID, {
            filters: [{ memcmp: { offset: 9, bytes: gateId.toBase58() } }]
          });
          const decodedRaw = rawMatches
            .map((entry) => decodeAccessLikeAccountData(entry.account.data))
            .find((entry) => Boolean(entry));
          if (decodedRaw) {
            gate = decodedRaw;
          }
        } catch {
          // Ignore raw fallback failures.
        }
      }
    }

    if (!gate) {
      const clientAny = client as Record<string, unknown>;
      const gateAccountClient =
        (clientAny.program as Record<string, unknown> | undefined)?.account &&
        (((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).Access ??
          ((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).access ??
          ((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).Gate ??
          ((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).gate);
      const fetchNullable =
        (gateAccountClient as Record<string, unknown> | undefined)?.fetchNullable as
          | ((address: PublicKey) => Promise<unknown>)
          | undefined;
      const fetchStrict =
        (gateAccountClient as Record<string, unknown> | undefined)?.fetch as
          | ((address: PublicKey) => Promise<unknown>)
          | undefined;
      try {
        if (typeof fetchNullable === "function") {
          gate = await fetchNullable.call(gateAccountClient, gatePda);
        } else if (typeof fetchStrict === "function") {
          gate = await fetchStrict.call(gateAccountClient, gatePda);
        }
      } catch {
        gate = null;
      }
    }

    if (!gate || typeof gate !== "object") {
      return null;
    }
    return gate as Record<string, unknown>;
  };

  const setMemberGateId = (value: string) => {
    updateMemberForm("gateId", value);
    if (typeof window === "undefined") {
      return;
    }

    const nextGateId = value.trim();
    const nextUrl = new URL(window.location.href);
    if (nextGateId) {
      nextUrl.searchParams.set("gateId", nextGateId);
    } else {
      nextUrl.searchParams.delete("gateId");
    }
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  const buildMemberGateLink = (gateIdRaw: string) => {
    const gateId = gateIdRaw.trim();
    if (!gateId) {
      return "";
    }
    parsePublicKey("Gate ID", gateId, true);
    if (typeof window === "undefined") {
      return "";
    }
    const url = new URL(window.location.origin + "/access");
    url.searchParams.set("gateId", gateId);
    url.searchParams.set("cluster", cluster);
    if (cluster === "custom" && customRpc.trim()) {
      url.searchParams.set("rpc", customRpc.trim());
    }
    return url.toString();
  };

  const copyMemberShareLinkForGate = async (gateIdRaw: string) => {
    try {
      const link = buildMemberGateLink(gateIdRaw);
      if (!link) {
        throw new Error("Gate ID is required before copying a share link.");
      }
      await navigator.clipboard.writeText(link);
      notify("Share link copied.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to copy share link.", "error");
    }
  };

  const openMemberPortalForGate = (gateIdRaw: string) => {
    try {
      const gateId = parsePublicKey("Gate ID", gateIdRaw, true)!.toBase58();
      const accessLink = buildMemberGateLink(gateId);
      if (!accessLink) {
        throw new Error("Unable to build user page link.");
      }
      window.open(accessLink, "_blank", "noopener,noreferrer");
      notify("Opened standalone user page.", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Invalid gate ID.", "error");
    }
  };

  const copyMemberShareLink = async () => {
    await copyMemberShareLinkForGate(memberForm.gateId);
  };

  const handleAutoDeriveCheckAccounts = async (
    { silent = false }: { silent?: boolean } = {}
  ): Promise<CheckFormState | null> => {
    if (!connection) {
      const message = "Choose a valid RPC endpoint first.";
      setCheckDerive({ status: "error", message });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    }

    const gateIdRaw = checkForm.gateId.trim();
    if (!gateIdRaw) {
      const message = "Gate ID is required before auto-deriving check accounts.";
      setCheckDerive({ status: "error", message });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    }

    let gateId: PublicKey;
    let user: PublicKey;
    try {
      gateId = parsePublicKey("Gate ID", gateIdRaw, true)!;
      user = parsePublicKey("User Public Key", checkForm.user, true)!;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gate ID/User Public Key is invalid.";
      setCheckDerive({ status: "error", message });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    }

    setCheckDeriveBusy(true);
    try {
      const gateObj = await fetchGateRecordById(gateId);
      if (!gateObj) {
        throw new Error("Gate not found for this gate ID.");
      }

      const criteriaVariant = extractCriteriaVariant(gateObj.criteria);
      if (!criteriaVariant) {
        throw new Error("Could not read gate criteria for auto-derivation.");
      }

      const updates: Partial<CheckFormState> = {};
      const notes: string[] = [];
      const blockers: string[] = [];
      const addBlocker = (message: string) => {
        if (!blockers.includes(message)) {
          blockers.push(message);
        }
      };
      let derivedCount = 0;
      let selectedIdentity = asPublicKeyValue(checkForm.identityAccount);
      let selectedLink = asPublicKeyValue(checkForm.linkAccount);

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

      if (requiresReputation) {
        const vineConfig = asPublicKeyValue(criteriaVariant.config.vineConfig);
        const season = asNumberValue(criteriaVariant.config.season);
        if (vineConfig && season !== undefined) {
          const [reputationPda] = VineReputationClient.getReputationPda(
            vineConfig,
            user,
            season,
            VINE_REPUTATION_PROGRAM_ID
          );
          const nextReputation = reputationPda.toBase58();
          updates.reputationAccount = nextReputation;
          if (nextReputation !== checkForm.reputationAccount.trim()) {
            derivedCount += 1;
          }
        } else {
          notes.push("Could not derive reputation account from gate criteria.");
        }
      }

      if (requiresIdentity) {
        const grapeSpaceInput = asPublicKeyValue(criteriaVariant.config.grapeSpace);
        const resolvedVerificationSpace = grapeSpaceInput
          ? await resolveVerificationSpaceContext(connection, grapeSpaceInput)
          : null;
        const grapeSpace = resolvedVerificationSpace?.space ?? grapeSpaceInput;
        const verificationSpaceSaltCandidates = resolvedVerificationSpace?.saltCandidates ?? [];
        const platforms = normalizePlatforms(criteriaVariant.config.platforms);
        const nowUnix = Math.floor(Date.now() / 1000);

        if (selectedIdentity && grapeSpace) {
          const selectedIdentityIssue = await validateExistingIdentityForGate({
            connection,
            identity: selectedIdentity,
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

        if (grapeSpace) {
          const linked = await getLinkedIdentityForUser({
            connection,
            user,
            grapeSpace,
            verificationSpaceSaltCandidates,
            allowedPlatforms: platforms,
            nowUnix
          });
          if (linked) {
            if (
              !selectedIdentity ||
              !selectedIdentity.equals(linked.identity) ||
              !selectedLink ||
              !selectedLink.equals(linked.link)
            ) {
              notes.push("Resolved identity and wallet link from verification registry.");
            }
            selectedIdentity = linked.identity;
            selectedLink = linked.link;
          }
        }

        if (selectedIdentity) {
          const nextIdentity = selectedIdentity.toBase58();
          updates.identityAccount = nextIdentity;
          if (nextIdentity !== checkForm.identityAccount.trim()) {
            derivedCount += 1;
          }
        } else {
          addBlocker("Could not auto-resolve identity account for this user wallet.");
        }

        if (requiresLink) {
          if (selectedLink) {
            if (selectedIdentity) {
              const selectedLinkIssue = await validateExistingLinkForUser({
                connection,
                link: selectedLink,
                identity: selectedIdentity,
                user,
                verificationSpaceSaltCandidates
              });
              if (selectedLinkIssue) {
                selectedLink = undefined;
                notes.push("Existing link account does not match selected identity/user; attempting re-derive.");
              }
            }
          } else if (!selectedIdentity) {
            addBlocker("Wallet link is required but identity account is missing.");
          }

          if (!selectedLink && selectedIdentity) {
            selectedLink = await deriveRequiredLinkForUser({
              connection,
              identity: selectedIdentity,
              user,
              verificationSpaceSaltCandidates
            });
          }

          if (selectedLink) {
            const nextLink = selectedLink.toBase58();
            updates.linkAccount = nextLink;
            if (nextLink !== checkForm.linkAccount.trim()) {
              derivedCount += 1;
            }
          } else if (selectedIdentity) {
            addBlocker("Could not auto-resolve link account for this user wallet.");
          }
        }
      }

      if (criteriaVariant.type === "tokenHolding") {
        const mint = asPublicKeyValue(criteriaVariant.config.mint);
        const checkAta = criteriaVariant.config.checkAta !== false;
        if (mint && checkAta) {
          const nextTokenAccount = deriveAtaAddress(mint, user).toBase58();
          updates.tokenAccount = nextTokenAccount;
          if (nextTokenAccount !== checkForm.tokenAccount.trim()) {
            derivedCount += 1;
          }
        } else if (!checkAta) {
          notes.push("Gate expects a custom token account (ATA check disabled).");
        } else {
          notes.push("Could not derive token ATA from gate criteria.");
        }
      }

      const resolvedReputation = asPublicKeyValue(updates.reputationAccount ?? checkForm.reputationAccount);
      const resolvedIdentity = asPublicKeyValue(updates.identityAccount ?? checkForm.identityAccount);
      const resolvedLink = asPublicKeyValue(updates.linkAccount ?? checkForm.linkAccount);

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

      setCheckForm((prev) => ({ ...prev, ...updates }));
      const mergedForm = { ...checkForm, ...updates };
      if (blockers.length > 0) {
        const message = `${blockers.join(" ")}${notes.length ? ` ${notes.join(" ")}` : ""}`;
        setCheckDerive({ status: "error", message });
        if (!silent) {
          notify(message, "error");
        }
        return null;
      }

      const message =
        derivedCount > 0
          ? `Auto-derived ${derivedCount} account(s).${notes.length ? ` ${notes.join(" ")}` : ""}`
          : notes.length
            ? notes.join(" ")
            : "Check accounts are already populated.";
      setCheckDerive({ status: "success", message });
      if (!silent && derivedCount > 0) {
        notify(message, "success");
      }
      return mergedForm;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to auto-derive check accounts.";
      setCheckDerive({ status: "error", message });
      if (!silent) {
        notify(message, "error");
      }
      return null;
    } finally {
      setCheckDeriveBusy(false);
    }
  };

  useEffect(() => {
    if (!checkForm.gateId.trim() || !checkForm.user.trim()) {
      checkDeriveAutoKeyRef.current = "";
      setCheckDerive(defaultCheckDeriveState);
    }
  }, [checkForm.gateId, checkForm.user]);

  useEffect(() => {
    if (!connection || checkBusy || checkDeriveBusy) {
      return;
    }
    const gateIdRaw = checkForm.gateId.trim();
    const userRaw = checkForm.user.trim();
    if (!gateIdRaw || !userRaw) {
      return;
    }
    try {
      const normalizedGate = new PublicKey(gateIdRaw).toBase58();
      const normalizedUser = new PublicKey(userRaw).toBase58();
      const nextKey = `${normalizedGate}:${normalizedUser}:${rpcEndpoint}`;
      if (checkDeriveAutoKeyRef.current === nextKey) {
        return;
      }
      checkDeriveAutoKeyRef.current = nextKey;
      void handleAutoDeriveCheckAccounts({ silent: true });
    } catch {
      // Ignore invalid pubkeys while user is still typing.
    }
  }, [checkForm.gateId, checkForm.user, connection, rpcEndpoint, checkBusy, checkDeriveBusy]);

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
      const gateId = parsePublicKey("Gate ID", gateIdRaw, true)!;
      const client = await getMemberClient();
      const [gatePda] = await findPrimaryAccessPda(gateId, GPASS_PROGRAM_ID);
      const fetchGateMethod = getSdkClientMethod<((input: PublicKey) => Promise<unknown>)>(client, [
        "fetchAccess",
        "fetchGate"
      ]);
      let gate: unknown = null;
      let sdkFetchError: Error | undefined;
      if (typeof fetchGateMethod === "function") {
        try {
          gate = await fetchGateMethod.call(client, gateId);
        } catch (error) {
          sdkFetchError = error instanceof Error ? error : new Error("Unknown SDK fetch access error.");
        }
      }
      if (!gate) {
        const clientAny = client as Record<string, unknown>;
        const gateAccountClient =
          (clientAny.program as Record<string, unknown> | undefined)?.account &&
          (((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).Access ??
            ((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).access ??
            ((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).Gate ??
            ((clientAny.program as Record<string, unknown>).account as Record<string, unknown>).gate);
        const fetchNullable =
          (gateAccountClient as Record<string, unknown> | undefined)?.fetchNullable as
            | ((address: PublicKey) => Promise<unknown>)
            | undefined;
        const fetchStrict =
          (gateAccountClient as Record<string, unknown> | undefined)?.fetch as
            | ((address: PublicKey) => Promise<unknown>)
            | undefined;
        try {
          if (typeof fetchNullable === "function") {
            gate = await fetchNullable.call(gateAccountClient, gatePda);
          } else if (typeof fetchStrict === "function") {
            gate = await fetchStrict.call(gateAccountClient, gatePda);
          }
        } catch (error) {
          if (!sdkFetchError) {
            sdkFetchError =
              error instanceof Error ? error : new Error("Unknown Gate account fetch error.");
          }
        }
      }
      if (!gate || typeof gate !== "object") {
        throw new Error(
          `Gate not found for this gate ID.${sdkFetchError ? ` SDK detail: ${sdkFetchError.message}` : ""}`
        );
      }

      const gateObj = gate as Record<string, unknown>;
      const criteriaVariant = extractCriteriaVariant(gateObj.criteria);
      if (!criteriaVariant) {
        throw new Error("Could not read gate criteria for auto-derivation.");
      }

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
        const verificationSpaceSaltCandidates = resolvedVerificationSpace?.saltCandidates ?? [];
        const platforms = normalizePlatforms(criteriaVariant.config.platforms);
        const nowUnix = Math.floor(Date.now() / 1000);
        if (!selectedIdentity && !selectedLink && grapeSpace && verificationSpaceSaltCandidates.length > 0) {
          const walletHashes = uniqueByteArrays(
            verificationSpaceSaltCandidates.map((spaceSalt) =>
              GrapeVerificationRegistry.walletHash(spaceSalt, wallet.publicKey!)
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
          const identityValue = memberForm.identityValue.trim();
          if (grapeSpace && identityValue) {
            const platformCandidates = platforms.length > 0 ? platforms : [0];

            let fallbackIdentity: PublicKey | undefined;
            if (verificationSpaceSaltCandidates.length > 0) {
              for (const verificationSpaceSalt of verificationSpaceSaltCandidates) {
                for (const platformSeed of platformCandidates) {
                  const tag = PLATFORM_TAGS[platformSeed];
                  if (!tag) {
                    continue;
                  }
                  const idHash = GrapeVerificationRegistry.identityHash(
                    verificationSpaceSalt,
                    tag,
                    identityValue
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
            }

            if (!selectedIdentity) {
              const idHash = await sha256Text(identityValue);
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
            if (verificationSpaceSaltCandidates.length > 0) {
              const registryWalletHashes = uniqueByteArrays(
                verificationSpaceSaltCandidates.map((spaceSalt) =>
                  GrapeVerificationRegistry.walletHash(spaceSalt, wallet.publicKey!)
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
              if (!Buffer.from(secondHash).equals(Buffer.from(firstHash))) {
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

  const applyTemplate = (nextTemplateId: string) => {
    const template = templates.find((item) => item.id === nextTemplateId);
    if (!template) {
      return;
    }

    setTemplateId(nextTemplateId);
    setCreateForm((prev) => ({
      ...prev,
      ...template.defaults,
      criteriaKind: template.criteriaKind,
      gateTypeKind: template.gateTypeKind
    }));
  };

  const generateGateId = () => {
    const generatedGateId = Keypair.generate().publicKey.toBase58();
    updateCreateForm("gateId", generatedGateId);
    setEditorMode("create");
    setEditorTargetGateId("");
    notify("Generated a new Gate ID.", "success");
  };

  const switchEditorToCreateMode = () => {
    const previousTargetGateId = editorTargetGateId;
    setEditorMode("create");
    setEditorTargetGateId("");
    setCreateForm((prev) => ({
      ...prev,
      gateId:
        previousTargetGateId && prev.gateId.trim() === previousTargetGateId
          ? ""
          : prev.gateId
    }));
    notify("Gate Builder switched to create mode.", "info");
  };

  const submitIrysPayment = async (paymentRequired: IrysPaymentRequirement) => {
    if (!connection || !wallet.publicKey) {
      throw new Error("Connect wallet before paying Irys upload fee.");
    }
    if (typeof wallet.sendTransaction !== "function") {
      throw new Error("Connected wallet does not support sendTransaction for Irys payment.");
    }
    const recipient = parsePublicKey("Irys recipient", paymentRequired.recipient, true)!;
    const lamports = Number(paymentRequired.requiredLamports);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error("Invalid Irys payment quote.");
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: recipient,
        lamports: Math.ceil(lamports)
      })
    );

    const signature = await wallet.sendTransaction(tx, connection, {
      skipPreflight: false
    });
    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  };

  const handleUploadMetadataToIrys = async () => {
    const payload = buildAccessMetadataManifest(createForm);
    setMetadataUploadBusy(true);
    try {
      const requestPayload = {
        payload,
        network: resolveIrysNetwork(cluster),
        filename:
          createForm.gateId.trim() !== ""
            ? `grape-access-${createForm.gateId.trim()}.json`
            : "grape-access-metadata.json"
      };

      const initialResponse = await fetch("/api/irys/upload-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

      let response = initialResponse;
      let body = (await response.json().catch(() => ({}))) as IrysUploadApiResponse;

      if (response.status === 402 && body.paymentRequired) {
        const paymentSignature = await submitIrysPayment(body.paymentRequired);
        response = await fetch("/api/irys/upload-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...requestPayload,
            payerPublicKey: wallet.publicKey?.toBase58() ?? "",
            paymentSignature
          })
        });
        body = (await response.json().catch(() => ({}))) as IrysUploadApiResponse;
      }

      if (!response.ok || !pickPreferredIrysUri(body)) {
        throw new Error(body.error || "Failed to upload metadata JSON to Irys.");
      }

      const uploadedMetadataUri = pickPreferredIrysUri(body);
      if (!uploadedMetadataUri) {
        throw new Error("Irys upload succeeded but no URI was returned.");
      }
      updateCreateForm("metadataUri", uploadedMetadataUri);
      appendActivity({
        label: "Upload Metadata",
        message: `Metadata uploaded to Irys (${body.id ?? "ok"}).`
      });
      notify("Metadata uploaded. Metadata URI field updated.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to upload metadata.", "error");
    } finally {
      setMetadataUploadBusy(false);
    }
  };

  const uploadAssetFileToIrys = async (file: File, kind: "logo" | "banner") => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      notify("Only image files are supported for logo/banner upload.", "error");
      return;
    }

    if (kind === "logo") {
      setLogoUploadBusy(true);
    } else {
      setBannerUploadBusy(true);
    }

    try {
      const buildUploadFormData = () => {
        const formData = new FormData();
        formData.set("file", file);
        formData.set("network", resolveIrysNetwork(cluster));
        return formData;
      };

      let response = await fetch("/api/irys/upload-file", {
        method: "POST",
        body: buildUploadFormData()
      });

      let body = (await response.json().catch(() => ({}))) as IrysUploadApiResponse;
      if (response.status === 402 && body.paymentRequired) {
        const paymentSignature = await submitIrysPayment(body.paymentRequired);
        const paidFormData = buildUploadFormData();
        paidFormData.set("payerPublicKey", wallet.publicKey?.toBase58() ?? "");
        paidFormData.set("paymentSignature", paymentSignature);
        response = await fetch("/api/irys/upload-file", {
          method: "POST",
          body: paidFormData
        });
        body = (await response.json().catch(() => ({}))) as IrysUploadApiResponse;
      }
      if (!response.ok || !pickPreferredIrysUri(body)) {
        throw new Error(body.error || "Failed to upload file to Irys.");
      }
      const preferredUri = pickPreferredIrysUri(body);
      if (!preferredUri) {
        throw new Error("Irys upload succeeded but no URI was returned.");
      }

      if (kind === "logo") {
        updateCreateForm("metadataLogoUri", preferredUri);
      } else {
        updateCreateForm("metadataBannerUri", preferredUri);
      }

      appendActivity({
        label: `Upload ${kind === "logo" ? "Logo" : "Banner"}`,
        message: `Uploaded ${file.name} to Irys (${body.id ?? "ok"}).`
      });
      notify(`${kind === "logo" ? "Logo" : "Banner"} uploaded and URI populated.`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "File upload failed.", "error");
    } finally {
      if (kind === "logo") {
        setLogoUploadBusy(false);
      } else {
        setBannerUploadBusy(false);
      }
    }
  };

  const handleLogoFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void uploadAssetFileToIrys(file, "logo");
    }
    event.target.value = "";
  };

  const handleBannerFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void uploadAssetFileToIrys(file, "banner");
    }
    event.target.value = "";
  };

  const buildCriteria = () => {
    const platforms = createForm.selectedPlatforms;

    switch (createForm.criteriaKind) {
      case "minReputation":
        return CriteriaFactory.minReputation({
          vineConfig: parsePublicKey("OG reputation config", createForm.vineConfig, true)!,
          minPoints: parseInteger("Minimum points", createForm.minPoints, 0),
          season: parseInteger("Season", createForm.season, 0)
        } as any);
      case "verifiedIdentity":
        return CriteriaFactory.verifiedIdentity({
          grapeSpace: parsePublicKey("Grape space", createForm.grapeSpace, true)!,
          platforms
        } as any);
      case "verifiedWithWallet":
        return CriteriaFactory.verifiedWithWallet({
          grapeSpace: parsePublicKey("Grape space", createForm.grapeSpace, true)!,
          platforms
        } as any);
      case "combined":
        return CriteriaFactory.combined({
          vineConfig: parsePublicKey("OG reputation config", createForm.vineConfig, true)!,
          minPoints: parseInteger("Minimum points", createForm.minPoints, 0),
          season: parseInteger("Season", createForm.season, 0),
          grapeSpace: parsePublicKey("Grape space", createForm.grapeSpace, true)!,
          platforms,
          requireWalletLink: createForm.requireWalletLink
        } as any);
      case "timeLockedReputation":
        return CriteriaFactory.timeLockedReputation({
          vineConfig: parsePublicKey("OG reputation config", createForm.vineConfig, true)!,
          minPoints: parseInteger("Minimum points", createForm.minPoints, 0),
          season: parseInteger("Season", createForm.season, 0),
          minHoldDurationSeconds: parseInteger(
            "Min hold duration",
            createForm.minHoldDurationSeconds,
            0
          )
        } as any);
      case "multiDao":
        return CriteriaFactory.multiDao({
          requiredAccessSpaces: splitCsv(createForm.requiredGates).map((gate, index) =>
            parsePublicKey(`Required gate #${index + 1}`, gate, true)!
          ),
          requireAll: createForm.requireAll
        } as any);
      case "tokenHolding":
        return CriteriaFactory.tokenHolding({
          mint: parsePublicKey("Token mint", createForm.mint, true)!,
          minAmount: parseInteger("Minimum amount", createForm.minAmount, 0),
          checkAta: createForm.checkAta
        } as any);
      case "nftCollection":
        return CriteriaFactory.nftCollection({
          collectionMint: parsePublicKey("Collection mint", createForm.collectionMint, true)!,
          minCount: parseInteger("Minimum count", createForm.minCount, 1)
        } as any);
      case "customProgram":
        return CriteriaFactory.customProgram({
          programId: parsePublicKey("Custom program ID", createForm.programId, true)!,
          instructionData: parseHexBuffer(createForm.instructionDataHex)
        } as any);
      default:
        throw new Error("Unsupported criteria type.");
    }
  };

  const buildGateType = () => {
    switch (createForm.gateTypeKind) {
      case "singleUse":
        return TypeFactory.singleUse();
      case "reusable":
        return TypeFactory.reusable();
      case "timeLimited":
        return TypeFactory.timeLimited(
          parseInteger("Duration seconds", createForm.durationSeconds, 1)
        );
      case "subscription":
        return TypeFactory.subscription(
          parseInteger("Interval seconds", createForm.intervalSeconds, 1)
        );
      default:
        throw new Error("Unsupported gate type.");
    }
  };

  const handleCreateGate = async () => {
    if (!wallet.publicKey || !connection) {
      notify("Connect wallet and choose a valid RPC endpoint first.", "error");
      return;
    }

    setCreateBusy(true);
    try {
      const params = {
        accessId: parsePublicKey("Gate ID", createForm.gateId, true)!,
        gateId: parsePublicKey("Gate ID", createForm.gateId, true)!,
        criteria: buildCriteria(),
        accessType: buildGateType(),
        gateType: buildGateType(),
        metadataUri: createForm.metadataUri.trim() || undefined,
        authority:
          parsePublicKey("Authority", createForm.authority, false) ?? wallet.publicKey
      };

      const result = await executeSdkMethod({
        action: "create",
        params,
        connection,
        wallet: wallet as unknown as WalletProvider
      });

      const signature = extractSignature(result);
      setActivity((prev) => [
        {
          label: "Initialize Gate",
          message: signature ? "Transaction submitted." : "Action completed.",
          signature,
          createdAt: Date.now()
        },
        ...prev
      ]);

      notify(signature ? `Gate created. Signature: ${signature}` : "Gate created.", "success");
      setCreateStep(2);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to initialize gate.", "error");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleCheckGate = async () => {
    if (!wallet.publicKey || !connection) {
      notify("Connect wallet and choose a valid RPC endpoint first.", "error");
      return;
    }

    setCheckBusy(true);
    try {
      const derivedCheckForm = await handleAutoDeriveCheckAccounts({ silent: true });
      if (!derivedCheckForm) {
        throw new Error(
          "Unable to prepare required accounts. Enter gate ID and user wallet, then retry."
        );
      }
      const effectiveCheckForm = derivedCheckForm ?? checkForm;
      const params = {
        accessId: parsePublicKey("Gate ID", effectiveCheckForm.gateId, true)!,
        gateId: parsePublicKey("Gate ID", effectiveCheckForm.gateId, true)!,
        user: parsePublicKey("User", effectiveCheckForm.user, true)!,
        reputationAccount: parsePublicKey(
          "Reputation account",
          effectiveCheckForm.reputationAccount,
          false
        ),
        identityAccount: parsePublicKey("Identity account", effectiveCheckForm.identityAccount, false),
        linkAccount: parsePublicKey("Link account", effectiveCheckForm.linkAccount, false),
        tokenAccount: parsePublicKey("Token account", effectiveCheckForm.tokenAccount, false),
        storeRecord: effectiveCheckForm.storeRecord
      };

      const shouldStoreRecord = Boolean(effectiveCheckForm.storeRecord);
      let result: unknown;
      let signature: string | undefined;
      let passed: boolean;

      if (shouldStoreRecord) {
        const client = await getMemberClient();
        const checkMethod = getSdkClientMethod<((arg: unknown) => unknown)>(client, [
          "checkAccess",
          "checkGate"
        ]);
        if (!checkMethod) {
          throw new Error("SDK client is missing checkAccess/checkGate.");
        }
        result = await Promise.resolve(checkMethod.call(client, params));
        signature = extractSignature(result);
        passed = extractPassStatus(result) ?? true;
      } else {
        const readOnlyClient = await getAdminClient({ readOnly: true });
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

      setActivity((prev) => [
        {
          label: "Check Gate",
          message: resultMessage,
          signature,
          createdAt: Date.now()
        },
        ...prev
      ]);

      notify(
        signature ? `Check submitted. Signature: ${signature}` : resultMessage,
        passed === false ? "info" : "success"
      );
    } catch (error) {
      const message = await formatCheckGateError(error, connection);
      notify(message, "error");
    } finally {
      setCheckBusy(false);
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
        accessId: parsePublicKey("Gate ID", effectiveForm.gateId, true)!,
        gateId: parsePublicKey("Gate ID", effectiveForm.gateId, true)!,
        user: wallet.publicKey,
        reputationAccount: parsePublicKey(
          "Reputation account",
          effectiveForm.reputationAccount,
          false
        ),
        identityAccount: parsePublicKey("Identity account", effectiveForm.identityAccount, false),
        linkAccount: parsePublicKey("Link account", effectiveForm.linkAccount, false),
        tokenAccount: parsePublicKey("Token account", effectiveForm.tokenAccount, false),
        storeRecord: effectiveForm.storeRecord
      };

      const shouldStoreRecord = Boolean(effectiveForm.storeRecord);
      let result: unknown;
      let signature: string | undefined;
      let passed: boolean;
      if (shouldStoreRecord) {
        const client = await getMemberClient();
        const checkMethod = getSdkClientMethod<((arg: unknown) => unknown)>(client, [
          "checkAccess",
          "checkGate"
        ]);
        if (!checkMethod) {
          throw new Error("SDK client is missing checkAccess/checkGate.");
        }
        result = await Promise.resolve(checkMethod.call(client, params));
        signature = extractSignature(result);
        // On-chain check_access/check_gate returns an error when not passed.
        passed = extractPassStatus(result) ?? true;
      } else {
        const readOnlyClient = await getAdminClient({ readOnly: true });
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
        response: toDisplayValue(result)
      });

      appendActivity({
        label: "Member Check",
        message: resultMessage,
        signature
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

  const loadGatesByAuthority = async ({
    authorityInput,
    showSuccessToast = true
  }: {
    authorityInput?: string;
    showSuccessToast?: boolean;
  } = {}) => {
    const authorityValue =
      authorityInput?.trim() ||
      adminForm.authorityFilter.trim() ||
      wallet.publicKey?.toBase58() ||
      "";
    const authority = parsePublicKey("Authority filter", authorityValue, true)!;

    const client = await getAdminClient({ readOnly: true });
    const method = getSdkClientMethod<((authorityKey: PublicKey) => Promise<unknown[]>)>(client, [
      "fetchAccessesByAuthority",
      "fetchGatesByAuthority"
    ]);

    let gates: unknown[] = [];
    let usedFallbackScan = false;
    let primaryError: Error | undefined;

    if (typeof method === "function") {
      try {
        const methodResult = await method.call(client, authority);
        gates = Array.isArray(methodResult) ? methodResult : [];
      } catch (error) {
        primaryError = error instanceof Error ? error : new Error("Unknown SDK fetch error.");
      }
    }

    if (gates.length === 0) {
      const clientAny = client as Record<string, any>;
      const gateAccountClient =
        clientAny.program?.account?.Access ??
        clientAny.program?.account?.access ??
        clientAny.program?.account?.Gate ??
        clientAny.program?.account?.gate;
      const allMethod = gateAccountClient?.all as (() => Promise<unknown[]>) | undefined;
      if (typeof allMethod === "function") {
        try {
          const allGateAccounts = await allMethod.call(gateAccountClient);
          const authorityBase58 = authority.toBase58();
          gates = (Array.isArray(allGateAccounts) ? allGateAccounts : []).filter((entry: any) => {
            const accountAuthority =
              entry?.account?.authority && typeof entry.account.authority.toBase58 === "function"
                ? entry.account.authority.toBase58()
                : "";
            return accountAuthority === authorityBase58;
          });
          usedFallbackScan = true;
        } catch (error) {
          const fallbackError = error instanceof Error ? error.message : "unknown fallback error";
          if (primaryError) {
            throw new Error(
              `SDK authority fetch failed (${primaryError.message}) and fallback scan failed (${fallbackError}).`
            );
          }
          throw new Error(`Fallback gate scan failed: ${fallbackError}`);
        }
      }
    }

    if (gates.length === 0 && connection) {
      try {
        const rawAccounts = await connection.getProgramAccounts(GPASS_PROGRAM_ID, {
          filters: [{ memcmp: { offset: 8 + 1 + 32, bytes: authority.toBase58() } }]
        });
        const rawMapped = rawAccounts
          .map((entry) => {
            const decoded = decodeAccessLikeAccountData(entry.account.data);
            const accessId =
              asPublicKeyValue(decoded?.accessId ?? decoded?.gateId) ??
              readAccessIdFromRawData(entry.account.data);
            if (!accessId) {
              return null;
            }
            return {
              publicKey: entry.pubkey,
              account: {
                accessId,
                gateId: accessId,
                authority,
                isActive: Boolean(decoded?.isActive),
                totalChecks: (decoded?.totalChecks as any) ?? (decoded?.total_checks as any),
                successfulChecks:
                  (decoded?.successfulChecks as any) ?? (decoded?.successful_checks as any)
              }
            };
          })
          .filter((entry) => Boolean(entry)) as Array<{
            publicKey: PublicKey;
            account: Record<string, unknown>;
          }>;

        if (rawMapped.length > 0) {
          gates = rawMapped;
          usedFallbackScan = true;
        }
      } catch (error) {
        const rawScanError = error instanceof Error ? error.message : "unknown raw-scan error";
        if (primaryError) {
          throw new Error(
            `SDK authority fetch failed (${primaryError.message}) and raw scan failed (${rawScanError}).`
          );
        }
      }
    }

    if (!method && !usedFallbackScan) {
      throw new Error("SDK client is missing fetchAccessesByAuthority/fetchGatesByAuthority.");
    }
    if (method && primaryError && !usedFallbackScan && gates.length === 0) {
      throw new Error(`SDK authority fetch failed: ${primaryError.message}`);
    }
    const mapped: AdminGateItem[] = (Array.isArray(gates) ? gates : []).map((entry: any) => {
      const account = entry.account ?? {};
      const totalChecksRaw = pickCounterFromAccount(account, ["totalChecks", "total_checks"]);
      const successfulChecksRaw = pickCounterFromAccount(account, [
        "successfulChecks",
        "successful_checks"
      ]);
      const hasKnownStats =
        totalChecksRaw !== undefined && successfulChecksRaw !== undefined;
      const totalChecks = totalChecksRaw ?? "0";
      const successfulChecks = successfulChecksRaw ?? "0";
      return {
        pda:
          entry.publicKey && typeof entry.publicKey.toBase58 === "function"
            ? entry.publicKey.toBase58()
            : "",
        gateId:
          account.accessId && typeof account.accessId.toBase58 === "function"
            ? account.accessId.toBase58()
            : account.gateId && typeof account.gateId.toBase58 === "function"
              ? account.gateId.toBase58()
            : "",
        authority:
          account.authority && typeof account.authority.toBase58 === "function"
            ? account.authority.toBase58()
            : "",
        isActive: Boolean(account.isActive),
        totalChecks,
        successfulChecks,
        hasKnownStats,
        statsLabel: hasKnownStats ? `${successfulChecks}/${totalChecks}` : "legacy/unknown"
      };
    });

    setAdminGates(mapped);
    setAdminGateDetails(null);
    setAdminForm((prev) => ({
      ...prev,
      authorityFilter: authority.toBase58(),
      selectedGateId:
        mapped.length === 0
          ? ""
          : mapped.some((gate) => gate.gateId === prev.selectedGateId)
            ? prev.selectedGateId
            : mapped[0].gateId
    }));

    if (showSuccessToast) {
      notify(
        `Loaded ${mapped.length} gate(s).${usedFallbackScan ? " Used fallback RPC scan." : ""}`,
        "success"
      );
    }

    return mapped;
  };

  const fetchGateDetails = async ({
    gateIdInput,
    showSuccessToast = true
  }: {
    gateIdInput?: string;
    showSuccessToast?: boolean;
  } = {}) => {
    const gateId = parsePublicKey("Selected gate", gateIdInput ?? adminForm.selectedGateId, true)!;
    const client = await getAdminClient({ readOnly: true });
    const method = getSdkClientMethod<((gate: PublicKey) => Promise<unknown>)>(client, [
      "fetchAccess",
      "fetchGate"
    ]);

    let [gatePda] = await findPrimaryAccessPda(gateId, GPASS_PROGRAM_ID);
    let gate: unknown = null;
    let primaryError: Error | undefined;

    if (typeof method === "function") {
      try {
        gate = await method.call(client, gateId);
      } catch (error) {
        primaryError = error instanceof Error ? error : new Error("Unknown SDK fetchGate error.");
      }
    }

    if (!gate) {
      if (connection) {
        try {
          const rawMatches = await connection.getProgramAccounts(GPASS_PROGRAM_ID, {
            filters: [{ memcmp: { offset: 9, bytes: gateId.toBase58() } }]
          });
          const rawEntry = rawMatches.find((entry) => Boolean(decodeAccessLikeAccountData(entry.account.data)));
          if (rawEntry) {
            gate = decodeAccessLikeAccountData(rawEntry.account.data);
            gatePda = rawEntry.pubkey;
          }
        } catch {
          // Ignore raw fallback failures.
        }
      }
    }

    if (!gate) {
      const clientAny = client as Record<string, any>;
      const gateAccountClient =
        clientAny.program?.account?.Access ??
        clientAny.program?.account?.access ??
        clientAny.program?.account?.Gate ??
        clientAny.program?.account?.gate;
      const fetchNullable =
        gateAccountClient?.fetchNullable as ((address: PublicKey) => Promise<unknown>) | undefined;
      const fetchStrict = gateAccountClient?.fetch as ((address: PublicKey) => Promise<unknown>) | undefined;

      try {
        if (typeof fetchNullable === "function") {
          gate = await fetchNullable.call(gateAccountClient, gatePda);
        } else if (typeof fetchStrict === "function") {
          gate = await fetchStrict.call(gateAccountClient, gatePda);
        }
      } catch {
        gate = null;
      }
    }

    if (!gate) {
      const detailPayload = {
        error: "Gate not found on this network/RPC.",
        gateId: gateId.toBase58(),
        gatePda: gatePda.toBase58(),
        rpc: rpcDisplayLabel,
        hint: "Verify cluster/RPC and ensure this gate was created on that network.",
        sdkError: primaryError?.message
      };
      setAdminGateDetails(detailPayload);
      updateAdminForm("metadataUri", "");
      if (showSuccessToast) {
        notify("Gate not found on this network/RPC.", "info");
      }
      return null;
    }

    const display = toDisplayValue({
      ...(gate as Record<string, unknown>),
      gatePda: gatePda.toBase58()
    }) as Record<string, unknown>;
    setAdminGateDetails(display);
    updateAdminForm("metadataUri", typeof display.metadataUri === "string" ? display.metadataUri : "");
    if (typeof display.isActive === "boolean") {
      updateAdminForm("setActiveValue", display.isActive);
    }
    if (showSuccessToast) {
      notify("Gate details loaded.", "success");
    }
    return display;
  };

  const handleLoadGatesByAuthority = async () => {
    setAdminBusy("loadGates");
    setAdminLoadStatus("Probing RPC...");
    try {
      if (!connection) {
        throw new Error("No RPC connection available. Check network/RPC settings.");
      }

      const probeSlot = await connection.getSlot("processed");
      setAdminRpcProbeSlot(probeSlot);
      setAdminLoadStatus(`RPC probe OK at slot ${probeSlot}. Loading gates...`);
      if (typeof window !== "undefined") {
        console.info("[Grape Access][Admin] Load Gates RPC probe slot:", probeSlot);
      }

      await loadGatesByAuthority();
      setAdminLoadStatus("Gates loaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load gates.";
      setAdminLoadStatus(`Load failed: ${message}`);
      notify(message, "error");
    } finally {
      setAdminBusy("");
    }
  };

  const loadGateUsers = async ({
    gateIdInput,
    showSuccessToast = true
  }: {
    gateIdInput?: string;
    showSuccessToast?: boolean;
  } = {}) => {
    const gateId = parsePublicKey("Selected gate", gateIdInput ?? adminForm.selectedGateId, true)!;
    const gateIdBase58 = gateId.toBase58();
    const [accessPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("access"), gateId.toBuffer()],
      GPASS_PROGRAM_ID
    );
    const [legacyGatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("gate"), gateId.toBuffer()],
      GPASS_PROGRAM_ID
    );
    const recordOwnerCandidates = [accessPda.toBase58(), legacyGatePda.toBase58(), gateIdBase58];
    const recordOwnerCandidateSet = new Set(recordOwnerCandidates);
    const client = await getAdminClient({ readOnly: true });
    const clientAny = client as Record<string, any>;
    const checkRecordAccountClient =
      clientAny.program?.account?.AccessCheckRecord ??
      clientAny.program?.account?.accessCheckRecord ??
      clientAny.program?.account?.GateCheckRecord ??
      clientAny.program?.account?.gateCheckRecord;

    const records: AdminGateUserItem[] = [];
    let hasStoredRecordMatches = false;
    let usedTransactionFallback = false;
    let inferredTransactionUserCount = 0;
    const allMethod =
      checkRecordAccountClient?.all as ((filters?: unknown[]) => Promise<unknown[]>) | undefined;

    if (typeof allMethod === "function") {
      try {
        const fetchedByPda = new Map<string, any>();
        for (const candidate of recordOwnerCandidates) {
          for (const ownerOffset of CHECK_RECORD_OWNER_OFFSETS) {
            const fetched = await allMethod.call(checkRecordAccountClient, [
              { memcmp: { offset: ownerOffset, bytes: candidate } }
            ]);
            for (const entry of Array.isArray(fetched) ? fetched : []) {
              const pda =
                (entry as any)?.publicKey && typeof (entry as any).publicKey.toBase58 === "function"
                  ? (entry as any).publicKey.toBase58()
                  : "";
              if (pda && !fetchedByPda.has(pda)) {
                fetchedByPda.set(pda, entry);
              }
            }
          }
        }

        for (const entry of fetchedByPda.values()) {
          const account = (entry as any)?.account as Record<string, unknown> | undefined;
          if (!account) {
            continue;
          }
          const recordOwner = toPubkeyString(account.access ?? account.gate);
          if (recordOwner && !recordOwnerCandidateSet.has(recordOwner)) {
            continue;
          }
          const user = toPubkeyString(account.user);
          if (!user) {
            continue;
          }
          const checkedAt = asNumberValue(account.checkedAt ?? account.checked_at) ?? 0;
          const passed = asBooleanValue(account.passed) ?? false;
          const pda =
            (entry as any)?.publicKey && typeof (entry as any).publicKey.toBase58 === "function"
              ? (entry as any).publicKey.toBase58()
              : "";
          records.push({
            pda,
            user,
            passed,
            checkedAt,
            checkedAtLabel: formatCheckedAt(checkedAt)
          });
        }
        if (records.length > 0) {
          hasStoredRecordMatches = true;
        }
      } catch {
        // Fall through to raw scan fallback.
      }
    }

    if (typeof allMethod === "function" && records.length < 2) {
      try {
        const fetchedAll = await allMethod.call(checkRecordAccountClient);
        const knownRecordPdas = new Set(records.map((entry) => entry.pda).filter((entry) => Boolean(entry)));
        for (const entry of Array.isArray(fetchedAll) ? fetchedAll : []) {
          const account = (entry as any)?.account as Record<string, unknown> | undefined;
          if (!account) {
            continue;
          }
          const recordOwner = toPubkeyString(account.access ?? account.gate);
          if (!recordOwner || !recordOwnerCandidateSet.has(recordOwner)) {
            continue;
          }
          const user = toPubkeyString(account.user);
          if (!user) {
            continue;
          }
          const pda =
            (entry as any)?.publicKey && typeof (entry as any).publicKey.toBase58 === "function"
              ? (entry as any).publicKey.toBase58()
              : "";
          if (pda && knownRecordPdas.has(pda)) {
            continue;
          }
          const checkedAt = asNumberValue(account.checkedAt ?? account.checked_at) ?? 0;
          const passed = asBooleanValue(account.passed) ?? false;
          records.push({
            pda,
            user,
            passed,
            checkedAt,
            checkedAtLabel: formatCheckedAt(checkedAt)
          });
          if (pda) {
            knownRecordPdas.add(pda);
          }
        }
        if (records.length > 0) {
          hasStoredRecordMatches = true;
        }
      } catch {
        // Ignore unfiltered SDK scan failures.
      }
    }

    if (connection) {
      const rawMatchesByPda = new Map<string, { pubkey: PublicKey; account: { data: Buffer } }>();
      for (const candidate of recordOwnerCandidates) {
        for (const ownerOffset of CHECK_RECORD_OWNER_OFFSETS) {
          const rawMatches = await connection.getProgramAccounts(GPASS_PROGRAM_ID, {
            filters: [{ memcmp: { offset: ownerOffset, bytes: candidate } }]
          });
          for (const entry of rawMatches) {
            const pda = entry.pubkey.toBase58();
            if (!rawMatchesByPda.has(pda)) {
              rawMatchesByPda.set(pda, entry as { pubkey: PublicKey; account: { data: Buffer } });
            }
          }
        }
      }
      const rawMatches = Array.from(rawMatchesByPda.values());
      const knownRecordPdas = new Set(records.map((entry) => entry.pda).filter((entry) => Boolean(entry)));
      for (const entry of rawMatches) {
        if (knownRecordPdas.has(entry.pubkey.toBase58())) {
          continue;
        }
        const decoded = decodeCheckRecordLikeAccountData(entry.account.data);
        if (decoded) {
          const accountGate = toPubkeyString(decoded.gate ?? decoded.access);
          if (accountGate && !recordOwnerCandidateSet.has(accountGate)) {
            continue;
          }
          const user = toPubkeyString(decoded.user);
          if (!user) {
            continue;
          }
          const checkedAt = asNumberValue(decoded.checkedAt ?? decoded.checked_at) ?? 0;
          const passed = asBooleanValue(decoded.passed) ?? false;
          records.push({
            pda: entry.pubkey.toBase58(),
            user,
            passed,
            checkedAt,
            checkedAtLabel: formatCheckedAt(checkedAt)
          });
          knownRecordPdas.add(entry.pubkey.toBase58());
          continue;
        }

        const rawParsed = readGateCheckRecordFromRawData(entry.account.data);
        if (!rawParsed || !recordOwnerCandidateSet.has(rawParsed.gate.toBase58())) {
          continue;
        }
        records.push({
          pda: entry.pubkey.toBase58(),
          user: rawParsed.user.toBase58(),
          passed: rawParsed.passed,
          checkedAt: rawParsed.checkedAt,
          checkedAtLabel: formatCheckedAt(rawParsed.checkedAt)
        });
        knownRecordPdas.add(entry.pubkey.toBase58());
      }
      if (records.length > 0) {
        hasStoredRecordMatches = true;
      }
    }

    if (connection && records.length < 2) {
      try {
        const exhaustiveByPda = new Map<string, { pubkey: PublicKey; account: { data: Buffer } }>();
        for (const dataSize of [83, 75]) {
          const exhaustiveMatches = await connection.getProgramAccounts(GPASS_PROGRAM_ID, {
            filters: [{ dataSize }]
          });
          for (const entry of exhaustiveMatches) {
            const pda = entry.pubkey.toBase58();
            if (!exhaustiveByPda.has(pda)) {
              exhaustiveByPda.set(pda, entry as { pubkey: PublicKey; account: { data: Buffer } });
            }
          }
        }

        const knownRecordPdas = new Set(records.map((entry) => entry.pda).filter((entry) => Boolean(entry)));
        for (const entry of exhaustiveByPda.values()) {
          const pdaBase58 = entry.pubkey.toBase58();
          if (knownRecordPdas.has(pdaBase58)) {
            continue;
          }

          const decoded = decodeCheckRecordLikeAccountData(entry.account.data);
          if (decoded) {
            const accountGate = toPubkeyString(decoded.gate ?? decoded.access);
            if (!accountGate || !recordOwnerCandidateSet.has(accountGate)) {
              continue;
            }
            const user = toPubkeyString(decoded.user);
            if (!user) {
              continue;
            }
            const checkedAt = asNumberValue(decoded.checkedAt ?? decoded.checked_at) ?? 0;
            const passed = asBooleanValue(decoded.passed) ?? false;
            records.push({
              pda: pdaBase58,
              user,
              passed,
              checkedAt,
              checkedAtLabel: formatCheckedAt(checkedAt)
            });
            knownRecordPdas.add(pdaBase58);
            continue;
          }

          const rawParsed = readGateCheckRecordFromRawData(entry.account.data);
          if (!rawParsed || !recordOwnerCandidateSet.has(rawParsed.gate.toBase58())) {
            continue;
          }
          records.push({
            pda: pdaBase58,
            user: rawParsed.user.toBase58(),
            passed: rawParsed.passed,
            checkedAt: rawParsed.checkedAt,
            checkedAtLabel: formatCheckedAt(rawParsed.checkedAt)
          });
          knownRecordPdas.add(pdaBase58);
        }

        if (records.length > 0) {
          hasStoredRecordMatches = true;
        }
      } catch {
        // Ignore exhaustive fallback failures.
      }
    }

    if (connection) {
      const signatureTargets = [accessPda, legacyGatePda, gateId];
      const signatureMap = new Map<
        string,
        { signature: string; blockTime: number | null; slot: number }
      >();

      const fetchSignatureHistory = async (target: PublicKey, maxSignatures = 1500) => {
        const collected: Array<{ signature: string; blockTime: number | null; slot: number }> = [];
        let before: string | undefined;
        while (collected.length < maxSignatures) {
          let batch: Awaited<ReturnType<Connection["getSignaturesForAddress"]>> = [];
          try {
            batch = await connection.getSignaturesForAddress(target, {
              limit: Math.min(1000, maxSignatures - collected.length),
              before
            });
          } catch {
            break;
          }
          if (!Array.isArray(batch) || batch.length === 0) {
            break;
          }
          for (const item of batch) {
            if (item.err) {
              continue;
            }
            collected.push({
              signature: item.signature,
              blockTime: item.blockTime ?? null,
              slot: item.slot
            });
          }
          before = batch[batch.length - 1]?.signature;
          if (!before || batch.length < Math.min(1000, maxSignatures - collected.length)) {
            break;
          }
        }
        return collected;
      };

      for (const target of signatureTargets) {
        const signatureBatch = await fetchSignatureHistory(target, 1500);
        for (const item of signatureBatch) {
          if (!signatureMap.has(item.signature)) {
            signatureMap.set(item.signature, {
              signature: item.signature,
              blockTime: item.blockTime ?? null,
              slot: item.slot
            });
          }
        }
      }

      const signatureCandidates = Array.from(signatureMap.values())
        .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
        .slice(0, 800);

      const txBatch = await Promise.all(
        signatureCandidates.map(async (signatureInfo) => {
          try {
            const transaction = await connection.getParsedTransaction(signatureInfo.signature, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0
            });
            return { signatureInfo, transaction };
          } catch {
            return null;
          }
        })
      );

      const txUsers = new Map<string, AdminGateUserItem>();

      for (const entry of txBatch) {
        if (!entry?.transaction) {
          continue;
        }

        const parsedInstructions = entry.transaction.transaction.message.instructions as Array<any>;
        const innerInstructions = (
          entry.transaction.meta?.innerInstructions?.flatMap((inner) =>
            Array.isArray((inner as any)?.instructions) ? ((inner as any).instructions as Array<any>) : []
          ) ?? []
        ) as Array<any>;
        const allInstructions = [...parsedInstructions, ...innerInstructions];
        for (const instruction of allInstructions) {
          const instructionProgramId =
            typeof instruction.programId === "string"
              ? instruction.programId
              : typeof instruction.programId?.toBase58 === "function"
                ? instruction.programId.toBase58()
                : "";
          if (instructionProgramId !== GPASS_PROGRAM_ID.toBase58()) {
            continue;
          }
          if (!matchesCheckInstructionDiscriminator(instruction.data ?? "")) {
            continue;
          }

          const accountList = Array.isArray(instruction.accounts) ? instruction.accounts : [];
          if (accountList.length < 2) {
            continue;
          }
          const userCandidate = accountList[1];
          const user =
            typeof userCandidate === "string"
              ? userCandidate
              : typeof userCandidate?.toBase58 === "function"
                ? userCandidate.toBase58()
                : "";
          if (!asPublicKeyValue(user)) {
            continue;
          }

          const checkedAt = entry.signatureInfo.blockTime ?? entry.transaction.blockTime ?? 0;
          if (!txUsers.has(user)) {
            txUsers.set(user, {
              pda: `tx:${entry.signatureInfo.signature}`,
              user,
              passed: true,
              checkedAt,
              checkedAtLabel: formatCheckedAt(checkedAt)
            });
          }
        }
      }

      if (txUsers.size > 0) {
        records.push(...Array.from(txUsers.values()));
        usedTransactionFallback = true;
        inferredTransactionUserCount = txUsers.size;
      }
    }

    records.sort((a, b) => b.checkedAt - a.checkedAt);
    const uniqueByUser = new Map<string, AdminGateUserItem>();
    for (const record of records) {
      if (!uniqueByUser.has(record.user)) {
        uniqueByUser.set(record.user, record);
      }
    }
    const deduped = Array.from(uniqueByUser.values());
    const passedCount = deduped.filter((entry) => entry.passed).length;

    setAdminGateUsers(deduped);
    if (deduped.length === 0) {
      setAdminGateUsersStatus(
        "No stored user records found for this gate yet, and no recent successful check transactions could be inferred."
      );
    } else if (usedTransactionFallback && hasStoredRecordMatches) {
      setAdminGateUsersStatus(
        `Loaded ${deduped.length} user(s). Passing: ${passedCount}. Included ${inferredTransactionUserCount} transaction-inferred check(s). Last update: ${deduped[0].checkedAtLabel}.`
      );
    } else if (usedTransactionFallback) {
      setAdminGateUsersStatus(
        `Loaded ${deduped.length} user(s) from successful check transactions. No stored check-record accounts were found.`
      );
    } else {
      setAdminGateUsersStatus(
        `Loaded ${deduped.length} user(s). Passing: ${passedCount}. Last update: ${deduped[0].checkedAtLabel}.`
      );
    }

    if (showSuccessToast) {
      notify(
        deduped.length
          ? `Loaded ${deduped.length} connected user(s).`
          : "No stored users found for this gate.",
        "success"
      );
    }

    return deduped;
  };

  const handleLoadGateUsers = async () => {
    setAdminBusy("loadUsers");
    try {
      await loadGateUsers();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to load users for this gate.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleFetchGateDetails = async () => {
    setAdminBusy("fetchGate");
    try {
      await fetchGateDetails();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to fetch gate.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleLoadSelectedGateIntoEditor = async () => {
    setAdminBusy("loadEditor");
    try {
      const details = await fetchGateDetails({ showSuccessToast: false });
      if (!details) {
        throw new Error("Load gate details first before editing settings.");
      }
      const updates = buildCreateFormUpdatesFromGateData(details);
      setCreateForm((prev) => ({ ...prev, ...updates }));
      const targetGateId = adminForm.selectedGateId.trim() || updates.gateId || "";
      setEditorMode("edit");
      setEditorTargetGateId(targetGateId);
      setCreateStep(1);
      setTab(0);
      notify("Loaded selected gate settings into Gate Builder editor.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to load gate into editor.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleSetGateActive = async () => {
    setAdminBusy("setActive");
    try {
      if (!canAttemptSelectedGateWrite) {
        throw new Error(
          selectedGateAuthority
            ? `Connected wallet is not the authority for this selected gate (expected ${selectedGateAuthority}).`
            : "Connect wallet and select a gate before running admin actions."
        );
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const client = await getAdminClient();
      const method = getSdkClientMethod<
        | ((params: { gateId: PublicKey; isActive: boolean }) => Promise<unknown>)
        | ((params: { accessId: PublicKey; isActive: boolean }) => Promise<unknown>)
      >(client, ["setAccessActive", "setGateActive"]);

      if (!method) {
        throw new Error("SDK client is missing setAccessActive/setGateActive.");
      }

      const result = await method.call(client, {
        accessId: gateId,
        gateId,
        isActive: adminForm.setActiveValue
      });
      const signature = extractSignature(result);
      appendActivity({
        label: "Set Gate Active",
        message: adminForm.setActiveValue ? "Gate activated." : "Gate deactivated.",
        signature
      });
      notify(
        signature
          ? `Gate status updated. Signature: ${signature}`
          : "Gate status updated.",
        "success"
      );
      await loadGatesByAuthority({ showSuccessToast: false });
      await fetchGateDetails({ gateIdInput: gateId.toBase58(), showSuccessToast: false });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to set gate active state.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleSetGateAuthority = async () => {
    setAdminBusy("setAuthority");
    try {
      if (!canAttemptSelectedGateWrite) {
        throw new Error(
          selectedGateAuthority
            ? `Connected wallet is not the authority for this selected gate (expected ${selectedGateAuthority}).`
            : "Connect wallet and select a gate before running admin actions."
        );
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const newAuthority = parsePublicKey("New authority", adminForm.newAuthority, true)!;
      const client = await getAdminClient();
      const method = getSdkClientMethod<
        | ((params: { gateId: PublicKey; newAuthority: PublicKey }) => Promise<unknown>)
        | ((params: { accessId: PublicKey; newAuthority: PublicKey }) => Promise<unknown>)
      >(client, ["setAccessAuthority", "setGateAuthority"]);

      if (!method) {
        throw new Error("SDK client is missing setAccessAuthority/setGateAuthority.");
      }

      const result = await method.call(client, { accessId: gateId, gateId, newAuthority });
      const signature = extractSignature(result);
      appendActivity({
        label: "Set Gate Authority",
        message: "Gate authority updated.",
        signature
      });
      notify(
        signature
          ? `Authority updated. Signature: ${signature}`
          : "Authority updated.",
        "success"
      );
      await loadGatesByAuthority({ showSuccessToast: false });
      setAdminGateDetails(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to set gate authority.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleUpdateGateCriteria = async () => {
    setAdminBusy("updateCriteria");
    try {
      if (!canAttemptSelectedGateWrite) {
        throw new Error(
          selectedGateAuthority
            ? `Connected wallet is not the authority for this selected gate (expected ${selectedGateAuthority}).`
            : "Connect wallet and select a gate before running admin actions."
        );
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const client = await getAdminClient();
      const method = getSdkClientMethod<
        | ((params: { gateId: PublicKey; newCriteria: unknown }) => Promise<unknown>)
        | ((params: { accessId: PublicKey; newCriteria: unknown }) => Promise<unknown>)
      >(client, ["updateAccessCriteria", "updateGateCriteria"]);

      if (!method) {
        throw new Error("SDK client is missing updateAccessCriteria/updateGateCriteria.");
      }

      const result = await method.call(client, {
        accessId: gateId,
        gateId,
        newCriteria: buildCriteria()
      });
      const signature = extractSignature(result);
      appendActivity({
        label: "Update Gate Criteria",
        message: "Gate criteria updated from current form configuration.",
        signature
      });
      notify(
        signature
          ? `Criteria updated. Signature: ${signature}`
          : "Criteria updated.",
        "success"
      );
      await fetchGateDetails({ gateIdInput: gateId.toBase58(), showSuccessToast: false });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to update gate criteria.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleUpdateMetadataUri = async () => {
    setAdminBusy("updateMetadataUri");
    try {
      if (!canAttemptSelectedGateWrite) {
        throw new Error(
          selectedGateAuthority
            ? `Connected wallet is not the authority for this selected gate (expected ${selectedGateAuthority}).`
            : "Connect wallet and select a gate before running admin actions."
        );
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const newMetadataUri = adminForm.metadataUri.trim();
      const client = await getAdminClient();
      const method = getSdkClientMethod<
        (params: { accessId: PublicKey; newMetadataUri: string }) => Promise<unknown>
      >(client, ["updateMetadataUri"]);

      if (!method) {
        throw new Error("SDK client is missing updateMetadataUri.");
      }

      const result = await method.call(client, {
        accessId: gateId,
        newMetadataUri
      });
      const signature = extractSignature(result);
      appendActivity({
        label: "Update Metadata URI",
        message: "Metadata URI updated.",
        signature
      });
      notify(
        signature ? `Metadata URI updated. Signature: ${signature}` : "Metadata URI updated.",
        "success"
      );
      await fetchGateDetails({ gateIdInput: gateId.toBase58(), showSuccessToast: false });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to update metadata URI.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleGateBuilderSubmit = async () => {
    if (isEditMode) {
      if (!editorGateId) {
        notify("No gate selected for edit mode. Load a gate from Admin Console first.", "error");
        return;
      }
      await handleUpdateGateCriteria();
      return;
    }
    await handleCreateGate();
  };

  const resolveEmergencyCloseTargetPda = async (
    gateId: PublicKey,
    preferredPda?: PublicKey
  ): Promise<PublicKey> => {
    if (!connection) {
      throw new Error("Connection is not ready.");
    }

    const candidates: PublicKey[] = [];
    if (preferredPda) {
      candidates.push(preferredPda);
    }
    const [accessPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("access"), gateId.toBuffer()],
      GPASS_PROGRAM_ID
    );
    const [legacyGatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("gate"), gateId.toBuffer()],
      GPASS_PROGRAM_ID
    );
    for (const candidate of [accessPda, legacyGatePda]) {
      if (!candidates.some((entry) => entry.equals(candidate))) {
        candidates.push(candidate);
      }
    }

    for (const candidate of candidates) {
      const accountInfo = await connection.getAccountInfo(candidate);
      if (accountInfo && accountInfo.owner.equals(GPASS_PROGRAM_ID)) {
        return candidate;
      }
    }

    throw new Error(
      "Could not resolve a program-owned gate/access account PDA for emergency close."
    );
  };

  const handleCloseGate = async () => {
    setAdminBusy("closeGate");
    try {
      if (!canAttemptSelectedGateWrite) {
        throw new Error(
          selectedGateAuthority
            ? `Connected wallet is not the authority for this selected gate (expected ${selectedGateAuthority}).`
            : "Connect wallet and select a gate before running admin actions."
        );
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const recipient = parsePublicKey("Close recipient", adminForm.closeRecipient, false);
      const selectedGatePda = parsePublicKey(
        "Selected gate PDA",
        selectedAdminGate?.pda ?? "",
        false
      );
      const client = await getAdminClient();
      const closeErrors: string[] = [];
      let result: unknown;
      let closeSucceeded = false;

      const closeAttempts: Array<{ label: string; run: () => Promise<unknown> }> = [];
      const closeAccessMethod = getSdkClientMethod<
        ((params: { accessId: PublicKey; recipient?: PublicKey | null }) => Promise<unknown>)
      >(client, ["closeAccess"]);
      if (closeAccessMethod) {
        closeAttempts.push({
          label: "sdk.closeAccess",
          run: () => closeAccessMethod.call(client, { accessId: gateId, recipient })
        });
      }
      const closeGateMethod = getSdkClientMethod<
        ((params: { gateId: PublicKey; recipient?: PublicKey | null }) => Promise<unknown>)
      >(client, ["closeGate"]);
      if (closeGateMethod) {
        closeAttempts.push({
          label: "sdk.closeGate",
          run: () => closeGateMethod.call(client, { gateId, recipient })
        });
      }

      for (const attempt of closeAttempts) {
        try {
          result = await attempt.run();
          closeSucceeded = true;
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          closeErrors.push(`${attempt.label}: ${message}`);
        }
      }

      if (!closeSucceeded) {
        const clientAny = client as Record<string, any>;
        const program = clientAny.program as
          | {
              methods?: Record<string, (...args: unknown[]) => any>;
              provider?: { wallet?: { publicKey?: PublicKey } };
            }
          | undefined;

        const providerAuthority = program?.provider?.wallet?.publicKey ?? wallet.publicKey ?? null;
        if (program?.methods && providerAuthority) {
          const programMethods = program.methods;
          const [accessPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("access"), gateId.toBuffer()],
            GPASS_PROGRAM_ID
          );
          const [legacyGatePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("gate"), gateId.toBuffer()],
            GPASS_PROGRAM_ID
          );

          const directAttempts: Array<{ label: string; run: () => Promise<unknown> }> = [];
          if (typeof programMethods.closeAccess === "function") {
            directAttempts.push({
              label: "program.methods.closeAccess",
              run: () =>
                programMethods
                  .closeAccess(gateId)
                  .accounts({
                    access: accessPda,
                    authority: providerAuthority,
                    recipient: recipient ?? providerAuthority
                  })
                  .rpc()
            });
          }
          if (typeof programMethods.closeGate === "function") {
            directAttempts.push({
              label: "program.methods.closeGate",
              run: () =>
                programMethods
                  .closeGate(gateId)
                  .accounts({
                    gate: legacyGatePda,
                    authority: providerAuthority,
                    recipient: recipient ?? providerAuthority
                  })
                  .rpc()
            });
          }
          if (
            selectedGatePda &&
            isAdminWalletConnected &&
            typeof programMethods.adminCloseAny === "function"
          ) {
            directAttempts.push({
              label: "program.methods.adminCloseAny",
              run: () =>
                programMethods
                  .adminCloseAny()
                  .accounts({
                    authority: providerAuthority,
                    target: selectedGatePda,
                    recipient: recipient ?? providerAuthority
                  })
                  .rpc()
            });
          }

          for (const attempt of directAttempts) {
            try {
              result = await attempt.run();
              closeSucceeded = true;
              break;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              closeErrors.push(`${attempt.label}: ${message}`);
            }
          }
        }
      }

      if (!closeSucceeded) {
        let gateStillExists = false;
        if (selectedGatePda && connection) {
          try {
            const accountInfo = await connection.getAccountInfo(selectedGatePda);
            gateStillExists = Boolean(accountInfo);
          } catch {
            // Fall through to record fetch fallback.
          }
        }
        if (!gateStillExists) {
          gateStillExists = Boolean(await fetchGateRecordById(gateId));
        }
        if (!gateStillExists) {
          notify("Gate account appears already closed on this network.", "info");
          await loadGatesByAuthority({ showSuccessToast: false });
          return;
        }
        const isLegacyUnknown = selectedAdminGate?.hasKnownStats === false;
        const legacyHint =
          isLegacyUnknown && connectedWalletAddress !== GPASS_ADMIN_WALLET
            ? ` This gate appears to be legacy/unknown and may require emergency admin close by ${GPASS_ADMIN_WALLET}.`
            : "";
        throw new Error(
          closeErrors.length > 0
            ? `Close Gate failed. Attempts: ${closeErrors.join(" | ")}${legacyHint}`
            : `Close Gate failed. No compatible close method found.${legacyHint}`
        );
      }
      const signature = extractSignature(result);
      appendActivity({
        label: "Close Gate",
        message: "Gate closed and rent reclaimed.",
        signature
      });
      notify(signature ? `Gate closed. Signature: ${signature}` : "Gate closed.", "success");
      await loadGatesByAuthority({ showSuccessToast: false });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to close gate.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleEmergencyCloseGate = async () => {
    setAdminBusy("emergencyCloseGate");
    try {
      if (!isWalletConnected) {
        throw new Error("Connect wallet before using emergency close.");
      }
      if (!isAdminWalletConnected) {
        throw new Error(
          `Emergency close is restricted to admin wallet ${GPASS_ADMIN_WALLET}.`
        );
      }

      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const preferredPda = parsePublicKey(
        "Selected gate PDA",
        selectedAdminGate?.pda ?? "",
        false
      );
      const target = await resolveEmergencyCloseTargetPda(gateId, preferredPda);
      const recipient = parsePublicKey("Close recipient", adminForm.closeRecipient, false);

      const client = await getAdminClient();
      const program = (client as Record<string, any>).program as
        | {
            methods?: Record<string, (...args: unknown[]) => any>;
            provider?: { wallet?: { publicKey?: PublicKey } };
          }
        | undefined;

      const providerAuthority = program?.provider?.wallet?.publicKey ?? wallet.publicKey ?? null;
      if (!program?.methods || typeof program.methods.adminCloseAny !== "function") {
        throw new Error("SDK/program does not expose adminCloseAny.");
      }
      if (!providerAuthority) {
        throw new Error("Could not resolve provider authority wallet.");
      }
      if (providerAuthority.toBase58() !== GPASS_ADMIN_WALLET) {
        throw new Error(
          `Connected signer ${providerAuthority.toBase58()} is not the admin wallet ${GPASS_ADMIN_WALLET}.`
        );
      }

      const result = await program.methods
        .adminCloseAny()
        .accounts({
          authority: providerAuthority,
          target,
          recipient: recipient ?? providerAuthority
        })
        .rpc();

      const signature = extractSignature(result);
      appendActivity({
        label: "Emergency Close Gate",
        message: "Gate/account closed using admin emergency action.",
        signature
      });
      notify(
        signature
          ? `Emergency close succeeded. Signature: ${signature}`
          : "Emergency close succeeded.",
        "success"
      );
      await loadGatesByAuthority({ showSuccessToast: false });
      await fetchGateDetails({ gateIdInput: gateId.toBase58(), showSuccessToast: false });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Emergency close failed.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const handleCloseCheckRecord = async () => {
    setAdminBusy("closeRecord");
    try {
      if (!canAttemptSelectedGateWrite) {
        throw new Error(
          selectedGateAuthority
            ? `Connected wallet is not the authority for this selected gate (expected ${selectedGateAuthority}).`
            : "Connect wallet and select a gate before running admin actions."
        );
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const user = parsePublicKey("Check record user", adminForm.closeRecordUser, true)!;
      const recipient = parsePublicKey("Close recipient", adminForm.closeRecipient, false);
      const client = await getAdminClient();
      const method = getSdkClientMethod<
        | ((params: { gateId: PublicKey; user: PublicKey; recipient?: PublicKey }) => Promise<unknown>)
        | ((params: { accessId: PublicKey; user: PublicKey; recipient?: PublicKey }) => Promise<unknown>)
      >(client, ["closeAccessCheckRecord", "closeCheckRecord"]);

      if (!method) {
        throw new Error("SDK client is missing closeAccessCheckRecord/closeCheckRecord.");
      }

      const result = await method.call(client, { accessId: gateId, gateId, user, recipient });
      const signature = extractSignature(result);
      appendActivity({
        label: "Close Check Record",
        message: "Check record closed and rent reclaimed.",
        signature
      });
      notify(
        signature
          ? `Check record closed. Signature: ${signature}`
          : "Check record closed.",
        "success"
      );
      await fetchGateDetails({ gateIdInput: gateId.toBase58(), showSuccessToast: false });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to close check record.", "error");
    } finally {
      setAdminBusy("");
    }
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard.", "success");
    } catch {
      notify("Clipboard copy failed.", "error");
    }
  };

  const confirmAdminAction = async () => {
    const currentAction = adminConfirmAction;
    setAdminConfirmAction("");

    if (currentAction === "emergencyCloseGate") {
      await handleEmergencyCloseGate();
      return;
    }
    if (currentAction === "setAuthority") {
      await handleSetGateAuthority();
      return;
    }
    if (currentAction === "closeRecord") {
      await handleCloseCheckRecord();
      return;
    }
    if (currentAction === "closeGate") {
      await handleCloseGate();
    }
  };

  const adminConfirmCopy = useMemo(() => {
    if (adminConfirmAction === "setAuthority") {
      return {
        title: "Transfer Gate Authority",
        body: "This will move gate management rights to a new wallet address."
      };
    }
    if (adminConfirmAction === "closeRecord") {
      return {
        title: "Close Gate Check Record",
        body: "This will permanently close one user check record and reclaim rent."
      };
    }
    if (adminConfirmAction === "closeGate") {
      return {
        title: "Close Gate",
        body: "This will permanently close this gate account and reclaim rent."
      };
    }
    if (adminConfirmAction === "emergencyCloseGate") {
      return {
        title: "Emergency Close (Admin)",
        body: `This uses adminCloseAny and is restricted to ${GPASS_ADMIN_WALLET}. Continue only if you intend to force-close this account.`
      };
    }
    return null;
  }, [adminConfirmAction]);

  return (
    <Container maxWidth="lg" className="dramatic-shell" sx={{ py: { xs: 2, md: 2.8 } }}>
      <Paper
        className="panel"
        sx={{ p: { xs: 1.4, md: 1.6 }, mb: 2, position: "relative", overflow: "visible", zIndex: 8 }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          spacing={1}
        >
          <Stack direction="row" alignItems="center" spacing={1.2}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: "1px solid rgba(109,184,255,0.4)",
                display: "grid",
                placeItems: "center",
                backgroundColor: "rgba(9, 16, 30, 0.94)"
              }}
            >
              <Image
                src="/images/grapelogo512.png"
                alt="Grape logo icon"
                width={24}
                height={24}
              />
            </Box>
            <Typography variant="h5" sx={{ lineHeight: 1.1 }}>
              Grape Access Console
            </Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              width: { xs: "100%", sm: "auto" },
              justifyContent: { xs: "space-between", sm: "flex-end" },
              flexWrap: "wrap",
              rowGap: 1
            }}
          >
            <Tooltip title="Network & RPC settings">
              <IconButton
                size="small"
                onClick={() => setSettingsOpen(true)}
                sx={{ border: "1px solid", borderColor: "divider" }}
              >
                <SettingsRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <WalletMultiButton />
          </Stack>
        </Stack>
      </Paper>

      <Grid container spacing={2.2}>
        <Grid size={{ xs: 12 }}>
          <Paper className="panel" sx={{ p: { xs: 1.2, md: 1.4 } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
              {programCards.map((card) => (
                <Paper
                  key={card.label}
                  variant="outlined"
                  sx={{ p: 1.1, borderRadius: 1, flex: 1, minWidth: 0 }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Typography variant="caption" color="text.secondary">
                      {card.label}
                    </Typography>
                    <Tooltip title="Copy">
                      <IconButton size="small" onClick={() => void copyText(card.value)}>
                        <ContentCopyRoundedIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Typography
                    className="mono"
                    sx={{ mt: 0.4, fontSize: "0.72rem", color: "text.secondary", wordBreak: "break-word" }}
                  >
                    {card.value}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper className="panel" sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack
              sx={{
                mb: 2,
                display: { xs: "grid", sm: "none" },
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 1
              }}
            >
              {primaryTabItems.map((item) => (
                <Button
                  key={item.value}
                  variant={tab === item.value ? "contained" : "outlined"}
                  onClick={() => setTab(item.value)}
                  sx={{ minHeight: 42, fontSize: "0.82rem", px: 1 }}
                >
                  {item.label}
                </Button>
              ))}
            </Stack>
            <Tabs
              value={tab}
              onChange={(_, value: number) => setTab(value)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                mb: 2,
                display: { xs: "none", sm: "flex" },
                "& .MuiTab-root": {
                  minHeight: 42
                }
              }}
            >
              {primaryTabItems.map((item) => (
                <Tab key={item.value} label={item.label} value={item.value} />
              ))}
            </Tabs>

            {tab === 0 && (
              <Stack spacing={3}>
                <Stepper activeStep={createStep} alternativeLabel>
                  {createSteps.map((step) => (
                    <Step key={step}>
                      <StepLabel>{step}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
                <Alert
                  severity={isEditMode ? "warning" : "info"}
                  action={
                    isEditMode ? (
                      <Button size="small" onClick={switchEditorToCreateMode}>
                        Switch to Create
                      </Button>
                    ) : undefined
                  }
                >
                  {isEditMode
                    ? `Edit mode: updating criteria for gate ${editorGateId || "(not set)"}.`
                    : "Create mode: initializing a new gate account."}
                </Alert>

                {createStep === 0 && (
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">
                      Start with a template so your team can launch quickly.
                    </Typography>
                    <Grid container spacing={2}>
                      {templates.map((template) => (
                        <Grid key={template.id} size={{ xs: 12, md: 4 }}>
                          <Card
                            variant="outlined"
                            sx={{
                              borderColor:
                                templateId === template.id
                                  ? "primary.main"
                                  : "rgba(63, 95, 255, 0.35)",
                              borderWidth: templateId === template.id ? 2 : 1
                            }}
                          >
                            <CardActionArea onClick={() => applyTemplate(template.id)}>
                              <Box sx={{ p: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                  <Typography variant="h6" sx={{ fontSize: "1.06rem" }}>
                                    {template.title}
                                  </Typography>
                                  {templateId === template.id && (
                                    <CheckCircleRoundedIcon color="primary" fontSize="small" />
                                  )}
                                </Stack>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                                  {template.description}
                                </Typography>
                              </Box>
                            </CardActionArea>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                    <Stack direction="row" justifyContent="flex-end">
                      <Button variant="contained" onClick={() => setCreateStep(1)}>
                        Next: Configure
                      </Button>
                    </Stack>
                  </Stack>
                )}

                {createStep === 1 && (
                  <Stack spacing={2}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          fullWidth
                          label="Gate ID"
                          placeholder="Unique public key for this gate"
                          value={createForm.gateId}
                          onChange={(event) => updateCreateForm("gateId", event.target.value)}
                          disabled={isEditMode}
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position="end">
                                <Button
                                  variant="text"
                                  size="small"
                                  sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: "0.72rem" }}
                                  onClick={generateGateId}
                                  disabled={isEditMode}
                                >
                                  Generate
                                </Button>
                              </InputAdornment>
                            )
                          }}
                          helperText={
                            isEditMode
                              ? "Locked in edit mode. Switch to create mode to use a different gate ID."
                              : "Unique on-chain identifier for this gate."
                          }
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          fullWidth
                          label="Authority (Optional)"
                          placeholder="Defaults to connected wallet"
                          value={createForm.authority}
                          onChange={(event) => updateCreateForm("authority", event.target.value)}
                          disabled={isEditMode}
                          helperText={
                            isEditMode
                              ? "Authority changes are managed in Admin Console."
                              : "Wallet allowed to manage this gate. Leave empty to use connected wallet."
                          }
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth>
                          <InputLabel>Criteria Type</InputLabel>
                          <Select
                            label="Criteria Type"
                            value={createForm.criteriaKind}
                            onChange={(event) =>
                              updateCreateForm("criteriaKind", event.target.value as CriteriaKind)
                            }
                          >
                            {criteriaOptions.map((option) => (
                              <MenuItem value={option.value} key={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                          <FormHelperText>Rule users must satisfy to pass this gate.</FormHelperText>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FormControl fullWidth>
                          <InputLabel>Gate Type</InputLabel>
                          <Select
                            label="Gate Type"
                            value={createForm.gateTypeKind}
                            disabled={isEditMode}
                            onChange={(event) =>
                              updateCreateForm("gateTypeKind", event.target.value as GateTypeKind)
                            }
                          >
                            {gateTypeOptions.map((option) => (
                              <MenuItem value={option.value} key={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                          <FormHelperText>
                            {isEditMode
                              ? "Gate type is unchanged in edit mode."
                              : "Controls how often a user can pass the gate."}
                          </FormHelperText>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack spacing={1.4}>
                        <Typography variant="subtitle2">Metadata URI (Optional)</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Store branding/integration manifest via URI. Use Irys upload to generate a JSON manifest.
                        </Typography>
                        <TextField
                          fullWidth
                          label="Metadata URI"
                          value={createForm.metadataUri}
                          onChange={(event) => updateCreateForm("metadataUri", event.target.value)}
                          disabled={isEditMode}
                          placeholder="https://uploader.irys.xyz/<id>"
                          helperText={
                            isEditMode
                              ? "Edit mode updates criteria only. Use Admin Console for metadata URI updates."
                              : "Saved on-chain during initialize access. Use full HTTPS metadata URLs."
                          }
                        />
                        <Grid container spacing={1.2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              label="Brand Name"
                              value={createForm.metadataName}
                              onChange={(event) => updateCreateForm("metadataName", event.target.value)}
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              label="Brand Subtitle"
                              value={createForm.metadataSubtitle}
                              onChange={(event) => updateCreateForm("metadataSubtitle", event.target.value)}
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              fullWidth
                              label="Description"
                              value={createForm.metadataDescription}
                              onChange={(event) => updateCreateForm("metadataDescription", event.target.value)}
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <Stack spacing={1}>
                              <TextField
                                fullWidth
                                label="Logo URI"
                                value={createForm.metadataLogoUri}
                                onChange={(event) => updateCreateForm("metadataLogoUri", event.target.value)}
                                disabled={isEditMode}
                              />
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => logoFileInputRef.current?.click()}
                                disabled={isEditMode || logoUploadBusy}
                              >
                                {logoUploadBusy ? "Uploading Logo..." : "Upload Logo Image"}
                              </Button>
                            </Stack>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <Stack spacing={1}>
                              <TextField
                                fullWidth
                                label="Banner URI"
                                value={createForm.metadataBannerUri}
                                onChange={(event) => updateCreateForm("metadataBannerUri", event.target.value)}
                                disabled={isEditMode}
                              />
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => bannerFileInputRef.current?.click()}
                                disabled={isEditMode || bannerUploadBusy}
                              >
                                {bannerUploadBusy ? "Uploading Banner..." : "Upload Banner Image"}
                              </Button>
                            </Stack>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Accent Color"
                              value={createForm.metadataAccent}
                              onChange={(event) => updateCreateForm("metadataAccent", event.target.value)}
                              disabled={isEditMode}
                              placeholder="#6db8ff"
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Support Label"
                              value={createForm.metadataSupportLabel}
                              onChange={(event) =>
                                updateCreateForm("metadataSupportLabel", event.target.value)
                              }
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Support URL"
                              value={createForm.metadataSupportUrl}
                              onChange={(event) => updateCreateForm("metadataSupportUrl", event.target.value)}
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <Divider sx={{ my: 0.4 }} />
                            <Typography variant="caption" color="text.secondary">
                              Integrations (optional)
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Discord Guild ID"
                              value={createForm.metadataDiscordGuildId}
                              onChange={(event) =>
                                updateCreateForm("metadataDiscordGuildId", event.target.value)
                              }
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Discord Pass Role ID"
                              value={createForm.metadataDiscordPassRoleId}
                              onChange={(event) =>
                                updateCreateForm("metadataDiscordPassRoleId", event.target.value)
                              }
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Discord Fail Action"
                              value={createForm.metadataDiscordFailAction}
                              onChange={(event) =>
                                updateCreateForm("metadataDiscordFailAction", event.target.value)
                              }
                              disabled={isEditMode}
                              placeholder="remove_role"
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              label="Telegram Chat ID"
                              value={createForm.metadataTelegramChatId}
                              onChange={(event) =>
                                updateCreateForm("metadataTelegramChatId", event.target.value)
                              }
                              disabled={isEditMode}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              label="Telegram Pass Entitlement"
                              value={createForm.metadataTelegramPassEntitlement}
                              onChange={(event) =>
                                updateCreateForm("metadataTelegramPassEntitlement", event.target.value)
                              }
                              disabled={isEditMode}
                              placeholder="member"
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <Divider sx={{ my: 0.4 }} />
                            <Typography variant="caption" color="text.secondary">
                              Revalidation + links
                            </Typography>
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Revalidation Interval Seconds"
                              value={createForm.metadataRevalidationIntervalSeconds}
                              onChange={(event) =>
                                updateCreateForm(
                                  "metadataRevalidationIntervalSeconds",
                                  event.target.value
                                )
                              }
                              disabled={isEditMode}
                              placeholder="3600"
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Revalidation Lease Seconds"
                              value={createForm.metadataRevalidationLeaseSeconds}
                              onChange={(event) =>
                                updateCreateForm("metadataRevalidationLeaseSeconds", event.target.value)
                              }
                              disabled={isEditMode}
                              placeholder="86400"
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Verify URL"
                              value={createForm.metadataVerifyUrl}
                              onChange={(event) => updateCreateForm("metadataVerifyUrl", event.target.value)}
                              disabled={isEditMode}
                              placeholder="https://access.governance.so/access?gateId=..."
                            />
                          </Grid>
                        </Grid>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                          <Button
                            variant="outlined"
                            onClick={handleUploadMetadataToIrys}
                            disabled={isEditMode || metadataUploadBusy}
                          >
                            {metadataUploadBusy ? "Uploading..." : "Upload Metadata JSON To Irys"}
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => void copyText(JSON.stringify(createMetadataManifestPreview, null, 2))}
                          >
                            Copy Metadata JSON
                          </Button>
                        </Stack>
                        {(createForm.metadataLogoUri || createForm.metadataBannerUri) && (
                          <Stack spacing={1}>
                            {createForm.metadataLogoUri && (
                              <Box
                                component="img"
                                src={resolveMetadataHttpUri(createForm.metadataLogoUri)}
                                alt="Logo preview"
                                sx={{
                                  width: 72,
                                  height: 72,
                                  objectFit: "cover",
                                  borderRadius: 1.2,
                                  border: "1px solid rgba(109, 184, 255, 0.24)"
                                }}
                              />
                            )}
                            {createForm.metadataBannerUri && (
                              <Box
                                component="img"
                                src={resolveMetadataHttpUri(createForm.metadataBannerUri)}
                                alt="Banner preview"
                                sx={{
                                  width: "100%",
                                  maxWidth: 360,
                                  height: 84,
                                  objectFit: "cover",
                                  borderRadius: 1.2,
                                  border: "1px solid rgba(109, 184, 255, 0.24)"
                                }}
                              />
                            )}
                          </Stack>
                        )}
                        {hasMetadataManifestDraft && (
                          <Typography
                            component="pre"
                            className="mono"
                            sx={{
                              m: 0,
                              p: 1.2,
                              fontSize: "0.72rem",
                              maxHeight: 160,
                              overflow: "auto",
                              borderRadius: 1,
                              backgroundColor: "rgba(10, 16, 30, 0.92)",
                              border: "1px solid rgba(109, 184, 255, 0.24)"
                            }}
                          >
                            {JSON.stringify(createMetadataManifestPreview, null, 2)}
                          </Typography>
                        )}
                        <input
                          ref={logoFileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={handleLogoFileSelected}
                        />
                        <input
                          ref={bannerFileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={handleBannerFileSelected}
                        />
                      </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Verification platforms
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                        Pick which identity platforms are accepted for verification-based rules.
                      </Typography>
                      <ToggleButtonGroup
                        value={createForm.selectedPlatforms}
                        onChange={(_, value) =>
                          updateCreateForm(
                            "selectedPlatforms",
                            Array.isArray(value) ? (value as number[]) : []
                          )
                        }
                        sx={{ flexWrap: "wrap", gap: 1 }}
                      >
                        {platformOptions.map((option) => (
                          <ToggleButton key={option.label} value={option.value}>
                            <Stack direction="row" spacing={0.7} alignItems="center">
                              <Box
                                sx={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "0.62rem",
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  backgroundColor: option.bg,
                                  color: option.fg
                                }}
                              >
                                {option.icon}
                              </Box>
                              <Box component="span">{option.label}</Box>
                            </Stack>
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </Paper>

                    <Grid container spacing={2}>
                      {(createForm.criteriaKind === "minReputation" ||
                        createForm.criteriaKind === "combined" ||
                        createForm.criteriaKind === "timeLockedReputation") && (
                        <>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              label="OG Reputation Config"
                              value={createForm.vineConfig}
                              onChange={(event) =>
                                updateCreateForm("vineConfig", event.target.value)
                              }
                              helperText="Public key of your community OG Reputation config account."
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                              fullWidth
                              label="Min Points"
                              value={createForm.minPoints}
                              onChange={(event) => updateCreateForm("minPoints", event.target.value)}
                              helperText="Minimum reputation points required."
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                              fullWidth
                              label="Season"
                              value={createForm.season}
                              onChange={(event) => updateCreateForm("season", event.target.value)}
                              helperText="Reputation season number."
                            />
                          </Grid>
                        </>
                      )}

                      {(createForm.criteriaKind === "verifiedIdentity" ||
                        createForm.criteriaKind === "verifiedWithWallet" ||
                        createForm.criteriaKind === "combined") && (
                        <Grid size={{ xs: 12 }}>
                          <TextField
                            fullWidth
                            label="Grape Space"
                            value={createForm.grapeSpace}
                            onChange={(event) => updateCreateForm("grapeSpace", event.target.value)}
                            helperText="Public key of your community Grape Verification Space account (space PDA), not a wallet."
                          />
                        </Grid>
                      )}

                      {createForm.criteriaKind === "combined" && (
                        <Grid size={{ xs: 12 }}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={createForm.requireWalletLink}
                                onChange={(event) =>
                                  updateCreateForm("requireWalletLink", event.target.checked)
                                }
                              />
                            }
                            label="Require wallet link to verified identity"
                          />
                        </Grid>
                      )}

                      {createForm.criteriaKind === "timeLockedReputation" && (
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            fullWidth
                            label="Minimum Hold Duration (seconds)"
                            value={createForm.minHoldDurationSeconds}
                            onChange={(event) =>
                              updateCreateForm("minHoldDurationSeconds", event.target.value)
                            }
                            helperText="How long reputation must be held before passing."
                          />
                        </Grid>
                      )}

                      {createForm.criteriaKind === "multiDao" && (
                        <>
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              fullWidth
                              label="Required Access Spaces (comma-separated public keys)"
                              value={createForm.requiredGates}
                              onChange={(event) =>
                                updateCreateForm("requiredGates", event.target.value)
                              }
                              helperText="Access IDs to combine in this meta-access rule."
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={createForm.requireAll}
                                  onChange={(event) =>
                                    updateCreateForm("requireAll", event.target.checked)
                                  }
                                />
                              }
                              label="Require all listed gates (disable for any one gate)"
                            />
                          </Grid>
                        </>
                      )}

                      {createForm.criteriaKind === "tokenHolding" && (
                        <>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                              fullWidth
                              label="Mint"
                              value={createForm.mint}
                              onChange={(event) => updateCreateForm("mint", event.target.value)}
                              helperText="Token mint public key to check."
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                              fullWidth
                              label="Min Amount"
                              value={createForm.minAmount}
                              onChange={(event) => updateCreateForm("minAmount", event.target.value)}
                              helperText="Minimum token balance required."
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 3 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={createForm.checkAta}
                                  onChange={(event) =>
                                    updateCreateForm("checkAta", event.target.checked)
                                  }
                                />
                              }
                              label="Check ATA (associated token account)"
                            />
                          </Grid>
                        </>
                      )}

                      {createForm.criteriaKind === "nftCollection" && (
                        <>
                          <Grid size={{ xs: 12, sm: 8 }}>
                            <TextField
                              fullWidth
                              label="Collection Mint"
                              value={createForm.collectionMint}
                              onChange={(event) =>
                                updateCreateForm("collectionMint", event.target.value)
                              }
                              helperText="Collection mint public key for NFT membership."
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Min Count"
                              value={createForm.minCount}
                              onChange={(event) => updateCreateForm("minCount", event.target.value)}
                              helperText="Minimum NFTs required."
                            />
                          </Grid>
                        </>
                      )}

                      {createForm.criteriaKind === "customProgram" && (
                        <>
                          <Grid size={{ xs: 12, sm: 8 }}>
                            <TextField
                              fullWidth
                              label="Program ID"
                              value={createForm.programId}
                              onChange={(event) => updateCreateForm("programId", event.target.value)}
                              helperText="Custom program to run during gate evaluation."
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              label="Instruction Data (hex)"
                              value={createForm.instructionDataHex}
                              onChange={(event) =>
                                updateCreateForm("instructionDataHex", event.target.value)
                              }
                              helperText="Hex-encoded instruction payload (optional)."
                            />
                          </Grid>
                        </>
                      )}

                      {createForm.gateTypeKind === "timeLimited" && (
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            fullWidth
                            label="Duration Seconds"
                            value={createForm.durationSeconds}
                            onChange={(event) =>
                              updateCreateForm("durationSeconds", event.target.value)
                            }
                            helperText="How long a successful access stays valid."
                          />
                        </Grid>
                      )}

                      {createForm.gateTypeKind === "subscription" && (
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            fullWidth
                            label="Interval Seconds"
                            value={createForm.intervalSeconds}
                            onChange={(event) =>
                              updateCreateForm("intervalSeconds", event.target.value)
                            }
                            helperText="Renewal interval for subscription-style access."
                          />
                        </Grid>
                      )}
                    </Grid>

                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Button variant="outlined" onClick={() => setCreateStep(0)}>
                        Back
                      </Button>
                      <Button variant="contained" onClick={() => setCreateStep(2)}>
                        Next: Review
                      </Button>
                    </Stack>
                  </Stack>
                )}

                {createStep === 2 && (
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">
                      {isEditMode
                        ? "Review the criteria update payload, then apply it to the selected gate."
                        : "Review this payload, then initialize the gate on-chain."}
                    </Typography>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        maxHeight: 320,
                        overflow: "auto",
                        backgroundColor: "rgba(10, 16, 30, 0.92)",
                        borderColor: "rgba(109, 184, 255, 0.24)"
                      }}
                    >
                      <Typography
                        component="pre"
                        className="mono"
                        sx={{ m: 0, fontSize: "0.78rem", color: "text.primary" }}
                      >
                        {JSON.stringify(gateBuilderPreview, null, 2)}
                      </Typography>
                    </Paper>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                      <Button variant="outlined" onClick={() => setCreateStep(1)}>
                        Back
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => void copyText(JSON.stringify(gateBuilderPreview, null, 2))}
                      >
                        Copy Payload
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleGateBuilderSubmit}
                        disabled={
                          createBusy ||
                          metadataUploadBusy ||
                          adminBusy === "updateCriteria" ||
                          !isWalletConnected ||
                          !connection ||
                          (isEditMode && (!editorGateId || !canAttemptSelectedGateWrite))
                        }
                        startIcon={
                          createBusy || adminBusy === "updateCriteria" ? (
                            <CircularProgress size={16} color="inherit" />
                          ) : (
                            <ShieldRoundedIcon />
                          )
                        }
                      >
                        {isEditMode
                          ? adminBusy === "updateCriteria"
                            ? "Updating Criteria..."
                            : "Update Gate Criteria"
                          : createBusy
                            ? "Initializing..."
                            : "Initialize Gate"}
                      </Button>
                    </Stack>
                    {isEditMode && isWalletConnected && selectedGateAuthority && !isSelectedGateAuthority && (
                      <Alert severity="warning">
                        Connected wallet is not the authority for this selected gate (expected{" "}
                        <span className="mono">{selectedGateAuthority}</span>).
                      </Alert>
                    )}
                    {!isWalletConnected && (
                      <Alert severity="info">
                        Connect a wallet to submit this on-chain action.
                      </Alert>
                    )}
                  </Stack>
                )}
              </Stack>
            )}

            {tab === 1 && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 7 }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Member portal: check your own access.</Typography>
                    {!isWalletConnected && (
                      <Alert severity="info">
                        Connect your wallet first, then enter the gate ID shared by your community.
                      </Alert>
                    )}
                    <TextField
                      fullWidth
                      label="Gate ID"
                      value={memberForm.gateId}
                      onChange={(event) => setMemberGateId(event.target.value)}
                      helperText="Public key of the gate your community uses."
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                      <Button
                        variant="outlined"
                        onClick={() => void handleAutoDeriveMemberAccounts()}
                        disabled={memberDeriveBusy || !memberForm.gateId || !isWalletConnected || !connection}
                      >
                        {memberDeriveBusy ? "Deriving..." : "Auto-Derive Accounts"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => void copyMemberShareLink()}
                        disabled={!memberForm.gateId}
                      >
                        Copy Share Link
                      </Button>
                    </Stack>
                    <Alert severity={memberDerive.status === "error" ? "error" : "info"}>
                      {memberDerive.message}
                    </Alert>
                    <TextField
                      fullWidth
                      label="Identity Value (optional)"
                      value={memberForm.identityValue}
                      onChange={(event) => updateMemberForm("identityValue", event.target.value)}
                      helperText="If your gate uses identity checks, enter your platform ID/handle so identity PDA can be derived."
                    />
                    <TextField
                      fullWidth
                      label="Reputation Account (optional)"
                      value={memberForm.reputationAccount}
                      onChange={(event) =>
                        updateMemberForm("reputationAccount", event.target.value)
                      }
                      helperText="Needed for reputation-based gate types."
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
                      helperText="Needed if the gate requires wallet-to-identity linking."
                    />
                    <TextField
                      fullWidth
                      label="Token Account (optional)"
                      value={memberForm.tokenAccount}
                      onChange={(event) => updateMemberForm("tokenAccount", event.target.value)}
                      helperText="Needed for token-holding gate types."
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
                      <Button
                        variant="outlined"
                        onClick={() => void copyText(JSON.stringify(memberPreview, null, 2))}
                      >
                        Copy My Params
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleMemberCheck}
                        disabled={memberBusy || !isWalletConnected || !connection}
                        startIcon={
                          memberBusy ? <CircularProgress size={16} color="inherit" /> : <ShieldRoundedIcon />
                        }
                      >
                        {memberBusy ? "Checking..." : "Check My Access"}
                      </Button>
                    </Stack>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, md: 5 }}>
                  <Stack spacing={2}>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        backgroundColor: "rgba(10, 16, 30, 0.92)",
                        borderColor: "rgba(109, 184, 255, 0.24)"
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        My Access Result
                      </Typography>
                      <Alert
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
                      {memberCheck.signature && (
                        <Stack direction="row" spacing={1} sx={{ mt: 1.2 }}>
                          <Button
                            size="small"
                            href={explorerLink(memberCheck.signature, cluster)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Tx
                          </Button>
                          <Button
                            size="small"
                            onClick={() => void copyText(memberCheck.signature ?? "")}
                          >
                            Copy Sig
                          </Button>
                        </Stack>
                      )}
                    </Paper>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        maxHeight: 290,
                        overflow: "auto",
                        backgroundColor: "rgba(10, 16, 30, 0.92)",
                        borderColor: "rgba(109, 184, 255, 0.24)"
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1, color: "text.primary" }}>
                        My Check Payload
                      </Typography>
                      <Typography
                        component="pre"
                        className="mono"
                        sx={{ m: 0, fontSize: "0.78rem", color: "text.primary" }}
                      >
                        {JSON.stringify(memberPreview, null, 2)}
                      </Typography>
                      {Boolean(memberCheck.response) && (
                        <>
                          <Divider sx={{ my: 1.2 }} />
                          <Typography variant="subtitle2" sx={{ mb: 1, color: "text.primary" }}>
                            Response
                          </Typography>
                          <Typography
                            component="pre"
                            className="mono"
                            sx={{ m: 0, fontSize: "0.74rem", color: "text.primary" }}
                          >
                            {JSON.stringify(memberCheck.response, null, 2)}
                          </Typography>
                        </>
                      )}
                    </Paper>
                  </Stack>
                </Grid>
              </Grid>
            )}

            {tab === 2 && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 7 }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Run live gate checks for a user wallet.</Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }}>
                      <FormControl sx={{ minWidth: 220 }}>
                        <InputLabel>Check Mode</InputLabel>
                        <Select
                          label="Check Mode"
                          value={checkAccessMode}
                          onChange={(event) => setCheckAccessMode(event.target.value as AccessCheckMode)}
                        >
                          <MenuItem value="simple">Simple</MenuItem>
                          <MenuItem value="advanced">Advanced</MenuItem>
                        </Select>
                      </FormControl>
                      {!isAdvancedCheckMode && (
                        <Typography variant="body2" color="text.secondary">
                          Provide gate + user only. Use advanced mode for manual account overrides.
                        </Typography>
                      )}
                    </Stack>
                    <TextField
                      fullWidth
                      label="Gate ID"
                      value={checkForm.gateId}
                      onChange={(event) => updateCheckForm("gateId", event.target.value)}
                      helperText="Gate public key to evaluate."
                    />
                    <TextField
                      fullWidth
                      label="User Public Key"
                      value={checkForm.user}
                      onChange={(event) => updateCheckForm("user", event.target.value)}
                      helperText="Wallet address of the user being checked."
                    />
                    {isAdvancedCheckMode && (
                      <Button
                        variant="outlined"
                        onClick={() => void handleAutoDeriveCheckAccounts()}
                        disabled={checkDeriveBusy || checkBusy || !connection || !checkForm.gateId || !checkForm.user}
                      >
                        {checkDeriveBusy ? "Deriving..." : "Auto-Derive Accounts"}
                      </Button>
                    )}
                    {(isAdvancedCheckMode || checkDerive.status !== "idle") && (
                      <Alert severity={checkDerive.status === "error" ? "error" : "info"}>
                        {checkDerive.message}
                      </Alert>
                    )}
                    {isAdvancedCheckMode && (
                      <>
                        <TextField
                          fullWidth
                          label="Reputation Account (optional)"
                          value={checkForm.reputationAccount}
                          onChange={(event) =>
                            updateCheckForm("reputationAccount", event.target.value)
                          }
                          helperText="Required only for reputation-based criteria."
                        />
                        <TextField
                          fullWidth
                          label="Identity Account (optional)"
                          value={checkForm.identityAccount}
                          onChange={(event) => updateCheckForm("identityAccount", event.target.value)}
                          helperText="Identity PDA account (not the grapeSpace config address)."
                        />
                        <TextField
                          fullWidth
                          label="Link Account (optional)"
                          value={checkForm.linkAccount}
                          onChange={(event) => updateCheckForm("linkAccount", event.target.value)}
                          helperText="Needed when wallet-link verification is enabled."
                        />
                        <TextField
                          fullWidth
                          label="Token Account (optional)"
                          value={checkForm.tokenAccount}
                          onChange={(event) => updateCheckForm("tokenAccount", event.target.value)}
                          helperText="Token account to evaluate for token-holding rules."
                        />
                      </>
                    )}
                    <FormControlLabel
                      control={
                        <Switch
                          checked={checkForm.storeRecord}
                          onChange={(event) => updateCheckForm("storeRecord", event.target.checked)}
                        />
                      }
                      label="Store gate check record on-chain"
                    />
                    {isAdvancedCheckMode ? (
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                        <Button
                          variant="outlined"
                          onClick={() => void copyText(JSON.stringify(checkPreview, null, 2))}
                        >
                          Copy Check Params
                        </Button>
                          <Button
                            variant="contained"
                            onClick={handleCheckGate}
                            disabled={
                            checkBusy ||
                            checkDeriveBusy ||
                            !isWalletConnected ||
                            !connection ||
                            !checkForm.gateId ||
                            !checkForm.user
                            }
                            startIcon={
                              checkBusy ? <CircularProgress size={16} color="inherit" /> : <ShieldRoundedIcon />
                            }
                        >
                          {checkBusy ? "Checking..." : "Run Check"}
                        </Button>
                      </Stack>
                    ) : (
                      <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        onClick={handleCheckGate}
                        disabled={
                          checkBusy ||
                          checkDeriveBusy ||
                          !isWalletConnected ||
                          !connection ||
                          !checkForm.gateId ||
                          !checkForm.user
                        }
                        startIcon={
                          checkBusy ? <CircularProgress size={18} color="inherit" /> : <ShieldRoundedIcon />
                        }
                        sx={{ py: 1.25, fontSize: "1.02rem", fontWeight: 700 }}
                      >
                        {checkBusy ? "Checking Access..." : "Check Access"}
                      </Button>
                    )}
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, md: 5 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      height: "100%",
                      backgroundColor: "rgba(10, 16, 30, 0.92)",
                      borderColor: "rgba(109, 184, 255, 0.24)"
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ mb: 1, color: "text.primary" }}>
                      Check Payload Preview
                    </Typography>
                    <Typography
                      component="pre"
                      className="mono"
                      sx={{ m: 0, fontSize: "0.78rem", color: "text.primary" }}
                    >
                      {JSON.stringify(
                        isAdvancedCheckMode
                          ? checkPreview
                          : {
                              gateId: checkForm.gateId,
                              user: checkForm.user,
                              storeRecord: checkForm.storeRecord
                            },
                        null,
                        2
                      )}
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {tab === 3 && (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Admin operations console</Typography>
                    <TextField
                      fullWidth
                      label="Authority Filter Wallet"
                      value={adminForm.authorityFilter}
                      onChange={(event) => updateAdminForm("authorityFilter", event.target.value)}
                      helperText="List gates owned by this authority wallet."
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant="contained"
                        onClick={handleLoadGatesByAuthority}
                        disabled={adminBusy !== "" || !connection}
                      >
                        {adminBusy === "loadGates" ? "Loading..." : "Load Gates"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => updateAdminForm("authorityFilter", connectedWalletAddress)}
                        disabled={!connectedWalletAddress || adminBusy !== ""}
                      >
                        Use Connected
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" className="mono">
                      RPC: {rpcDisplayLabel}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="mono">
                      Load Status: {adminLoadStatus}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="mono">
                      Last RPC Slot Probe: {adminRpcProbeSlot ?? "n/a"}
                    </Typography>

                    <Stack direction="row" spacing={1}>
                      <Paper variant="outlined" sx={{ p: 1, flex: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Loaded Gates
                        </Typography>
                        <Typography variant="h6">{adminGates.length}</Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 1, flex: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Selected Status
                        </Typography>
                        <Typography variant="h6">
                          {selectedAdminGate ? (selectedAdminGate.isActive ? "Active" : "Paused") : "None"}
                        </Typography>
                      </Paper>
                      <Paper variant="outlined" sx={{ p: 1, flex: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Pass Rate
                        </Typography>
                        <Typography variant="h6">{selectedGatePassRate ?? "--"}</Typography>
                      </Paper>
                    </Stack>

                    <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 340, overflow: "auto" }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Authority Gates ({adminGates.length})
                      </Typography>
                      <Stack spacing={1}>
                        {adminGates.length === 0 && (
                          <Typography variant="body2" color="text.secondary">
                            No gates loaded yet.
                          </Typography>
                        )}
                        {adminGates.map((gate) => (
                          <Stack key={gate.pda} direction="row" spacing={0.6} alignItems="center">
                            <Button
                              variant={adminForm.selectedGateId === gate.gateId ? "contained" : "outlined"}
                              color={gate.isActive ? "primary" : "secondary"}
                              onClick={() => updateAdminForm("selectedGateId", gate.gateId)}
                              sx={{ justifyContent: "space-between", flex: 1 }}
                            >
                              <Box component="span" className="mono" sx={{ fontSize: "0.72rem" }}>
                                {gate.gateId.slice(0, 8)}...{gate.gateId.slice(-6)}
                              </Box>
                              <Box component="span" sx={{ fontSize: "0.72rem" }}>
                                {gate.statsLabel}
                              </Box>
                            </Button>
                            <Tooltip title="Copy member link">
                              <IconButton
                                size="small"
                                onClick={() => void copyMemberShareLinkForGate(gate.gateId)}
                              >
                                <ContentCopyRoundedIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        ))}
                      </Stack>
                    </Paper>
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, md: 8 }}>
                  <Stack spacing={2}>
                    {!isWalletConnected && (
                      <Alert severity="info">
                        You can load/fetch gates in read-only mode. Connect wallet only for write actions.
                      </Alert>
                    )}
                    {isWalletConnected && selectedGateAuthority && !isSelectedGateAuthority && (
                      <Alert severity="warning">
                        Connected wallet is not the authority for this gate. Switch to{" "}
                        <Box component="span" className="mono">
                          {selectedGateAuthority}
                        </Box>{" "}
                        to perform write actions.
                      </Alert>
                    )}
                    {isAdminWalletConnected && (
                      <Alert severity="success">
                        Emergency admin wallet connected. Emergency Close is enabled.
                      </Alert>
                    )}

                    <TextField
                      fullWidth
                      label="Selected Gate ID"
                      value={adminForm.selectedGateId}
                      onChange={(event) => updateAdminForm("selectedGateId", event.target.value)}
                      helperText="Paste gate ID manually if it does not appear in the authority list."
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                      <Button
                        variant="outlined"
                        onClick={() => void copyMemberShareLinkForGate(adminForm.selectedGateId)}
                        disabled={!adminForm.selectedGateId}
                      >
                        Copy Member Link
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => openMemberPortalForGate(adminForm.selectedGateId)}
                        disabled={!adminForm.selectedGateId}
                      >
                        Open User Page
                      </Button>
                    </Stack>
                    <TextField
                      fullWidth
                      label="Member Link Preview"
                      value={selectedGateShareLink}
                      InputProps={{ readOnly: true }}
                      helperText="Share this link with community members so gate ID is prefilled."
                    />
                    <FormControl fullWidth>
                      <InputLabel>Choose From Loaded Gates</InputLabel>
                      <Select
                        label="Choose From Loaded Gates"
                        value={
                          adminGates.some((gate) => gate.gateId === adminForm.selectedGateId)
                            ? adminForm.selectedGateId
                            : ""
                        }
                        onChange={(event) => updateAdminForm("selectedGateId", event.target.value)}
                      >
                        <MenuItem value="" disabled>
                          {adminGates.length ? "Select a loaded gate" : "No gates loaded"}
                        </MenuItem>
                        {adminGates.map((gate) => (
                          <MenuItem key={gate.pda} value={gate.gateId}>
                            {gate.gateId}
                          </MenuItem>
                        ))}
                      </Select>
                      <FormHelperText>Optional quick picker from the loaded gate list.</FormHelperText>
                    </FormControl>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                      <Button
                        variant="outlined"
                        onClick={handleFetchGateDetails}
                        disabled={adminBusy !== "" || !adminForm.selectedGateId}
                      >
                        {adminBusy === "fetchGate" ? "Fetching..." : "Fetch Gate Details"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleLoadSelectedGateIntoEditor}
                        disabled={adminBusy !== "" || !adminForm.selectedGateId}
                      >
                        {adminBusy === "loadEditor" ? "Loading Editor..." : "Load Into Editor"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleLoadGateUsers}
                        disabled={adminBusy !== "" || !adminForm.selectedGateId || !connection}
                      >
                        {adminBusy === "loadUsers" ? "Loading Users..." : "Load Connected Users"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleUpdateGateCriteria}
                        disabled={
                          adminBusy !== "" ||
                          !adminForm.selectedGateId ||
                          !isWalletConnected ||
                          !canAttemptSelectedGateWrite
                        }
                      >
                        {adminBusy === "updateCriteria"
                          ? "Updating..."
                          : "Update Criteria (from Create form)"}
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Use "Load Into Editor" to prefill Gate Builder fields, then update criteria from this panel.
                    </Typography>

                    <TextField
                      fullWidth
                      label="Metadata URI"
                      value={adminForm.metadataUri}
                      onChange={(event) => updateAdminForm("metadataUri", event.target.value)}
                      helperText="Update on-chain metadata URI for this gate/access."
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                      <Button
                        variant="outlined"
                        onClick={handleUpdateMetadataUri}
                        disabled={
                          adminBusy !== "" ||
                          !adminForm.selectedGateId ||
                          !isWalletConnected ||
                          !canAttemptSelectedGateWrite
                        }
                      >
                        {adminBusy === "updateMetadataUri" ? "Updating..." : "Update Metadata URI"}
                      </Button>
                    </Stack>

                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack spacing={2}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems="center">
                          <FormControlLabel
                            control={
                              <Switch
                                checked={adminForm.setActiveValue}
                                onChange={(event) =>
                                  updateAdminForm("setActiveValue", event.target.checked)
                                }
                              />
                            }
                            label="Gate active"
                          />
                          <Button
                            variant="contained"
                            onClick={handleSetGateActive}
                            disabled={
                              adminBusy !== "" ||
                              !adminForm.selectedGateId ||
                              !isWalletConnected ||
                              !canAttemptSelectedGateWrite
                            }
                          >
                            {adminBusy === "setActive" ? "Applying..." : "Apply Active State"}
                          </Button>
                        </Stack>

                        <TextField
                          fullWidth
                          label="New Authority Wallet"
                          value={adminForm.newAuthority}
                          onChange={(event) => updateAdminForm("newAuthority", event.target.value)}
                          helperText="Transfer gate control to another authority wallet."
                        />
                        <Button
                          variant="outlined"
                          onClick={() => setAdminConfirmAction("setAuthority")}
                          disabled={
                            adminBusy !== "" ||
                            !adminForm.selectedGateId ||
                            !adminForm.newAuthority ||
                            !isWalletConnected ||
                            !canAttemptSelectedGateWrite
                          }
                        >
                          {adminBusy === "setAuthority" ? "Transferring..." : "Set New Authority"}
                        </Button>

                        <Divider />

                        <TextField
                          fullWidth
                          label="Close Recipient (Optional)"
                          value={adminForm.closeRecipient}
                          onChange={(event) => updateAdminForm("closeRecipient", event.target.value)}
                          helperText="Wallet to receive reclaimed rent when closing accounts."
                        />
                        <TextField
                          fullWidth
                          label="Check Record User Wallet"
                          value={adminForm.closeRecordUser}
                          onChange={(event) =>
                            updateAdminForm("closeRecordUser", event.target.value)
                          }
                          helperText="Required only when closing a specific check record."
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                          <Button
                            variant="outlined"
                            color="warning"
                            onClick={() => setAdminConfirmAction("closeRecord")}
                            disabled={
                              adminBusy !== "" ||
                              !adminForm.selectedGateId ||
                              !adminForm.closeRecordUser ||
                              !isWalletConnected ||
                              !canAttemptSelectedGateWrite
                            }
                          >
                            {adminBusy === "closeRecord" ? "Closing..." : "Close Check Record"}
                          </Button>
                          <Button
                            variant="contained"
                            color="warning"
                            onClick={() => setAdminConfirmAction("closeGate")}
                            disabled={
                              adminBusy !== "" ||
                              !adminForm.selectedGateId ||
                              !isWalletConnected ||
                              !canAttemptSelectedGateWrite
                            }
                          >
                            {adminBusy === "closeGate" ? "Closing..." : "Close Gate"}
                          </Button>
                          {isAdminWalletConnected && (
                            <Button
                              variant="contained"
                              color="error"
                              onClick={() => setAdminConfirmAction("emergencyCloseGate")}
                              disabled={adminBusy !== "" || !adminForm.selectedGateId || !isWalletConnected}
                            >
                              {adminBusy === "emergencyCloseGate"
                                ? "Emergency Closing..."
                                : "Emergency Close (Admin)"}
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    </Paper>

                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        maxHeight: 280,
                        overflow: "auto",
                        backgroundColor: "rgba(10, 16, 30, 0.92)",
                        borderColor: "rgba(109, 184, 255, 0.24)"
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1, color: "text.primary" }}>
                        Gate Details
                      </Typography>
                      <Typography
                        component="pre"
                        className="mono"
                        sx={{ m: 0, fontSize: "0.78rem", color: "text.primary" }}
                      >
                        {adminGateDetails
                          ? JSON.stringify(adminGateDetails, null, 2)
                          : "No gate details loaded."}
                      </Typography>
                    </Paper>
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 2,
                        maxHeight: 320,
                        overflow: "auto",
                        backgroundColor: "rgba(10, 16, 30, 0.92)",
                        borderColor: "rgba(109, 184, 255, 0.24)"
                      }}
                    >
                      <Stack spacing={1.2}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Typography variant="subtitle2" sx={{ color: "text.primary" }}>
                            Connected Users
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {adminGateUsers.length} loaded
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {adminGateUsersStatus}
                        </Typography>
                        {adminGateUsers.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            Press "Load Connected Users" to fetch latest stored check records.
                          </Typography>
                        ) : (
                          <Stack spacing={0.8}>
                            {adminGateUsers.map((entry) => (
                              <Paper key={`${entry.pda}-${entry.user}`} variant="outlined" sx={{ p: 1, borderRadius: 1 }}>
                                <Stack direction="row" justifyContent="space-between" spacing={1}>
                                  <Typography
                                    className="mono"
                                    sx={{ fontSize: "0.72rem", color: "text.primary", wordBreak: "break-all" }}
                                  >
                                    {entry.user}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color={entry.passed ? "success.light" : "warning.light"}
                                  >
                                    {entry.passed ? "PASS" : "FAIL"}
                                  </Typography>
                                </Stack>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  spacing={0.6}
                                  sx={{ mt: 0.55 }}
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    Checked: {entry.checkedAtLabel}
                                  </Typography>
                                  <Button
                                    size="small"
                                    href={
                                      entry.pda.startsWith("tx:")
                                        ? explorerLink(entry.pda.slice(3), cluster)
                                        : explorerAddressLink(entry.pda, cluster)
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    sx={{
                                      minWidth: 0,
                                      px: 0.5,
                                      py: 0,
                                      lineHeight: 1.4,
                                      fontSize: "0.72rem",
                                      textTransform: "none"
                                    }}
                                  >
                                    Explorer
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() => updateAdminForm("closeRecordUser", entry.user)}
                                    sx={{
                                      minWidth: 0,
                                      px: 0.5,
                                      py: 0,
                                      lineHeight: 1.4,
                                      fontSize: "0.72rem",
                                      textTransform: "none"
                                    }}
                                  >
                                    Use for close
                                  </Button>
                                </Stack>
                              </Paper>
                            ))}
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  </Stack>
                </Grid>
              </Grid>
            )}

            {tab === 4 && (
              <Stack spacing={1.5}>
                <Typography variant="h6">Community onboarding flow</Typography>
                <Divider />
                <Typography>
                  1. Connect an admin (authority) wallet and choose the correct network before managing gates.
                </Typography>
                <Typography>
                  2. Pick a template for your access policy so moderators avoid manual configuration errors.
                </Typography>
                <Typography>
                  3. Fill only the fields shown for that criteria type. Hidden fields are not needed.
                </Typography>
                <Typography>
                  4. Review payloads, copy them for audit logs, then run on-chain initialization.
                </Typography>
                <Typography>
                  5. Share deep links like <span className="mono">/access?gateId=...</span> so members land directly on the user page.
                </Typography>
                <Typography>
                  6. Members can use Auto-Derive Accounts to avoid manually entering PDA addresses.
                </Typography>
                <Typography>
                  7. Use the Check Access tab for moderator debugging and advanced account overrides.
                </Typography>
              </Stack>
            )}
          </Paper>
        </Grid>

        {activity.length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Paper className="panel" sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Activity
              </Typography>
              <Stack spacing={1.4}>
                {activity.slice(0, 5).map((item) => (
                  <Paper key={`${item.createdAt}-${item.label}`} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between">
                      <Box>
                        <Typography variant="subtitle2">{item.label}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.message}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography className="mono" sx={{ fontSize: "0.76rem", color: "text.secondary" }}>
                          {new Date(item.createdAt).toLocaleString()}
                        </Typography>
                        {item.signature && (
                          <Stack
                            direction="row"
                            spacing={0.8}
                            justifyContent={{ xs: "flex-start", md: "flex-end" }}
                          >
                            <Button
                              size="small"
                              href={explorerLink(item.signature, cluster)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View
                            </Button>
                            <Button size="small" onClick={() => void copyText(item.signature ?? "")}>
                              Copy Sig
                            </Button>
                          </Stack>
                        )}
                      </Box>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}
      </Grid>

      <Dialog
        open={Boolean(adminConfirmAction)}
        onClose={() => setAdminConfirmAction("")}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{adminConfirmCopy?.title ?? "Confirm Action"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>
            {adminConfirmCopy?.body}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdminConfirmAction("")}>Cancel</Button>
          <Button
            variant="contained"
            color={
              adminConfirmAction === "emergencyCloseGate"
                ? "error"
                : adminConfirmAction === "closeGate" || adminConfirmAction === "closeRecord"
                  ? "warning"
                  : "primary"
            }
            onClick={() => void confirmAdminAction()}
            disabled={adminBusy !== ""}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Connection Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Network</InputLabel>
              <Select
                value={cluster}
                label="Network"
                onChange={(event) => setCluster(event.target.value as ClusterKind)}
              >
                <MenuItem value="devnet">Devnet</MenuItem>
                <MenuItem value="testnet">Testnet</MenuItem>
                <MenuItem value="mainnet-beta">Mainnet Beta (Shyft Preferred)</MenuItem>
                <MenuItem value="custom">Custom RPC</MenuItem>
              </Select>
              <FormHelperText>Select the Solana cluster this console should use.</FormHelperText>
            </FormControl>
            <TextField
              fullWidth
              label={cluster === "custom" ? "RPC Endpoint" : "RPC Provider"}
              value={cluster === "custom" ? customRpc : rpcDisplayLabel}
              onChange={(event) => setCustomRpc(event.target.value)}
              disabled={cluster !== "custom"}
              helperText={
                cluster === "custom"
                  ? "Paste the full URL of your preferred RPC provider."
                  : cluster === "mainnet-beta"
                    ? "Using preferred Shyft mainnet RPC (URL hidden)."
                    : "Auto-filled from the selected Solana network."
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity={snackbarSeverity} onClose={() => setSnackbarOpen(false)}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
}
