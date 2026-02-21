"use client";

import { useEffect, useMemo, useState } from "react";
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

const {
  GPASS_PROGRAM_ID,
  GRAPE_VERIFICATION_PROGRAM_ID,
  VINE_REPUTATION_PROGRAM_ID,
  VerificationPlatform,
  GateCriteriaFactory,
  GateTypeFactory
} = GPassSdk;

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

  const [createBusy, setCreateBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);

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

  const programCards = useMemo(
    () => [
      { label: "Grape Access Program", value: GPASS_PROGRAM_ID.toBase58() },
      {
        label: "Vine Reputation Program",
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
          vineConfig: parsePublicKey("Vine config", createForm.vineConfig, true)!,
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
          vineConfig: parsePublicKey("Vine config", createForm.vineConfig, true)!,
          minPoints: parseInteger("Minimum points", createForm.minPoints, 0),
          season: parseInteger("Season", createForm.season, 0),
          grapeSpace: parsePublicKey("Grape space", createForm.grapeSpace, true)!,
          platforms,
          requireWalletLink: createForm.requireWalletLink
        } as any);
      case "timeLockedReputation":
        return GateCriteriaFactory.timeLockedReputation({
          vineConfig: parsePublicKey("Vine config", createForm.vineConfig, true)!,
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

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copied to clipboard.", "success");
    } catch {
      notify("Clipboard copy failed.", "error");
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 2.8 } }}>
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
              <Tab label="Check Access" />
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
                              label="Vine Config"
                              value={createForm.vineConfig}
                              onChange={(event) =>
                                updateCreateForm("vineConfig", event.target.value)
                              }
                              helperText="Vine reputation config public key for scoring checks."
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
                            helperText="Grape identity space public key to verify user identities."
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

            {tab === 2 && (
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
                  5. Use the Check Access tab to test real member wallets before announcing a gate.
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
