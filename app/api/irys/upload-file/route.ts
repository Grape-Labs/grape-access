import { NextResponse } from "next/server";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";

function parseSecretKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Irys secret key is empty.");
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("IRYS_SOLANA_PRIVATE_KEY JSON must be an array of bytes.");
    }
    return Uint8Array.from(parsed.map((entry) => Number(entry) & 0xff));
  }

  if (trimmed.includes(",")) {
    return Uint8Array.from(
      trimmed
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => Number(entry) & 0xff)
    );
  }

  return bs58.decode(trimmed);
}

function sanitizeTagValue(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "").slice(0, 256);
}

function resolvePublicIrysBaseUrl() {
  const configured =
    process.env.IRYS_GATEWAY_URL?.trim() ||
    process.env.IRYS_PUBLIC_URL?.trim() ||
    process.env.IRYS_GATEWAY_BASE_URL?.trim() ||
    "https://uploader.irys.xyz";
  const normalized = configured.replace(/\/$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "gateway.irys.xyz") {
      return "https://uploader.irys.xyz";
    }
  } catch {
    // Ignore malformed URL and use normalized fallback below.
  }
  return normalized;
}

function resolveNetwork(input: string | undefined): "mainnet" | "devnet" {
  const requested = (input ?? "").toLowerCase();
  if (requested === "mainnet" || requested === "devnet") {
    return requested;
  }
  return process.env.IRYS_NETWORK?.toLowerCase() === "mainnet" ? "mainnet" : "devnet";
}

function resolveRpcUrl(network: "mainnet" | "devnet") {
  const fallbackRpc =
    network === "mainnet"
      ? process.env.NEXT_PUBLIC_SHYFT_MAINNET_RPC || "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com";
  return process.env.IRYS_SOLANA_RPC_URL?.trim() || fallbackRpc;
}

function resolveRequiredLamports(quotedLamports: number) {
  const multiplierRaw = Number.parseFloat(process.env.IRYS_PAYMENT_MULTIPLIER?.trim() || "1.15");
  const multiplier = Number.isFinite(multiplierRaw) && multiplierRaw > 0 ? multiplierRaw : 1.15;
  const minLamportsRaw = Number.parseInt(process.env.IRYS_MIN_PAYMENT_LAMPORTS?.trim() || "0", 10);
  const minLamports = Number.isFinite(minLamportsRaw) && minLamportsRaw > 0 ? minLamportsRaw : 0;
  const computedLamports = Math.max(1, Math.ceil(quotedLamports * multiplier));
  return Math.max(computedLamports, minLamports);
}

function paymentRequiredResponse({
  recipient,
  requiredLamports,
  network,
  error
}: {
  recipient: string;
  requiredLamports: number;
  network: "mainnet" | "devnet";
  error: string;
}) {
  return NextResponse.json(
    {
      error,
      paymentRequired: {
        recipient,
        requiredLamports,
        requiredSol: (requiredLamports / 1_000_000_000).toFixed(9),
        network
      }
    },
    { status: 402 }
  );
}

async function verifyPaymentTransfer({
  rpcUrl,
  signature,
  payerPublicKey,
  recipientPublicKey,
  minimumLamports
}: {
  rpcUrl: string;
  signature: string;
  payerPublicKey: PublicKey;
  recipientPublicKey: PublicKey;
  minimumLamports: number;
}) {
  const connection = new Connection(rpcUrl, "confirmed");
  const transaction = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0
  });
  if (!transaction) {
    return { ok: false, reason: "Payment transaction was not found on-chain yet." };
  }
  if (transaction.meta?.err) {
    return { ok: false, reason: "Payment transaction failed." };
  }

  const payer = payerPublicKey.toBase58();
  const recipient = recipientPublicKey.toBase58();
  const instructions = transaction.transaction.message.instructions;
  for (const instruction of instructions) {
    if (!("parsed" in instruction)) {
      continue;
    }
    if (instruction.program !== "system") {
      continue;
    }
    const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
    if (!parsed || parsed.type !== "transfer") {
      continue;
    }
    const source = String(parsed.info?.source ?? parsed.info?.from ?? "");
    const destination = String(parsed.info?.destination ?? parsed.info?.to ?? "");
    const lamports = Number(parsed.info?.lamports ?? 0);
    if (
      source === payer &&
      destination === recipient &&
      Number.isFinite(lamports) &&
      lamports >= minimumLamports
    ) {
      return { ok: true };
    }
  }
  return {
    ok: false,
    reason: "Payment transaction does not include the required SOL transfer."
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file upload." }, { status: 400 });
    }

    const network = resolveNetwork(String(form.get("network") ?? ""));
    const rpcUrl = resolveRpcUrl(network);

    const secretRaw =
      process.env.IRYS_SOLANA_PRIVATE_KEY?.trim() ||
      process.env.IRYS_PRIVATE_KEY?.trim() ||
      "";
    if (!secretRaw) {
      return NextResponse.json(
        {
          error:
            "Irys uploader is not configured. Set IRYS_SOLANA_PRIVATE_KEY (or IRYS_PRIVATE_KEY) on the server."
        },
        { status: 500 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 15MB upload limit." }, { status: 400 });
    }

    const secretKey = parseSecretKey(secretRaw);
    const uploaderKeypair = Keypair.fromSecretKey(secretKey);
    const uploaderAddress = uploaderKeypair.publicKey.toBase58();
    // Load Irys packages at runtime to avoid Next.js bundling issues with optional chain deps.
    const runtimeRequire = eval("require") as NodeRequire;
    const { Uploader } = runtimeRequire("@irys/upload") as {
      Uploader: (tokenClass: unknown) => any;
    };
    const { Solana } = runtimeRequire("@irys/upload-solana") as {
      Solana: unknown;
    };

    let builder = Uploader(Solana).withWallet(secretKey).withRpc(rpcUrl);

    const bundlerUrl = process.env.IRYS_NODE_URL?.trim();
    if (bundlerUrl) {
      builder = builder.bundlerUrl(bundlerUrl);
    }

    const irys = network === "mainnet" ? await builder.mainnet() : await builder.devnet();
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const quotedPrice = await irys.getPrice(fileBuffer.length);
    const quotedLamports = Number.parseInt(quotedPrice.toString(), 10);
    if (!Number.isFinite(quotedLamports) || quotedLamports <= 0) {
      throw new Error("Could not calculate Irys upload price.");
    }
    const requiredLamports = resolveRequiredLamports(quotedLamports);
    const requireUserPayment = (process.env.IRYS_REQUIRE_USER_PAYMENT?.toLowerCase() ?? "true") !== "false";

    if (requireUserPayment) {
      const payerPublicKeyRaw = String(form.get("payerPublicKey") ?? "").trim();
      const paymentSignature = String(form.get("paymentSignature") ?? "").trim();
      if (!payerPublicKeyRaw || !paymentSignature) {
        return paymentRequiredResponse({
          recipient: uploaderAddress,
          requiredLamports,
          network,
          error: "User payment is required before uploading to Irys."
        });
      }

      let payerPublicKey: PublicKey;
      try {
        payerPublicKey = new PublicKey(payerPublicKeyRaw);
      } catch {
        return paymentRequiredResponse({
          recipient: uploaderAddress,
          requiredLamports,
          network,
          error: "Invalid payer public key for Irys payment."
        });
      }

      const paymentVerification = await verifyPaymentTransfer({
        rpcUrl,
        signature: paymentSignature,
        payerPublicKey,
        recipientPublicKey: uploaderKeypair.publicKey,
        minimumLamports: requiredLamports
      });
      if (!paymentVerification.ok) {
        return paymentRequiredResponse({
          recipient: uploaderAddress,
          requiredLamports,
          network,
          error: paymentVerification.reason ?? "Invalid Irys payment transaction."
        });
      }
    }

    const tags = [
      { name: "Content-Type", value: sanitizeTagValue(file.type || "application/octet-stream") },
      { name: "App-Name", value: "grape-access" },
      { name: "App-Version", value: "0.2.0" },
      { name: "File-Name", value: sanitizeTagValue(file.name || "upload.bin") }
    ];

    const receipt = await irys.upload(fileBuffer, { tags });
    const publicBaseUrl = resolvePublicIrysBaseUrl();
    const uploaderUrl = `${publicBaseUrl}/${receipt.id}`;

    return NextResponse.json({
      ok: true,
      id: receipt.id,
      uri: uploaderUrl,
      uploaderUrl,
      gatewayUrl: receipt.public || null,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      network,
      chargedLamports: requireUserPayment ? requiredLamports : 0,
      recipient: requireUserPayment ? uploaderAddress : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Irys upload failure.";
    return NextResponse.json({ error: `Irys file upload failed: ${message}` }, { status: 500 });
  }
}
