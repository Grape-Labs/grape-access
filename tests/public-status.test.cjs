const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BorshAccountsCoder, BN } = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const sdk = require('@grapenpm/grape-access-sdk');
const { readPublicStatus, parseStatusSelection, publicStatusPath, describePublicRequirements } = require(process.env.PUBLIC_STATUS_MODULE);
const key = n => new PublicKey(new Uint8Array(32).fill(n));
const selection = { gateId: key(1).toBase58(), wallet: key(2).toBase58(), cluster: 'devnet' };
const coder = new BorshAccountsCoder(sdk.IDL);
async function fixture({ gate = {}, record = {}, missingGate = false, missingRecord = false, owner = sdk.GPASS_PROGRAM_ID, badData = false } = {}) {
  const [access] = await sdk.findAccessPda(key(1));
  const info = data => ({ data, owner, executable: false, lamports: 1, rentEpoch: 0 });
  const gateData = await coder.encode('Access', { version: 1, accessId: key(1), authority: key(3), criteria: { minReputation: { vineConfig: key(4), minPoints: new BN(100), season: 1 } }, accessType: { reusable: {} }, metadataUri: '', isActive: true, createdAt: new BN(1), totalChecks: new BN(1), successfulChecks: new BN(1), bump: 1, ...gate });
  const recordData = await coder.encode('AccessCheckRecord', { version: 1, access, user: key(2), passed: true, checkedAt: new BN(1700000000), bump: 1, ...record });
  return { getMultipleAccountsInfoAndContext: async (addresses, config) => {
    assert.equal(addresses.length, 2);
    assert.equal(config.commitment, 'confirmed');
    return { context: { slot: 1234 }, value: [missingGate ? null : info(badData ? Buffer.alloc(8) : gateData), missingRecord ? null : info(recordData)] };
  } };
}
test('public result comes from a confirmed matching on-chain record', async () => {
  const result = await readPublicStatus(await fixture(), selection);
  assert.equal(result.state, 'recorded-pass'); assert.equal(result.slot, 1234);
  assert.equal(result.checkedAt, 1700000000); assert.match(result.requirements[0], /100.*season 1/);
});
test('inactive gate preserves history without claiming current access', async () => {
  const result = await readPublicStatus(await fixture({ gate: { isActive: false } }), selection);
  assert.equal(result.gateActive, false); assert.equal(result.state, 'recorded-pass');
});
test('missing or unpopulated record does not become failed eligibility', async () => {
  for (const options of [{ missingRecord: true }, { record: { checkedAt: new BN(0), passed: false } }]) {
    assert.equal((await readPublicStatus(await fixture(options), selection)).state, 'no-record');
  }
});
test('closed or missing gate does not expose an orphan record as a pass', async () => {
  assert.equal((await readPublicStatus(await fixture({ missingGate: true }), selection)).state, 'gate-missing');
});
test('a recorded failed check is distinct from an absent check', async () => {
  assert.equal((await readPublicStatus(await fixture({ record: { passed: false } }), selection)).state, 'recorded-fail');
});
test('RPC failure propagates instead of returning missing or failed', async () => {
  await assert.rejects(readPublicStatus({ getMultipleAccountsInfoAndContext: async () => { throw new Error('RPC offline'); } }, selection), /RPC offline/);
});
test('wrong account owner and unsupported layouts are unavailable', async () => {
  for (const options of [{ owner: key(9) }, { badData: true }]) await assert.rejects(readPublicStatus(await fixture(options), selection));
});
test('another wallet, community or gate cannot supply the shared proof', async () => {
  for (const options of [{ record: { user: key(8) } }, { record: { access: key(8) } }, { gate: { accessId: key(8) } }]) await assert.rejects(readPublicStatus(await fixture(options), selection), /mismatch|does not match/);
});
test('URL verdicts and RPC credentials never become evidence or enter canonical share links', () => {
  const params = new URLSearchParams({ ...selection, passed: 'true', checkedAt: '123', rpc: 'https://private.example/?key=secret', identity: 'social-id' });
  const parsed = parseStatusSelection(params);
  assert.deepEqual(parsed, selection);
  const path = publicStatusPath(parsed);
  assert.equal(path.includes('passed'), false); assert.equal(path.includes('secret'), false); assert.equal(path.includes('identity'), false);
});
test('invalid identifiers and custom networks are rejected', () => {
  for (const values of [{ ...selection, wallet: 'invalid' }, { ...selection, gateId: '' }, { ...selection, cluster: 'custom' }]) assert.throws(() => parseStatusSelection(new URLSearchParams(values)));
});

test('decoded byte-vector platforms are accurately described on the public page', () => {
  const lines = describePublicRequirements({ verifiedWithWallet: { grapeSpace: key(3), platforms: Buffer.from([0, 2]) } });
  assert.match(lines[0], /Discord, Twitter/);
  assert.match(lines[2], /linked to this wallet/);
});
