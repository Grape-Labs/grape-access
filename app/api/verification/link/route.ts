import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";

interface VerificationLinkRequest {
  gateId?: string;
  gate_id?: string;
  guildId?: string;
  guild_id?: string;
  discordUserId?: string;
  discord_user_id?: string;
  walletPubkey?: string;
  wallet_pubkey?: string;
  passed?: boolean;
  signature?: string;
  verificationMode?: "transaction" | "rpc";
  verificationSlot?: number;
  checkedAtLabel?: string;
  proofItems?: Array<{
    label?: string;
    address?: string;
    url?: string;
  }>;
}

function isSnowflake(value: string) {
  return /^\d{15,22}$/.test(value);
}

function resolveCallbackConfig() {
  const callbackUrl =
    process.env.DISCORD_VERIFICATION_CALLBACK_URL?.trim() ||
    process.env.DISCORD_BOT_CALLBACK_URL?.trim() ||
    "";
  const callbackSecret =
    process.env.DISCORD_VERIFICATION_CALLBACK_SECRET?.trim() ||
    process.env.DISCORD_BOT_CALLBACK_SECRET?.trim() ||
    "";
  return { callbackUrl, callbackSecret };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerificationLinkRequest;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const gateId = String(body.gateId ?? body.gate_id ?? "").trim();
    const guildId = String(body.guildId ?? body.guild_id ?? "").trim();
    const discordUserId = String(body.discordUserId ?? body.discord_user_id ?? "").trim();
    const walletPubkey = String(body.walletPubkey ?? body.wallet_pubkey ?? "").trim();
    const passed = Boolean(body.passed);
    const signature = typeof body.signature === "string" ? body.signature.trim() : "";
    const verificationMode = body.verificationMode === "transaction" ? "transaction" : "rpc";
    const verificationSlot =
      typeof body.verificationSlot === "number" && Number.isFinite(body.verificationSlot)
        ? body.verificationSlot
        : undefined;
    const checkedAtLabel =
      typeof body.checkedAtLabel === "string" ? body.checkedAtLabel.slice(0, 120) : undefined;

    if (!gateId || !guildId || !discordUserId || !walletPubkey) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required fields (gateId, guildId, discordUserId, walletPubkey)."
        },
        { status: 400 }
      );
    }
    if (!isSnowflake(guildId) || !isSnowflake(discordUserId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid guildId or discordUserId."
        },
        { status: 400 }
      );
    }
    try {
      new PublicKey(gateId);
      new PublicKey(walletPubkey);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid gateId or walletPubkey."
        },
        { status: 400 }
      );
    }

    const { callbackUrl, callbackSecret } = resolveCallbackConfig();
    if (!callbackUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Discord callback URL is not configured. Set DISCORD_VERIFICATION_CALLBACK_URL (or DISCORD_BOT_CALLBACK_URL)."
        },
        { status: 501 }
      );
    }

    const callbackId = randomUUID();
    const callbackPayload = {
      callbackId,
      source: "access_ui",
      gateId,
      guildId,
      discordUserId,
      walletPubkey,
      passed,
      signature: signature || undefined,
      verificationMode,
      verificationSlot,
      checkedAtLabel,
      proofItems: Array.isArray(body.proofItems)
        ? body.proofItems
            .slice(0, 8)
            .map((item) => ({
              label: typeof item?.label === "string" ? item.label.slice(0, 64) : undefined,
              address: typeof item?.address === "string" ? item.address.slice(0, 64) : undefined,
              url: typeof item?.url === "string" ? item.url.slice(0, 320) : undefined
            }))
        : undefined,
      syncedAt: new Date().toISOString()
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-grape-callback-id": callbackId
    };
    if (callbackSecret) {
      headers.authorization = `Bearer ${callbackSecret}`;
      headers["x-verification-callback-secret"] = callbackSecret;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const callbackResponse = await fetch(callbackUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(callbackPayload),
        signal: controller.signal
      });

      const callbackBody = (await callbackResponse.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!callbackResponse.ok) {
        return NextResponse.json(
          {
            ok: false,
            callbackId,
            error:
              (typeof callbackBody.error === "string" && callbackBody.error) ||
              `Callback endpoint returned ${callbackResponse.status}.`
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        callbackId,
        forwarded: true,
        callbackStatus: callbackResponse.status,
        callbackResult:
          typeof callbackBody === "object" && callbackBody
            ? callbackBody
            : undefined
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to forward verification callback."
      },
      { status: 500 }
    );
  }
}
