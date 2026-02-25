import { NextResponse } from "next/server";
import bs58 from "bs58";

export const runtime = "nodejs";

interface UploadRequestBody {
  payload?: unknown;
  filename?: string;
  network?: "mainnet" | "devnet" | string;
}

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadRequestBody;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (body.payload === undefined) {
      return NextResponse.json({ error: "Missing payload." }, { status: 400 });
    }

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

    const secretKey = parseSecretKey(secretRaw);
    // Load Irys packages at runtime to avoid Next.js bundling issues with optional chain deps.
    const runtimeRequire = eval("require") as NodeRequire;
    const { Uploader } = runtimeRequire("@irys/upload") as {
      Uploader: (tokenClass: unknown) => any;
    };
    const { Solana } = runtimeRequire("@irys/upload-solana") as {
      Solana: unknown;
    };
    const requestedNetwork = (body.network ?? "").toLowerCase();
    const network =
      requestedNetwork === "mainnet" || requestedNetwork === "devnet"
        ? requestedNetwork
        : (process.env.IRYS_NETWORK?.toLowerCase() === "mainnet" ? "mainnet" : "devnet");

    const fallbackRpc =
      network === "mainnet"
        ? process.env.NEXT_PUBLIC_SHYFT_MAINNET_RPC || "https://api.mainnet-beta.solana.com"
        : "https://api.devnet.solana.com";
    const rpcUrl = process.env.IRYS_SOLANA_RPC_URL?.trim() || fallbackRpc;
    let builder = Uploader(Solana).withWallet(secretKey).withRpc(rpcUrl);

    const bundlerUrl = process.env.IRYS_NODE_URL?.trim();
    if (bundlerUrl) {
      builder = builder.bundlerUrl(bundlerUrl);
    }

    const irys = network === "mainnet" ? await builder.mainnet() : await builder.devnet();
    const payloadString =
      typeof body.payload === "string"
        ? body.payload
        : JSON.stringify(body.payload, null, 2);

    const tags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "grape-access" },
      { name: "App-Version", value: "0.2.0" }
    ];
    if (body.filename) {
      tags.push({ name: "File-Name", value: sanitizeTagValue(body.filename) });
    }

    const receipt = await irys.upload(payloadString, { tags });
    const publicBaseUrl = resolvePublicIrysBaseUrl();
    const uploaderUrl = `${publicBaseUrl}/${receipt.id}`;

    return NextResponse.json({
      ok: true,
      id: receipt.id,
      uri: uploaderUrl,
      uploaderUrl,
      gatewayUrl: receipt.public || null,
      network
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Irys upload failure.";
    return NextResponse.json({ error: `Irys upload failed: ${message}` }, { status: 500 });
  }
}
