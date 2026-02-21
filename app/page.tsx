"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { AnchorProvider } from "@coral-xyz/anchor";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Keypair, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import * as GPassSdk from "@grapenpm/gpass-sdk";

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
  | "fetchGate"
  | "setActive"
  | "setAuthority"
  | "updateCriteria"
  | "closeGate"
  | "closeRecord";

type AdminConfirmAction = "" | "setAuthority" | "closeGate" | "closeRecord";

const {
  GPASS_PROGRAM_ID,
  GRAPE_VERIFICATION_PROGRAM_ID,
  VINE_REPUTATION_PROGRAM_ID,
  VerificationPlatform,
  GateCriteriaFactory,
  GateTypeFactory,
  findVineReputationPda,
  findGrapeIdentityPda,
  findGrapeLinkPda
} = GPassSdk;

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

const createSteps = ["Choose Template", "Configure Gate", "Review & Execute"];

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
  { label: "Discord", value: VerificationPlatform.Discord as number },
  { label: "Telegram", value: VerificationPlatform.Telegram as number },
  { label: "Twitter", value: VerificationPlatform.Twitter as number },
  { label: "Email", value: VerificationPlatform.Email as number }
];

const defaultCreateForm: CreateFormState = {
  gateId: "",
  authority: "",
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

async function resolveSdkClient(connection: Connection, wallet: WalletProvider) {
  const sdkAny = GPassSdk as Record<string, unknown>;
  const GpassClientCtor = sdkAny.GpassClient as
    | (new (...args: unknown[]) => unknown)
    | undefined;

  if (typeof GpassClientCtor !== "function") {
    throw new Error(
      "Installed SDK does not export GpassClient. Please update @grapenpm/gpass-sdk."
    );
  }

  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Connected wallet does not support transaction signing.");
  }

  const signAllTransactions =
    wallet.signAllTransactions ??
    (async (transactions: Transaction[]) =>
      Promise.all(transactions.map((tx) => wallet.signTransaction!(tx))));

  const anchorWallet: AnchorCompatibleWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction,
    signAllTransactions
  };

  const provider = new AnchorProvider(connection, anchorWallet as any, {
    commitment: "confirmed"
  });

  return new GpassClientCtor(provider, GPASS_PROGRAM_ID);
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
  const methodName = action === "create" ? "initializeGate" : "checkGate";
  const method = clientAny[methodName] as ((arg: unknown) => unknown) | undefined;

  if (typeof method !== "function") {
    throw new Error(
      `SDK client is missing ${methodName}. Please verify @grapenpm/gpass-sdk version.`
    );
  }

  return await Promise.resolve(method.call(client, params));
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

export default function Page() {
  const wallet = useWallet();
  const [tab, setTab] = useState(0);
  const [createStep, setCreateStep] = useState(0);
  const [templateId, setTemplateId] = useState(templates[0].id);

  const [cluster, setCluster] = useState<ClusterKind>("devnet");
  const [customRpc, setCustomRpc] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [createForm, setCreateForm] = useState<CreateFormState>({
    ...defaultCreateForm,
    ...templates[0].defaults,
    criteriaKind: templates[0].criteriaKind,
    gateTypeKind: templates[0].gateTypeKind
  });
  const [checkForm, setCheckForm] = useState<CheckFormState>(defaultCheckForm);
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
  const [adminGateDetails, setAdminGateDetails] = useState<Record<string, unknown> | null>(null);

  const [createBusy, setCreateBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberDeriveBusy, setMemberDeriveBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState<AdminBusyAction>("");
  const [adminConfirmAction, setAdminConfirmAction] = useState<AdminConfirmAction>("");
  const deepLinkGateIdRef = useRef("");

  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error" | "info">(
    "info"
  );

  useEffect(() => {
    if (typeof window !== "undefined" && !window.Buffer) {
      window.Buffer = Buffer;
    }
  }, []);

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

    const applyDeepLinkFromLocation = () => {
      const gateIdFromQuery =
        new URLSearchParams(window.location.search).get("gateId")?.trim() ?? "";
      if (!gateIdFromQuery || deepLinkGateIdRef.current === gateIdFromQuery) {
        return;
      }

      try {
        new PublicKey(gateIdFromQuery);
      } catch {
        return;
      }

      deepLinkGateIdRef.current = gateIdFromQuery;
      setMemberForm((prev) => ({ ...prev, gateId: gateIdFromQuery }));
      setCheckForm((prev) => ({ ...prev, gateId: prev.gateId || gateIdFromQuery }));
      setTab(1);
    };

    applyDeepLinkFromLocation();
    window.addEventListener("popstate", applyDeepLinkFromLocation);
    return () => {
      window.removeEventListener("popstate", applyDeepLinkFromLocation);
    };
  }, []);

  const rpcEndpoint = useMemo(() => {
    if (cluster === "custom") {
      return customRpc.trim();
    }
    return clusterApiUrl(cluster);
  }, [cluster, customRpc]);

  const connection = useMemo(() => {
    if (!rpcEndpoint) {
      return null;
    }
    return new Connection(rpcEndpoint, "confirmed");
  }, [rpcEndpoint]);

  const isWalletConnected = Boolean(wallet.connected && wallet.publicKey);
  const connectedWalletAddress = wallet.publicKey?.toBase58() ?? "";
  const selectedAdminGate = useMemo(
    () => adminGates.find((gate) => gate.gateId === adminForm.selectedGateId),
    [adminGates, adminForm.selectedGateId]
  );
  const isSelectedGateAuthority = Boolean(
    selectedAdminGate && connectedWalletAddress && selectedAdminGate.authority === connectedWalletAddress
  );
  const selectedGatePassRate = useMemo(() => {
    if (!selectedAdminGate) {
      return null;
    }
    const total = Number.parseInt(selectedAdminGate.totalChecks, 10);
    const passed = Number.parseInt(selectedAdminGate.successfulChecks, 10);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(passed) || passed < 0) {
      return "0%";
    }
    return `${Math.round((passed / total) * 100)}%`;
  }, [selectedAdminGate]);

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
      }
    }),
    [createForm]
  );

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

  const appendActivity = (entry: { label: string; message: string; signature?: string }) => {
    setActivity((prev) => [{ ...entry, createdAt: Date.now() }, ...prev]);
  };

  const getAdminClient = async () => {
    if (!wallet.publicKey || !connection) {
      throw new Error("Connect wallet and choose a valid RPC endpoint first.");
    }

    return (await resolveSdkClient(
      connection,
      wallet as unknown as WalletProvider
    )) as Record<string, unknown>;
  };

  const getMemberClient = async () => {
    if (!wallet.publicKey || !connection) {
      throw new Error("Connect wallet and choose a valid RPC endpoint first.");
    }

    return (await resolveSdkClient(
      connection,
      wallet as unknown as WalletProvider
    )) as Record<string, unknown>;
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

  const copyMemberShareLink = async () => {
    const gateId = memberForm.gateId.trim();
    if (!gateId) {
      notify("Enter a gate ID before copying a share link.", "error");
      return;
    }
    try {
      parsePublicKey("Gate ID", gateId, true);
      if (typeof window === "undefined") {
        throw new Error("Window unavailable.");
      }
      const url = new URL(window.location.href);
      url.searchParams.set("gateId", gateId);
      await navigator.clipboard.writeText(url.toString());
      notify("Share link copied.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to copy share link.", "error");
    }
  };

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
      const fetchGateMethod = client.fetchGate as ((input: PublicKey) => Promise<unknown>) | undefined;

      if (typeof fetchGateMethod !== "function") {
        throw new Error("SDK client is missing fetchGate.");
      }

      const gate = await fetchGateMethod.call(client, gateId);
      if (!gate || typeof gate !== "object") {
        throw new Error("Gate not found for this gate ID.");
      }

      const gateObj = gate as Record<string, unknown>;
      const criteriaVariant = extractCriteriaVariant(gateObj.criteria);
      if (!criteriaVariant) {
        throw new Error("Could not read gate criteria for auto-derivation.");
      }

      const updates: Partial<MemberFormState> = {};
      const notes: string[] = [];
      let derivedCount = 0;
      let selectedIdentity = asPublicKeyValue(memberForm.identityAccount);

      if (
        criteriaVariant.type === "minReputation" ||
        criteriaVariant.type === "timeLockedReputation" ||
        criteriaVariant.type === "combined"
      ) {
        const vineConfig = asPublicKeyValue(criteriaVariant.config.vineConfig);
        const season = asNumberValue(criteriaVariant.config.season);
        if (vineConfig && season !== undefined) {
          const [reputationPda] = await findVineReputationPda(
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
        const grapeSpace = asPublicKeyValue(criteriaVariant.config.grapeSpace);
        const platforms = normalizePlatforms(criteriaVariant.config.platforms);

        if (!selectedIdentity) {
          const identityValue = memberForm.identityValue.trim();
          if (grapeSpace && identityValue) {
            const idHash = await sha256Text(identityValue);
            const platformCandidates = platforms.length > 0 ? platforms : [0];

            let fallbackIdentity: PublicKey | undefined;
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

            if (!selectedIdentity && fallbackIdentity) {
              selectedIdentity = fallbackIdentity;
              notes.push("Identity PDA derived but account existence was not confirmed.");
            }
          } else {
            notes.push("Identity needs an identity value to derive automatically.");
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
          if (!selectedIdentity) {
            notes.push("Link PDA derivation needs a resolved identity account.");
          } else {
            const walletHashCandidates: Uint8Array[] = [];
            const firstHash = await sha256Bytes(wallet.publicKey.toBytes());
            walletHashCandidates.push(firstHash);
            const secondHash = await sha256Text(wallet.publicKey.toBase58());
            if (!Buffer.from(secondHash).equals(Buffer.from(firstHash))) {
              walletHashCandidates.push(secondHash);
            }

            let selectedLink: PublicKey | undefined;
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

            if (selectedLink) {
              const nextLink = selectedLink.toBase58();
              updates.linkAccount = nextLink;
              if (nextLink !== memberForm.linkAccount.trim()) {
                derivedCount += 1;
              }
            } else {
              notes.push("Could not derive a link PDA for this wallet.");
            }
          }
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

      setMemberForm((prev) => ({ ...prev, ...updates }));
      const mergedForm = { ...memberForm, ...updates };
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
    notify("Generated a new Gate ID.", "success");
  };

  const buildCriteria = () => {
    const platforms = createForm.selectedPlatforms;

    switch (createForm.criteriaKind) {
      case "minReputation":
        return GateCriteriaFactory.minReputation({
          vineConfig: parsePublicKey("OG reputation config", createForm.vineConfig, true)!,
          minPoints: parseInteger("Minimum points", createForm.minPoints, 0),
          season: parseInteger("Season", createForm.season, 0)
        } as any);
      case "verifiedIdentity":
        return GateCriteriaFactory.verifiedIdentity({
          grapeSpace: parsePublicKey("Grape space", createForm.grapeSpace, true)!,
          platforms
        } as any);
      case "verifiedWithWallet":
        return GateCriteriaFactory.verifiedWithWallet({
          grapeSpace: parsePublicKey("Grape space", createForm.grapeSpace, true)!,
          platforms
        } as any);
      case "combined":
        return GateCriteriaFactory.combined({
          vineConfig: parsePublicKey("OG reputation config", createForm.vineConfig, true)!,
          minPoints: parseInteger("Minimum points", createForm.minPoints, 0),
          season: parseInteger("Season", createForm.season, 0),
          grapeSpace: parsePublicKey("Grape space", createForm.grapeSpace, true)!,
          platforms,
          requireWalletLink: createForm.requireWalletLink
        } as any);
      case "timeLockedReputation":
        return GateCriteriaFactory.timeLockedReputation({
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
        return GateCriteriaFactory.multiDao({
          requiredGates: splitCsv(createForm.requiredGates).map((gate, index) =>
            parsePublicKey(`Required gate #${index + 1}`, gate, true)!
          ),
          requireAll: createForm.requireAll
        } as any);
      case "tokenHolding":
        return GateCriteriaFactory.tokenHolding({
          mint: parsePublicKey("Token mint", createForm.mint, true)!,
          minAmount: parseInteger("Minimum amount", createForm.minAmount, 0),
          checkAta: createForm.checkAta
        } as any);
      case "nftCollection":
        return GateCriteriaFactory.nftCollection({
          collectionMint: parsePublicKey("Collection mint", createForm.collectionMint, true)!,
          minCount: parseInteger("Minimum count", createForm.minCount, 1)
        } as any);
      case "customProgram":
        return GateCriteriaFactory.customProgram({
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
        return GateTypeFactory.singleUse();
      case "reusable":
        return GateTypeFactory.reusable();
      case "timeLimited":
        return GateTypeFactory.timeLimited(
          parseInteger("Duration seconds", createForm.durationSeconds, 1)
        );
      case "subscription":
        return GateTypeFactory.subscription(
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
        gateId: parsePublicKey("Gate ID", createForm.gateId, true)!,
        criteria: buildCriteria(),
        gateType: buildGateType(),
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
      const params = {
        gateId: parsePublicKey("Gate ID", checkForm.gateId, true)!,
        user: parsePublicKey("User", checkForm.user, true)!,
        reputationAccount: parsePublicKey(
          "Reputation account",
          checkForm.reputationAccount,
          false
        ),
        identityAccount: parsePublicKey("Identity account", checkForm.identityAccount, false),
        linkAccount: parsePublicKey("Link account", checkForm.linkAccount, false),
        tokenAccount: parsePublicKey("Token account", checkForm.tokenAccount, false),
        storeRecord: checkForm.storeRecord
      };

      const result = await executeSdkMethod({
        action: "check",
        params,
        connection,
        wallet: wallet as unknown as WalletProvider
      });

      const signature = extractSignature(result);
      setActivity((prev) => [
        {
          label: "Check Gate",
          message: signature ? "Check submitted." : "Check completed.",
          signature,
          createdAt: Date.now()
        },
        ...prev
      ]);

      notify(signature ? `Check submitted. Signature: ${signature}` : "Check completed.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to check gate.", "error");
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
      const effectiveForm = derivedForm ?? memberForm;

      const params = {
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

      const result = await executeSdkMethod({
        action: "check",
        params,
        connection,
        wallet: wallet as unknown as WalletProvider
      });

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
      const message = error instanceof Error ? error.message : "Failed to check member access.";
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

    const client = await getAdminClient();
    const method = client.fetchGatesByAuthority as
      | ((authorityKey: PublicKey) => Promise<unknown[]>)
      | undefined;

    if (typeof method !== "function") {
      throw new Error("SDK client is missing fetchGatesByAuthority.");
    }

    const gates = await method.call(client, authority);
    const mapped: AdminGateItem[] = (Array.isArray(gates) ? gates : []).map((entry: any) => {
      const account = entry.account ?? {};
      return {
        pda:
          entry.publicKey && typeof entry.publicKey.toBase58 === "function"
            ? entry.publicKey.toBase58()
            : "",
        gateId:
          account.gateId && typeof account.gateId.toBase58 === "function"
            ? account.gateId.toBase58()
            : "",
        authority:
          account.authority && typeof account.authority.toBase58 === "function"
            ? account.authority.toBase58()
            : "",
        isActive: Boolean(account.isActive),
        totalChecks:
          account.totalChecks && typeof account.totalChecks.toString === "function"
            ? account.totalChecks.toString()
            : "0",
        successfulChecks:
          account.successfulChecks && typeof account.successfulChecks.toString === "function"
            ? account.successfulChecks.toString()
            : "0"
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
      notify(`Loaded ${mapped.length} gate(s).`, "success");
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
    const client = await getAdminClient();
    const method = client.fetchGate as ((gate: PublicKey) => Promise<unknown>) | undefined;

    if (typeof method !== "function") {
      throw new Error("SDK client is missing fetchGate.");
    }

    const gate = await method.call(client, gateId);
    if (!gate) {
      setAdminGateDetails(null);
      if (showSuccessToast) {
        notify("Gate not found.", "info");
      }
      return null;
    }

    const display = toDisplayValue(gate) as Record<string, unknown>;
    setAdminGateDetails(display);
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
    try {
      await loadGatesByAuthority();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Failed to load gates.", "error");
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

  const handleSetGateActive = async () => {
    setAdminBusy("setActive");
    try {
      if (!isSelectedGateAuthority) {
        throw new Error("Connected wallet is not the authority for this selected gate.");
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const client = await getAdminClient();
      const method = client.setGateActive as
        | ((params: { gateId: PublicKey; isActive: boolean }) => Promise<unknown>)
        | undefined;

      if (typeof method !== "function") {
        throw new Error("SDK client is missing setGateActive.");
      }

      const result = await method.call(client, {
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
      if (!isSelectedGateAuthority) {
        throw new Error("Connected wallet is not the authority for this selected gate.");
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const newAuthority = parsePublicKey("New authority", adminForm.newAuthority, true)!;
      const client = await getAdminClient();
      const method = client.setGateAuthority as
        | ((params: { gateId: PublicKey; newAuthority: PublicKey }) => Promise<unknown>)
        | undefined;

      if (typeof method !== "function") {
        throw new Error("SDK client is missing setGateAuthority.");
      }

      const result = await method.call(client, { gateId, newAuthority });
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
      if (!isSelectedGateAuthority) {
        throw new Error("Connected wallet is not the authority for this selected gate.");
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const client = await getAdminClient();
      const method = client.updateGateCriteria as
        | ((params: { gateId: PublicKey; newCriteria: unknown }) => Promise<unknown>)
        | undefined;

      if (typeof method !== "function") {
        throw new Error("SDK client is missing updateGateCriteria.");
      }

      const result = await method.call(client, {
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

  const handleCloseGate = async () => {
    setAdminBusy("closeGate");
    try {
      if (!isSelectedGateAuthority) {
        throw new Error("Connected wallet is not the authority for this selected gate.");
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const recipient = parsePublicKey("Close recipient", adminForm.closeRecipient, false);
      const client = await getAdminClient();
      const method = client.closeGate as
        | ((params: { gateId: PublicKey; recipient?: PublicKey }) => Promise<unknown>)
        | undefined;

      if (typeof method !== "function") {
        throw new Error("SDK client is missing closeGate.");
      }

      const result = await method.call(client, { gateId, recipient });
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

  const handleCloseCheckRecord = async () => {
    setAdminBusy("closeRecord");
    try {
      if (!isSelectedGateAuthority) {
        throw new Error("Connected wallet is not the authority for this selected gate.");
      }
      const gateId = parsePublicKey("Selected gate", adminForm.selectedGateId, true)!;
      const user = parsePublicKey("Check record user", adminForm.closeRecordUser, true)!;
      const recipient = parsePublicKey("Close recipient", adminForm.closeRecipient, false);
      const client = await getAdminClient();
      const method = client.closeCheckRecord as
        | ((params: { gateId: PublicKey; user: PublicKey; recipient?: PublicKey }) => Promise<unknown>)
        | undefined;

      if (typeof method !== "function") {
        throw new Error("SDK client is missing closeCheckRecord.");
      }

      const result = await method.call(client, { gateId, user, recipient });
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
          <Stack direction="row" spacing={1} alignItems="center">
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
                  sx={{ p: 1.1, borderRadius: 1.8, flex: 1, minWidth: 0 }}
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
            <Tabs value={tab} onChange={(_, value: number) => setTab(value)} sx={{ mb: 2 }}>
              <Tab label="Create Gate" />
              <Tab label="Member Portal" />
              <Tab label="Check Access" />
              <Tab label="Admin Console" />
              <Tab label="Community Guide" />
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
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position="end">
                                <Button
                                  variant="text"
                                  size="small"
                                  sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: "0.72rem" }}
                                  onClick={generateGateId}
                                >
                                  Generate
                                </Button>
                              </InputAdornment>
                            )
                          }}
                          helperText="Unique on-chain identifier for this gate."
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          fullWidth
                          label="Authority (Optional)"
                          placeholder="Defaults to connected wallet"
                          value={createForm.authority}
                          onChange={(event) => updateCreateForm("authority", event.target.value)}
                          helperText="Wallet allowed to manage this gate. Leave empty to use connected wallet."
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
                          <FormHelperText>Controls how often a user can pass the gate.</FormHelperText>
                        </FormControl>
                      </Grid>
                    </Grid>

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
                            {option.label}
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
                              label="Required Gates (comma-separated public keys)"
                              value={createForm.requiredGates}
                              onChange={(event) =>
                                updateCreateForm("requiredGates", event.target.value)
                              }
                              helperText="Gate IDs to combine in this meta-gate."
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
                      Review this payload, then initialize the gate on-chain.
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
                        {JSON.stringify(createPreview, null, 2)}
                      </Typography>
                    </Paper>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                      <Button variant="outlined" onClick={() => setCreateStep(1)}>
                        Back
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => void copyText(JSON.stringify(createPreview, null, 2))}
                      >
                        Copy Payload
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleCreateGate}
                        disabled={createBusy || !isWalletConnected || !connection}
                        startIcon={
                          createBusy ? <CircularProgress size={16} color="inherit" /> : <ShieldRoundedIcon />
                        }
                      >
                        {createBusy ? "Initializing..." : "Initialize Gate"}
                      </Button>
                    </Stack>
                    {!isWalletConnected && (
                      <Alert severity="info">Connect a wallet to submit gate initialization.</Alert>
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
                      helperText="Needed for verified identity gate types."
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
                      helperText="Required for identity verification criteria."
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
                    <FormControlLabel
                      control={
                        <Switch
                          checked={checkForm.storeRecord}
                          onChange={(event) => updateCheckForm("storeRecord", event.target.checked)}
                        />
                      }
                      label="Store gate check record on-chain"
                    />
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
                        disabled={checkBusy || !isWalletConnected || !connection}
                        startIcon={
                          checkBusy ? <CircularProgress size={16} color="inherit" /> : <ShieldRoundedIcon />
                        }
                      >
                        {checkBusy ? "Checking..." : "Run Check"}
                      </Button>
                    </Stack>
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
                      {JSON.stringify(checkPreview, null, 2)}
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
                        disabled={adminBusy !== "" || !connection || !isWalletConnected}
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
                          <Button
                            key={gate.pda}
                            variant={adminForm.selectedGateId === gate.gateId ? "contained" : "outlined"}
                            color={gate.isActive ? "primary" : "secondary"}
                            onClick={() => updateAdminForm("selectedGateId", gate.gateId)}
                            sx={{ justifyContent: "space-between" }}
                          >
                            <Box component="span" className="mono" sx={{ fontSize: "0.72rem" }}>
                              {gate.gateId.slice(0, 8)}...{gate.gateId.slice(-6)}
                            </Box>
                            <Box component="span" sx={{ fontSize: "0.72rem" }}>
                              {gate.successfulChecks}/{gate.totalChecks}
                            </Box>
                          </Button>
                        ))}
                      </Stack>
                    </Paper>
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, md: 8 }}>
                  <Stack spacing={2}>
                    {!isWalletConnected && (
                      <Alert severity="info">Connect an authority wallet to run admin actions.</Alert>
                    )}
                    {isWalletConnected && selectedAdminGate && !isSelectedGateAuthority && (
                      <Alert severity="warning">
                        Connected wallet is not the authority for this gate. Switch to{" "}
                        <Box component="span" className="mono">
                          {selectedAdminGate.authority}
                        </Box>{" "}
                        to perform write actions.
                      </Alert>
                    )}

                    <FormControl fullWidth>
                      <InputLabel>Selected Gate</InputLabel>
                      <Select
                        label="Selected Gate"
                        value={adminForm.selectedGateId}
                        onChange={(event) => updateAdminForm("selectedGateId", event.target.value)}
                      >
                        {adminGates.map((gate) => (
                          <MenuItem key={gate.pda} value={gate.gateId}>
                            {gate.gateId}
                          </MenuItem>
                        ))}
                      </Select>
                      <FormHelperText>Choose a gate to manage.</FormHelperText>
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
                        onClick={handleUpdateGateCriteria}
                        disabled={
                          adminBusy !== "" ||
                          !adminForm.selectedGateId ||
                          !isWalletConnected ||
                          !isSelectedGateAuthority
                        }
                      >
                        {adminBusy === "updateCriteria"
                          ? "Updating..."
                          : "Update Criteria (from Create form)"}
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
                              !isSelectedGateAuthority
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
                            !isSelectedGateAuthority
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
                              !isSelectedGateAuthority
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
                              !isSelectedGateAuthority
                            }
                          >
                            {adminBusy === "closeGate" ? "Closing..." : "Close Gate"}
                          </Button>
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
                        {JSON.stringify(adminGateDetails, null, 2) || "No gate details loaded."}
                      </Typography>
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
                  5. Share deep links like <span className="mono">/?gateId=...</span> so members land directly on the right gate.
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

        <Grid size={{ xs: 12 }}>
          <Paper className="panel" sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Activity
            </Typography>
            {activity.length === 0 && (
              <Typography color="text.secondary">
                No transactions yet. Initialize or check a gate to populate activity.
              </Typography>
            )}
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
                        <Stack direction="row" spacing={0.8} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                          <Button
                            size="small"
                            href={explorerLink(item.signature, cluster)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </Button>
                          <Button
                            size="small"
                            onClick={() => void copyText(item.signature ?? "")}
                          >
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
            color={adminConfirmAction === "closeGate" || adminConfirmAction === "closeRecord" ? "warning" : "primary"}
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
                <MenuItem value="mainnet-beta">Mainnet Beta</MenuItem>
                <MenuItem value="custom">Custom RPC</MenuItem>
              </Select>
              <FormHelperText>Select the Solana cluster this console should use.</FormHelperText>
            </FormControl>
            <TextField
              fullWidth
              label="RPC Endpoint"
              value={cluster === "custom" ? customRpc : rpcEndpoint}
              onChange={(event) => setCustomRpc(event.target.value)}
              disabled={cluster !== "custom"}
              helperText={
                cluster === "custom"
                  ? "Paste the full URL of your preferred RPC provider."
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
