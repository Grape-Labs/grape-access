# Access eligibility and reward entitlements

Review date: 2026-10-18. No deployment, publication, or mainnet transaction was performed.

## Evidence boundaries

The UI uses `@grapenpm/grape-access-sdk` 0.2.0, the installed Verification registry client, and Vine reputation client. SDK evidence is in `node_modules/@grapenpm/grape-access-sdk/src/{pda,client,types/index,idl}.ts`. SDK address derivation is covered by the repository tests.

Local program sources inspected (outside this repository):

- `/Users/kirk/Development/Grape Access Protocol/programs/grape-gating-protocol/src/lib.rs`: `check_gate`, account constraints, `validate_link_account`, `close_check_record`.
- `/Users/kirk/Development/Grape Verification/programs/grape-verification-registry/src/lib.rs`: identity attestation/revocation and wallet link/unlink instructions.
- `/Users/kirk/Development/vine-reputation/programs/vine-reputation/src/lib.rs`: reputation accrual, reset, transfer and account seeds.
- `/Users/kirk/Development/grape-distributor-sdk/src/{pda,accounts,client}.ts` and README: separate distributor SDK, not a dependency or integration of Access.

These local source directories have no Git revision metadata. The Access Rust source uses `gate` seeds and `check_gate`, while the installed SDK uses `access` seeds and `checkAccess`. External account layouts also differ. **Local source findings are not confirmed deployed behavior.** No deployed binary/source equivalence, program upgrade state, or live gate was verified. Do not use this review as an attestation of mainnet enforcement.

## Flow and policy findings

| Layer / flow | Evidence and consequence |
| --- | --- |
| Admin templates | `app/page.tsx`, `templates`, `buildCriteria`, create/edit handlers. Community Reputation selects Combined, 1,000 points, season 1, Discord, wallet link enabled, and a time-limited gate type. Existing defaults and serialization are preserved. |
| Combined criteria | SDK enum carries Vine config, minimum points, season, verification space, accepted platforms and `requireWalletLink`. The platforms are alternatives, not a requirement to verify all platforms. Combined has no duration field. Turning the link off does not associate the supplied identity with the wallet. |
| Duration | TimeLockedReputation is a separate enum variant, so choosing it replaces Combined. Local Rust approximates seconds with `(current_slot - last_update_slot) * 400 / 1000`; it does not track how long the threshold was continuously met. Gate-type duration is a separate setting, not reputation holding duration. |
| Composition | MultiDao exists in the SDK and local source; SDK accepts remaining accounts, but the member form does not construct the dependency record accounts. Local source reads passed records, matching gate/user and checking one-hour recency. It does not re-evaluate underlying verification on every dependency read. Do not advertise MultiDao as a ready, equivalent way to combine duration and identity. |
| Member discovery | `/access` derives reputation from config/wallet/season, discovers registry identity/link accounts and uses compatibility decoders. `/user` redirects there. Discovery is best effort; missing discovery or unsupported layouts are not proof of ineligibility. Manual diagnostic account inputs remain. |
| Member validation | Checklist reads each supported reputation/identity/link requirement separately. Reputation checks wallet, season, canonical PDA and exact integer threshold; identity checks space, verified flag, expiry and accepted platform; link checks identity and wallet hash using the space salt. Unknown layouts and RPC exceptions produce Unavailable. Duration/other policy rows remain Not checked pending program validation. |
| Access check | Default flow simulates the program instruction without a stored record. Optional storeRecord signs/sends an instruction. Successful simulation is only a result at that slot; successful transaction is only a result at confirmation. Neither grants a permanent entitlement. Confirmation errors are now checked explicitly. |
| Identity verification | Establishes platform-account ownership and optional wallet links. Verification and linking are performed in the Verification dashboard; Access now links there instead of exposing its own wallet-link transaction. |
| Discord callback | `app/api/verification/link/route.ts` validates identifier formats and forwards them to the configured bot. It does not authenticate wallet ownership or independently validate chain eligibility. Browser-side success gating is bypassable. The receiving bot/API must independently verify authenticated identity, wallet control, community policy and fresh chain evidence before granting roles. This callback is not reward proof. |
| Rewards | No distributor client, token reward transfer, allocation policy, claim instruction, or claim-consumption ledger is integrated here. All results are access-only. |

## Keys, lifecycle and abuse resistance

- **Access records:** SDK seeds are `["check", access PDA, user wallet]`. Local legacy Rust likewise keys a record by gate and wallet. Identity is not part of this key. Two linked wallets have independent records; this does not establish any reward allowance.
- **Reputation:** seeds are `["reputation", config, wallet, season(u16)]`. Multiple wallets can independently accumulate points when the authorized reputation issuer awards them. The local Vine program restricts issuance to its authority; it does not deduplicate people or platform accounts. Registry relinking does not automatically transfer reputation. Local Vine has an explicit authority-controlled transfer operation; deployed availability was not established.
- **Wallet switching:** the new member preflight and result generations are invalidated, account inputs cleared, and fresh derivation requested. Returning A → B → A cannot revive an old request. A transaction already submitted cannot be undone by switching wallets; its result is not published into the new wallet context.
- **Relinking/unlinking:** registry links are keyed by identity and salted wallet hash. Multiple links can coexist. Linking a new wallet is not a global membership migration. The old wallet retains its independent reputation and access record unless the owning component explicitly changes them. Fresh Access preflight validates the supplied link against the current wallet.
- **Expiry/revocation:** fresh identity checks reject an expired or unverified/revoked identity. Local registry revocation leaves link accounts in place. Existing Access records are historical snapshots and are not automatically revoked by registry changes. Consumers must revalidate or enforce explicit policy freshness/revocation semantics.
- **Single Use / repeated checks:** local Rust never branches on `gate_type` in `check_gate`; its record uses `init_if_needed` and gets overwritten on later successful checks. A failed instruction rolls back counter and record writes. Thus even those counters are not counts of unique members or all attempted checks. The installed SDK's SingleUse enum alone proves no consumption enforcement.
- **Record closure:** local `close_check_record` has an empty handler and its signer is not constrained to gate authority or user. It closes the wallet record; `init_if_needed` permits recreation. This is a local-source authorization gap requiring program review. There is no durable spent marker here. Closing an Access record must never restore reward entitlement.
- **Wallet binding gap:** local `validate_link_account` checks owner, identity and link PDA using the link's stored hash, but never compares that hash with the checked user's wallet hash. The UI now checks that relationship, but any direct program caller can bypass UI preflight. The Access program must enforce it, with a validated registry space/salt account or registry CPI.
- Discord verification, multiple verification methods, tokens and reputation do not prove unique humans. A person can use multiple accounts/wallets. More platforms do not inherently solve that problem.

## Required reward integration

The separate distributor SDK derives claim status from `[claim status seed, distributor, claimant wallet, allocation index]` and includes claimant/index/amount in its allocation machinery. It is not used by this application. Its README notes that closing claim status needs program support; deployed closure/replay behavior is unverified. Issuing multiple allocations to linked wallets can therefore represent multiple allowances unless the allocation issuer deduplicates them. A wallet-keyed claim record alone cannot express one entitlement across changing wallets.

A concrete integration should specify:

1. **Membership/entitlement issuer:** issue a stable, community-scoped `membership_id`. Define membership admission and duplicate-account resolution. A registry identity PDA may serve a narrower “one platform account” policy, but is not a unique-person ID. Multiple identities/platforms need explicit canonical membership resolution if they are to share an entitlement.
2. **Reward policy:** define `community_id`, `campaign_id`, `epoch`, `policy_version`, `membership_id`, asset, amount, expiry and authorized destination wallet. Eligibility decisions must identify the exact policy and evidence time/slot. Historical eligibility versus claim-time revalidation must be an explicit policy choice.
3. **Entitlement service / reputation issuer:** issue at most one allocation per canonical membership and campaign/epoch; aggregate or reject duplicate reputation contributions by that membership if required. Wallet migration must keep the same entitlement ID and invalidate old destination authorizations; it must not create a new claim allowance.
4. **Distributor program:** verify the policy commitment/signature or Merkle proof and authorized claimant, then atomically check and consume a PDA/nullifier keyed by `(community, campaign, epoch, membership_id)` and transfer the reward. The proof binds the destination and amount. Concurrency must not allow two wallets to spend the same entitlement. Spent state must survive wallet relinking and Access/claim record closure, or closure must be prohibited while replay is possible. Root updates must preserve the same spent namespace.
5. **SDK + Access integration:** add typed policy/entitlement/claim-status reads that distinguish absent, spent, revoked, expired and RPC-unavailable. Only then may Access display reward eligibility, with campaign and amount; the distributor still enforces it. No local storage or disabled button is an enforcement boundary.
6. **Access and registry programs:** validate the wallet binding on-chain, authorize record closure, and define lifecycle behavior. If continuous reputation duration is required, the reputation program/service needs threshold-history evidence and Access needs a compatible criterion. Add explicit composite support or validated dependency records with suitable freshness/revocation handling.

## Validation and remaining verification

- `npm test`: 14 passing tests. Covers shared production evaluator helpers, independent requirement results, missing/expired/revoked identity, wrong platform/community/season/wallet, exact u64 thresholds, different-wallet links, multiple linked wallets, RPC rejection, generation races including A → B → A, and installed SDK PDA derivation.
- `npx tsc --noEmit`: passes.
- `git diff --check`: passes.
- `npm run build`: blocked by DNS resolution of `fonts.googleapis.com` for existing Sora / IBM Plex Mono font imports. No unrelated font change was made.
- Tests are unit/SDK tests, not browser integration or validator transactions. Local Anchor and validator executables exist, but the available Access source differs from the SDK ABI and has no built program binary (only a keypair under target/deploy). No matching deployed program artifact or reproducible version was available. Single-use, repeated checks, record closure, revocation after stored checks, and dependency composition were inspected in source, **not executed or verified against deployment**.
- Before relying on stronger guarantees, use a matching local/devnet build to test repeated stored and unstored checks, two wallets per identity, arbitrary-wallet link substitution, unauthorized closure, close/recreate replay, expiry/revocation, and concurrent reward claims. Never infer those guarantees from the passing UI tests.
