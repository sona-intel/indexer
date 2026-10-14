import { createTestIndexer, type TestIndexer } from "envio";
import { describe, it } from "vitest";
import { calldata } from "../../test/support";

type Item = NonNullable<NonNullable<Parameters<TestIndexer["process"]>[0]["chains"][5042]>["simulate"]>[number];
// the generated simulate type ignores inline fields selections, so transaction stays open
type Sim<T> = T extends unknown ? Omit<T, "transaction"> & { transaction?: Record<string, unknown> } : never;

const USDC = "0x3600000000000000000000000000000000000000";
const BATCH = "0x4020074e9df2ce1dee5a9c1b5c3f541d02a10003";
const UPTO = "0x4020a4f3b7b90cca423b9fabcc0ce57c6c240002";
const payer = "0x00000000000000000000000000000000000000a1";
const payee = "0x3deff9096a99515e81f9f35f940e52a0e5fc4407";
const nonce = "0x" + "ab".repeat(32);
const sig = ["0x1b", "0x" + "11".repeat(32), "0x" + "22".repeat(32)];
const TX = "0xdfab5948beeb75ea2bfa333df9a8a5487a831b7c94cb9c041a9a117ccf55fd25";
const RELAYER = "0x7f6a2850669202519f0fe8aa912451238820db86";
const RELAYER2 = "0x22c4953c882264cab154ea688004e6dead21eeeb";
const CACE = "0xcace789ea79011b164f9e3cc4146de0bd3eb41a8";
const ZERO = "0x0000000000000000000000000000000000000000";
const owner = "0xd156f8adf8ada32470282b4fc6ba0ddd36c7352d";
const to = "0x1c47e9c085c2b7458f5b6c16ccbd65a65255a9f6";
const upto = [USDC, 5000n, "0xabc36af9e1", 1791213881n, 1200n, owner, to, CACE, 1791209681n];

async function run(simulate: Sim<Item>[]) {
  const indexer = createTestIndexer();
  await indexer.process({ chains: { 5042: { simulate: simulate as Item[] } } });
  return indexer;
}

describe("authorization handler", () => {
  it("stores an Arc USDC authorization", async (t) => {
    const input = calldata("0xe3ee160e", payer, payee, 1000n, 0n, 1770136304n, nonce, ...sig);
    const i = await run([
      {
        contract: "Eip3009",
        event: "AuthorizationUsed",
        srcAddress: USDC,
        logIndex: 3,
        block: { number: 52996376, timestamp: 1770136004 },
        params: { authorizer: payer, nonce },
        transaction: { hash: TX, from: RELAYER, to: USDC, input, gas: 172839n, gasPrice: 102000100000n },
      },
    ]);
    t.expect(await i.X402Payment.get("5042_52996376_3")).toMatchObject({
      blockNumber: 52996376,
      blockTime: 1770136004,
      txHash: TX,
      logIndex: 3,
      method: "eip3009_transfer",
      token: USDC,
      payer,
      payee,
      amount: 1000n,
      nonce,
      validAfter: 0n,
      validBefore: 1770136304n,
      relayer: RELAYER,
      txTo: USDC,
      selector: "0xe3ee160e",
      gasCost: 17629595283900000n,
    });
  });

  it("stores a row that carries only a hash", async (t) => {
    const i = await run([
      {
        contract: "Eip3009",
        event: "AuthorizationUsed",
        srcAddress: USDC,
        logIndex: 4,
        block: { number: 52996377, timestamp: 1770136005 },
        params: { authorizer: payer, nonce },
        transaction: { hash: TX },
      },
    ]);
    t.expect(await i.X402Payment.get("5042_52996377_4")).toMatchObject({
      txHash: TX,
      method: "other",
      token: USDC,
      payer,
      nonce,
      payee: undefined,
      amount: undefined,
      relayer: undefined,
      txTo: undefined,
      selector: undefined,
      gasCost: undefined,
    });
  });

  it("labels a batch deposit", async (t) => {
    const i = await run([
      {
        contract: "Eip3009",
        event: "AuthorizationUsed",
        srcAddress: USDC,
        logIndex: 59,
        block: { number: 110769172, timestamp: 1791200000 },
        params: { authorizer: payer, nonce },
        transaction: {
          hash: TX,
          from: RELAYER2,
          to: BATCH,
          input: calldata("0x140f1e75", 0n),
          gas: 200000n,
          gasPrice: 100000000000n,
        },
      },
    ]);
    t.expect(await i.X402Payment.get("5042_110769172_59")).toMatchObject({
      method: "batch_deposit",
      txTo: BATCH,
      selector: "0x140f1e75",
      payee: undefined,
      amount: undefined,
    });
  });
});

describe("permit2 handler", () => {
  it("decodes Upto settleWithPermit", async (t) => {
    const i = await run([
      {
        contract: "UptoProxy",
        event: "SettledWithPermit",
        srcAddress: UPTO,
        logIndex: 7,
        block: { number: 110775300, timestamp: 1791209720 },
        transaction: {
          hash: TX,
          from: CACE,
          to: UPTO,
          input: calldata("0x016c1748", 0n, 0n, 0n, 0n, 0n, ...upto, ...Array(5).fill(0n)),
          gas: 300000n,
          gasPrice: 100000000000n,
        },
      },
    ]);
    t.expect(await i.X402Payment.get("5042_110775300_7")).toMatchObject({
      method: "permit2_upto",
      token: USDC,
      payer: owner,
      payee: to,
      amount: 1200n,
      validAfter: 1791209681n,
      validBefore: 1791213881n,
      relayer: CACE,
      selector: "0x016c1748",
    });
  });
});

describe("mint handler", () => {
  it("stores a mint", async (t) => {
    const i = await run([
      {
        contract: "UsdcMint",
        event: "Transfer",
        srcAddress: USDC,
        logIndex: 11,
        block: { number: 111192100, timestamp: 1791300000 },
        params: { from: ZERO, to: payee, value: 480379n },
        transaction: {
          hash: TX,
          from: "0x99f5a2e5d81f22ddb130f4a194584532a3dc3c2e",
          to: "0x81d40f21f12a8f0e3252bccb954d722d4c464b64",
        },
      },
    ]);
    t.expect(await i.UsdcMint.get("5042_111192100_11")).toMatchObject({
      blockNumber: 111192100,
      blockTime: 1791300000,
      txHash: TX,
      recipient: payee,
      amount: 480379n,
      relayer: "0x99f5a2e5d81f22ddb130f4a194584532a3dc3c2e",
      txTo: "0x81d40f21f12a8f0e3252bccb954d722d4c464b64",
    });
  });
});
