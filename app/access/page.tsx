"use client";

import { useEffect, useMemo, useState } from "react";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { AnchorProvider } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import * as GPassSdk from "@grapenpm/grape-access-sdk";

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

declare global {
  interface Window {
    Buffer?: typeof Buffer;
  }
}

const {
  GPASS_PROGRAM_ID,
  GRAPE_VERIFICATION_PROGRAM_ID,
  VINE_REPUTATION_PROGRAM_ID,
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

async function resolveSdkClient(
  connection: Connection,
  wallet: WalletProvider | undefined,
  options?: { readOnly?: boolean }
) {
  const readOnly = options?.readOnly ?? false;
  const sdkAny = GPassSdk as Record<string, unknown>;
  const GpassClientCtor = sdkAny.GpassClient as
    | (new (...args: unknown[]) => unknown)
    | undefined;

  if (typeof GpassClientCtor !== "function") {
    throw new Error(
      "Installed SDK does not export GpassClient. Please update @grapenpm/grape-access-sdk."
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
    (async (transactions: Transaction[]) =>
      Promise.all(transactions.map((tx) => signTransaction(tx))));

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

export default function AccessPage() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberForm);
  const [memberCheck, setMemberCheck] = useState<MemberCheckState>({
    status: "idle",
    message: "Connect your wallet and run a gate check."
  });
  const [memberDerive, setMemberDerive] = useState<MemberDeriveState>({
    status: "idle",
    message: "Use auto-derive to populate required accounts for your gate."
  });

  const [memberBusy, setMemberBusy] = useState(false);
  const [memberDeriveBusy, setMemberDeriveBusy] = useState(false);

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
    if (typeof window === "undefined") {
      return;
    }

    const applyGateIdFromLocation = () => {
      const gateIdFromQuery =
        new URLSearchParams(window.location.search).get("gateId")?.trim() ?? "";
      if (!gateIdFromQuery) {
        return;
      }

      try {
        new PublicKey(gateIdFromQuery);
      } catch {
        return;
      }

      setMemberForm((prev) =>
        prev.gateId === gateIdFromQuery
          ? prev
          : {
              ...prev,
              gateId: gateIdFromQuery
            }
      );
    };

    applyGateIdFromLocation();
    window.addEventListener("popstate", applyGateIdFromLocation);
    return () => {
      window.removeEventListener("popstate", applyGateIdFromLocation);
    };
  }, []);

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

  const notify = (message: string, severity: "success" | "error" | "info") => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const updateMemberForm = <K extends keyof MemberFormState>(key: K, value: MemberFormState[K]) => {
    setMemberForm((prev) => ({ ...prev, [key]: value }));
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    notify("Copied to clipboard.", "success");
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

  const buildShareLink = (gateIdRaw: string) => {
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
    if (!readOnly && !wallet.publicKey) {
      throw new Error("Connect wallet before checking access.");
    }

    return (await resolveSdkClient(connection, wallet as unknown as WalletProvider, {
      readOnly
    })) as Record<string, unknown>;
  };

  const handleAutoDeriveMemberAccounts = async (
    { silent = false }: { silent?: boolean } = {}
  ): Promise<MemberFormState | null> => {
    if (!wallet.publicKey) {
      const message = "Connect wallet first.";
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
      const client = await getClient({ readOnly: true });
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
            if (!byteArraysEqual(secondHash, firstHash)) {
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

  const handleMemberCheck = async () => {
    if (!wallet.publicKey) {
      const message = "Connect wallet first.";
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
      const message = error instanceof Error ? error.message : "Failed to check member access.";
      setMemberCheck({ status: "error", message });
      notify(message, "error");
    } finally {
      setMemberBusy(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }} className="dramatic-shell">
      <Paper className="panel" sx={{ p: { xs: 2.2, md: 3 } }}>
        <Stack spacing={2.2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Box>
              <Typography variant="h5">Grape Access User Page</Typography>
              <Typography color="text.secondary">
                This page is for members only. Connect wallet, verify gate access, and share your gate link.
              </Typography>
            </Box>
            <WalletMultiButton />
          </Stack>

          {!isWalletConnected && (
            <Alert severity="info">
              Connect your wallet, then run your access check with the gate ID shared by your community.
            </Alert>
          )}

          <TextField
            fullWidth
            label="Gate ID"
            value={memberForm.gateId}
            onChange={(event) => setMemberGateId(event.target.value)}
            helperText="Public key of the access gate."
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <Button
              variant="outlined"
              onClick={() => void handleAutoDeriveMemberAccounts()}
              disabled={memberDeriveBusy || !memberForm.gateId || !isWalletConnected}
            >
              {memberDeriveBusy ? "Deriving..." : "Auto-Derive Accounts"}
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

          <TextField
            fullWidth
            label="Identity Value (optional)"
            value={memberForm.identityValue}
            onChange={(event) => updateMemberForm("identityValue", event.target.value)}
            helperText="If gate criteria checks identity, enter your platform handle/ID so PDAs can be derived."
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
            <Button
              variant="outlined"
              onClick={() => void copyText(JSON.stringify(memberPreview, null, 2))}
            >
              Copy Check Payload
            </Button>
            <Button
              variant="contained"
              onClick={handleMemberCheck}
              disabled={memberBusy || !isWalletConnected}
              startIcon={
                memberBusy ? <CircularProgress size={16} color="inherit" /> : <ShieldRoundedIcon />
              }
            >
              {memberBusy ? "Checking..." : "Check My Access"}
            </Button>
          </Stack>

          <Divider />

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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Button
                href={explorerLink(memberCheck.signature, connection.rpcEndpoint)}
                target="_blank"
                rel="noreferrer"
              >
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
