import { NextResponse } from "next/server";
import bs58 from "bs58";

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

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file upload." }, { status: 400 });
    }

    const networkInput = String(form.get("network") ?? "").toLowerCase();
    const network =
      networkInput === "mainnet" || networkInput === "devnet"
        ? networkInput
        : (process.env.IRYS_NETWORK?.toLowerCase() === "mainnet" ? "mainnet" : "devnet");

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
    // Load Irys packages at runtime to avoid Next.js bundling issues with optional chain deps.
    const runtimeRequire = eval("require") as NodeRequire;
    const { Uploader } = runtimeRequire("@irys/upload") as {
      Uploader: (tokenClass: unknown) => any;
    };
    const { Solana } = runtimeRequire("@irys/upload-solana") as {
      Solana: unknown;
    };

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
    const fileBuffer = Buffer.from(await file.arrayBuffer());
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
      network
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Irys upload failure.";
    return NextResponse.json({ error: `Irys file upload failed: ${message}` }, { status: 500 });
  }
}
