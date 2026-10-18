const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectRequirement, reputationIssues, identityIssue, walletLinkIssue, RequestScope } = require(process.env.ELIGIBILITY_MODULE);
const rep = { wallet: 'A', expectedWallet: 'A', season: 1, expectedSeason: 1, account: 'community-A-season-1', expectedAccount: 'community-A-season-1', points: '100', minimum: '100' };
const identity = { space: 'community-A', expectedSpace: 'community-A', verified: true, expiresAt: 200, now: 100, platform: 0, platforms: [0] };
const inspectIdentity = (value) => inspectRequirement('Identity', 'Verify', async () => { const issue = identityIssue(value); return issue ? [issue] : []; });

test('verified identity and insufficient reputation remain separate results', async () => {
  assert.equal((await inspectIdentity(identity)).state, 'met');
  const result = await inspectRequirement('Reputation', 'Earn points', async () => reputationIssues({ ...rep, points: '99' }));
  assert.equal(result.state, 'unmet');
  assert.match(result.detail, /99 points; 100/);
});
for (const [name, change] of [['expired', { expiresAt: 99 }], ['revoked', { verified: false }], ['wrong community', { space: 'community-B' }], ['wrong platform', { platform: 1 }]]) {
  test(`sufficient reputation with ${name} verification`, async () => {
    assert.deepEqual(reputationIssues(rep), []);
    assert.equal((await inspectIdentity({ ...identity, ...change })).state, 'unmet');
  });
}
test('missing account is unmet; RPC exception is unavailable', async () => {
  assert.equal((await inspectRequirement('Identity', 'Verify', async () => ['Identity account was not found.'])).state, 'unmet');
  const result = await inspectRequirement('Identity', 'Verify', async () => { throw new Error('RPC offline'); });
  assert.equal(result.state, 'unavailable');
  assert.equal(result.detail, 'RPC offline');
});
test('wrong reputation wallet, community and season are rejected', () => {
  for (const change of [{ wallet: 'B' }, { season: 2 }, { account: 'community-B-season-1' }]) assert.ok(reputationIssues({ ...rep, ...change }).length);
});
test('threshold retains u64 precision', () => {
  assert.ok(reputationIssues({ ...rep, points: '9007199254740992', minimum: '9007199254740993' }).length);
});
test('identity linked to another wallet or identity fails', () => {
  assert.match(walletLinkIssue(true, false), /different wallet/);
  assert.match(walletLinkIssue(false, true), /different identity/);
  assert.equal(walletLinkIssue(true, true), null);
});
test('two wallets sharing an identity are independently checked, never deduplicated by UI', async () => {
  assert.equal((await inspectIdentity(identity)).state, 'met');
  assert.deepEqual(reputationIssues(rep), []);
  assert.deepEqual(reputationIssues({ ...rep, wallet: 'B', expectedWallet: 'B', account: 'B-rep', expectedAccount: 'B-rep' }), []);
  assert.equal(walletLinkIssue(true, true), null);
});
for (const next of ['wallet-B/gate-A/rpc', 'wallet-A/gate-B/rpc', 'wallet-A/gate-A/rpc-2']) {
  test(`in-flight evidence is discarded after switching to ${next}`, async () => {
    const scope = new RequestScope(); scope.select('wallet-A/gate-A/rpc');
    const current = scope.capture();
    let resolve;
    const pending = new Promise(r => { resolve = r; });
    let published = false;
    const check = pending.then(() => { if (current()) published = true; });
    scope.select(next); scope.select('wallet-A/gate-A/rpc');
    resolve(); await check;
    assert.equal(published, false);
    assert.equal(scope.capture()(), true);
  });
}
test('installed SDK derives independent wallet records and community/season reputation addresses', async () => {
  const { PublicKey } = require('@solana/web3.js');
  const sdk = require('@grapenpm/grape-access-sdk');
  const a = new PublicKey(new Uint8Array(32).fill(1));
  const b = new PublicKey(new Uint8Array(32).fill(2));
  const [gate] = await sdk.findAccessPda(a);
  const [recordA] = await sdk.findAccessCheckRecordPda(gate, a);
  const [recordB] = await sdk.findAccessCheckRecordPda(gate, b);
  assert.equal(recordA.equals(recordB), false);
  const [repA] = await sdk.findVineReputationPda(a, a, 1);
  for (const [config, wallet, season] of [[a, b, 1], [b, a, 1], [a, a, 2]]) {
    const [other] = await sdk.findVineReputationPda(config, wallet, season);
    assert.equal(repA.equals(other), false);
  }
});
