# Grape Access Console

Grape Access Console is a Next.js + Material UI app for operating Grape Access gates on Solana with `@grapenpm/grape-access-sdk`.

It includes:
- A gate/access creation flow for admins
- A member self-serve portal
- Admin lifecycle actions (load, inspect, activate/deactivate, transfer authority, close)
- Moderator/debug check tools
- Metadata URI + Irys metadata upload support

## What It Does Today

- Create gates on-chain
- Create access spaces with optional `metadataUri`
- Check access on-chain for members or arbitrary wallets
- Manage existing gates from authority wallets
- Share deep links for member checks: `/access?gateId=<GATE_PUBLIC_KEY>&cluster=<mainnet-beta|devnet|testnet|custom>`
- Auto-derive common member accounts (reputation PDA, ATA, best-effort identity/link)

## Tabs

1. `Create Gate`
- Template-driven setup
- Criteria and gate type configuration
- Payload review + initialize transaction

2. `Check Access`
- Moderator/operator check for any user wallet
- Manual account overrides for troubleshooting

3. `Admin Console`
- Load gates by authority (read-only supported)
- Fetch gate details
- Update metadata URI
- Apply active state
- Transfer authority
- Close check record / close gate (with confirmation)

4. `Community Guide`
- Built-in operator/member usage checklist

## Member Page

- Standalone user route: `/access`
- Alias route: `/user` (redirects to `/access`)
- Supports deep-link prefill: `/access?gateId=...`
- Includes network selector so member checks run against the correct RPC/cluster

## Program IDs Shown In UI

- `Grape Access Program`
- `OG Reputation Program`
- `Grape Verification Program`

## Requirements

- Node.js 18+
- Browser wallet extension (Phantom or Solflare)

## Install

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm run start
```

## Environment Configuration

Optional:

- `NEXT_PUBLIC_WALLET_CONNECTOR_RPC`
  - If set, wallet connection provider uses this RPC endpoint.
  - If not set, defaults to Shyft mainnet RPC.
- `NEXT_PUBLIC_SHYFT_MAINNET_RPC`
  - Preferred mainnet RPC used when `Mainnet Beta` is selected in Connection Settings.
  - Optional override for the default Shyft mainnet RPC value.

For Irys metadata upload API (`/api/irys/upload-json`):

- `IRYS_SOLANA_PRIVATE_KEY`
  - Server-side Solana secret key used by Irys uploader.
  - Supports base58 string, JSON byte array (`[1,2,...]`), or comma-separated bytes.
- `IRYS_NETWORK`
  - Optional default: `mainnet` or `devnet`.
- `IRYS_SOLANA_RPC_URL`
  - Optional RPC endpoint used for Irys funding/upload wallet operations.
- `IRYS_NODE_URL`
  - Optional custom Irys node URL.
- `IRYS_GATEWAY_BASE_URL`
  - Optional gateway base used to construct returned URI when receipt has no `public` URL.

Example `.env.local`:

```bash
NEXT_PUBLIC_SHYFT_MAINNET_RPC=your_shyft_mainnet_rpc_url
# Optional override:
# NEXT_PUBLIC_WALLET_CONNECTOR_RPC=your_preferred_rpc_url

# Irys uploader (server-side)
# IRYS_SOLANA_PRIVATE_KEY=your_base58_or_json_secret_key
# IRYS_NETWORK=mainnet
# IRYS_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# IRYS_NODE_URL=https://uploader.irys.xyz
# IRYS_GATEWAY_BASE_URL=https://gateway.irys.xyz
```

## Operator Quick Start

1. Connect authority wallet.
2. Set network/RPC from the top-right settings cog.
3. Create a gate in `Create Gate`.
4. Validate with:
   - `Check Access` (known pass + known fail wallets)
   - `/access` (real member test)
5. Share member deep link using `Copy Share Link`.

## Field Clarifications

- `Gate ID`: Unique gate identifier public key (not the gate PDA).
- `OG Reputation Config`: Public key of your community OG Reputation config account.
- `Grape Space`: Public key of your Grape Verification Space account (space PDA), not a wallet.
- `Authority`: Wallet allowed to manage the gate.

## Member Auto-Derive Notes

Auto-derive can populate:
- `reputationAccount` for reputation criteria
- `tokenAccount` ATA for token-holding gates (`checkAta=true`)
- best-effort `identityAccount` and `linkAccount` for verification criteria

Identity/link derivation may still require correct identity input format depending on community verification setup.

## Admin Load Gates Diagnostics

Admin `Load Gates` now includes:
- RPC probe before loading
- UI status:
  - `Load Status`
  - `Last RPC Slot Probe`
- read-only loading support (wallet not required for read actions)

If load still returns empty:
- verify network/RPC matches where gate was created
- verify authority wallet filter matches gate authority
- paste gate ID directly into `Selected Gate ID` and use `Fetch Gate Details`

## Troubleshooting

### Wallet modal/popup issues
- Wallet modal layering is managed in `app/globals.css`.
- If UI customizations are added, keep wallet modal container/wrapper above overlay.

### Missing required account errors on check
Gate criteria may require:
- `reputationAccount`
- `identityAccount`
- `linkAccount`
- `tokenAccount`

Use the `/access` page `Auto-Derive Accounts` action first.

### SDK compatibility errors
Console now prefers access-first SDK methods (`GrapeAccessClient`, `initializeAccess`, `checkAccess`, etc.) and falls back to gate aliases for compatibility.

## Deploy (Vercel)

1. Push repository.
2. Import project in Vercel.
3. Set optional env var:
   - `NEXT_PUBLIC_WALLET_CONNECTOR_RPC`
4. Deploy.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Project Structure

- `app/page.tsx`: Main UI, actions, and SDK wiring
- `app/providers.tsx`: MUI + wallet providers
- `app/layout.tsx`: App shell/fonts
- `app/globals.css`: Global styles and wallet modal styling
- `app/api/irys/upload-json/route.ts`: Server-side Irys JSON metadata uploader

## License

Private project codebase. Respect your organization’s distribution and usage policy.
