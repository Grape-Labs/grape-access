# Grape Access Console

Grape Access Console is a Next.js + Material UI app for managing on-chain Grape Access gates on Solana using `@grapenpm/gpass-sdk`.

It provides a guided UI for:
- Initializing gates
- Checking user access
- Managing wallet/network/RPC selection
- Copying and reviewing transaction payloads

## Features

- Multi-wallet support via Solana Wallet Adapter (`Phantom`, `Solflare`, `Trust`)
- Top-right wallet connect button and settings cog
- Connection Settings dialog for network and custom RPC endpoint
- Compact Program IDs strip with quick copy
- Guided Create Gate flow (template -> configure -> review/initialize)
- One-click Gate ID generation
- Check Access flow with optional account inputs
- Activity log with transaction signatures + Explorer links
- Inline helper text for field purpose and usage

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Material UI
- Solana Wallet Adapter
- `@coral-xyz/anchor`
- `@grapenpm/gpass-sdk`

## Requirements

- Node.js 18+
- A Solana wallet extension (Phantom, Solflare, or Trust)

## Install

```bash
npm install
```

## Run (Development)

```bash
npm run dev
```

Open: `http://localhost:3000`

## Build

```bash
npm run build
npm run start
```

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - lint via Next

## Configuration

Optional environment variable:

- `NEXT_PUBLIC_WALLET_CONNECTOR_RPC`
  - If set, Wallet Adapter connection provider uses this RPC endpoint.
  - If not set, defaults to Solana `devnet` endpoint.

Example `.env.local`:

```bash
NEXT_PUBLIC_WALLET_CONNECTOR_RPC=https://api.devnet.solana.com
```

## How To Use

1. Connect wallet
- Use the top-right wallet button.
- Use an admin/authority wallet when creating or managing gates.

2. Set network / RPC
- Click the top-right cog button.
- Choose `devnet`, `testnet`, `mainnet-beta`, or `custom`.
- For `custom`, enter your RPC URL.

3. Create a gate
- Go to `Create Gate` tab.
- Choose a template.
- Configure criteria + gate type.
- Use `Generate` in Gate ID input to create a unique on-chain gate ID.
- Review payload and click `Initialize Gate`.

4. Check access
- Go to `Check Access` tab.
- Provide Gate ID + User public key.
- Fill optional accounts only if your selected criteria requires them.
- Click `Run Check`.

## Gate ID Explained

`Gate ID` is the unique public key identifier for a gate configuration.

- It is not the gate PDA.
- The program derives the gate PDA from Gate ID.
- Each gate should use a fresh Gate ID.

## Notes On Authority Wallet

- If `Authority` is left empty during initialization, the connected wallet becomes authority.
- Authority wallet is the signer used to manage the gate later (update, activate/deactivate, close).

## Troubleshooting

### Wallet menu appears behind UI
Wallet dropdown/modal z-index is already elevated in `app/globals.css`. If you customize layout containers, keep high z-index on wallet dropdown/modal classes.

### Gate checks fail with missing account errors
Some criteria require extra accounts:
- Reputation criteria -> `reputationAccount`
- Verification criteria -> `identityAccount`
- Wallet-link verification -> `linkAccount`
- Token holding -> `tokenAccount`

### Wrong network / RPC
If transactions or account lookups fail unexpectedly, confirm the selected cluster and RPC endpoint in Connection Settings.

### SDK method/client errors
This app is wired to the installed `@grapenpm/gpass-sdk` `GpassClient` + Anchor provider flow. If you upgrade SDK versions, verify exported class/method names remain compatible.

## Project Structure (high-level)

- `app/page.tsx` - main console UI and action handlers
- `app/providers.tsx` - MUI theme + wallet providers
- `app/layout.tsx` - app shell and fonts
- `app/globals.css` - global styling and wallet overlay styles

## License

Private project codebase. Respect your organization's distribution and usage policy.
