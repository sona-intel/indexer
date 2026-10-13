import { createTestIndexer, type TestIndexer } from "envio";
import { describe, it } from "vitest";
import { calldata } from "../../test/support";

type Item = NonNullable<NonNullable<Parameters<TestIndexer["process"]>[0]["chains"][8453]>["simulate"]>[number];
// the generated simulate type ignores inline fields selections, so transaction stays open
type Sim<T> = T extends unknown ? Omit<T, "transaction"> & { transaction?: Record<string, unknown> } : never;

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const EXACT = "0x402085c248eea27d92e8b30b2c58ed07f9e20001";
const UPTO = "0x4020a4f3b7b90cca423b9fabcc0ce57c6c240002";
const BATCH = "0x4020074e9df2ce1dee5a9c1b5c3f541d02a10003";
const MARKER = "80218021802180218021802180218021";
const payer = "0x00000000000000000000000000000000000000a1";
const payee = "0x3deff9096a99515e81f9f35f940e52a0e5fc4407";
const nonce = "0x" + "ab".repeat(32);
const sig = ["0x1b", "0x" + "11".repeat(32), "0x" + "22".repeat(32)];
const TX = "0xdfab5948beeb75ea2bfa333df9a8a5487a831b7c94cb9c041a9a117ccf55fd25";
const CDP = "0x1111111111111111111111111111111111111111";
const ZERO = "0x0000000000000000000000000000000000000000";
const cdpSuffix = "a1" + "61" + "77" + "6a" + Buffer.from("cdp_facil1").toString("hex") + "000e" + "02" + MARKER;

async function run(simulate: Sim<Item>[]) {
  const indexer = createTestIndexer();
  await indexer.process({ chains: { 8453: { simulate: simulate as Item[] } } });
  return indexer;
}

describe("base authorization handler", () => {
  it("stores a CDP settlement with its builder code", async (t) => {
    const input = calldata("0xe3ee160e", payer, payee, 1000n, 0n, 1790000300n, nonce, ...sig) + cdpSuffix;
    const i = await run([
      {
        contract: "Eip3009",
        event: "AuthorizationUsed",
        srcAddress: USDC,
        logIndex: 3,
        block: { number: 51234200, timestamp: 1789257800 },
        params: { authorizer: payer, nonce },
        transaction: { hash: TX, from: CDP, to: USDC, input, gas: 90000n, gasPrice: 5000000n },
      },
    ]);
    const row = await i.X402Payment.get("8453_51234200_3");
    t.expect(row).toMatchObject({
      blockTime: 1789257800,
      method: "eip3009_transfer",
      token: USDC,
      payer,
      payee,
      amount: 1000n,
      relayer: CDP,
      txTo: USDC,
      gasCost: 450000000000n,
    });
    t.expect(row?.builderCodes).toContain("cdp_facil1");
  });

  it("stores no builder code for a plain call", async (t) => {
    const input = calldata("0xe3ee160e", payer, payee, 1000n, 0n, 1790000300n, nonce, ...sig);
    const i = await run([
      {
        contract: "Eip3009",
        event: "AuthorizationUsed",
        srcAddress: USDC,
        logIndex: 4,
        block: { number: 51234201, timestamp: 1789257802 },
        params: { authorizer: payer, nonce },
        transaction: { hash: TX, from: CDP, to: USDC, input, gas: 90000n, gasPrice: 5000000n },
      },
    ]);
    t.expect((await i.X402Payment.get("8453_51234201_4"))?.builderCodes).toBeUndefined();
  });

  it("stores a row that carries only a hash", async (t) => {
    const i = await run([
      {
        contract: "Eip3009",
        event: "AuthorizationUsed",
        srcAddress: USDC,
        logIndex: 5,
        block: { number: 51234202, timestamp: 1789257804 },
        params: { authorizer: payer, nonce },
        transaction: { hash: TX },
      },
    ]);
    t.expect(await i.X402Payment.get("8453_51234202_5")).toMatchObject({
      txHash: TX,
      method: "other",
      token: USDC,
      relayer: undefined,
      builderCodes: undefined,
    });
  });

  it("labels a batch deposit on the batch proxy", async (t) => {
    const i = await run([
      {
        contract: "Eip3009",
        event: "AuthorizationUsed",
        srcAddress: USDC,
        logIndex: 6,
        block: { number: 51234203, timestamp: 1789257806 },
        params: { authorizer: payer, nonce },
        transaction: { hash: TX, from: CDP, to: BATCH, input: calldata("0x140f1e75", 0n), gas: 200000n, gasPrice: 1000000n },
      },
    ]);
    t.expect(await i.X402Payment.get("8453_51234203_6")).toMatchObject({ method: "batch_deposit", txTo: BATCH });
  });
});

describe("base permit2 handler", () => {
  const owner = "0xd156f8adf8ada32470282b4fc6ba0ddd36c7352d";
  const to = "0x1c47e9c085c2b7458f5b6c16ccbd65a65255a9f6";

  it("decodes Exact settle and keeps its builder code", async (t) => {
    const input =
      calldata("0x13cd3b53", USDC, 1000n, "0xfe1a592bc8", 1790000300n, owner, to, 1789999900n, ...Array(5).fill(0n)) + cdpSuffix;
    const i = await run([
      {
        contract: "ExactProxy",
        event: "Settled",
        srcAddress: EXACT,
        logIndex: 8,
        block: { number: 51234300, timestamp: 1789258000 },
        transaction: { hash: TX, from: CDP, to: EXACT, input, gas: 300000n, gasPrice: 1000000n },
      },
    ]);
    const row = await i.X402Payment.get("8453_51234300_8");
    t.expect(row).toMatchObject({ method: "permit2_exact", token: USDC, payer: owner, payee: to, amount: 1000n });
    t.expect(row?.builderCodes).toContain("cdp_facil1");
  });

  it("decodes Upto settle", async (t) => {
    const input = calldata("0xff11e7b4", USDC, 5000n, "0xabc36af9e1", 1790000300n, 1200n, owner, to, CDP, 1789999900n, ...Array(5).fill(0n));
    const i = await run([
      {
        contract: "UptoProxy",
        event: "Settled",
        srcAddress: UPTO,
        logIndex: 9,
        block: { number: 51234301, timestamp: 1789258002 },
        transaction: { hash: TX, from: CDP, to: UPTO, input, gas: 300000n, gasPrice: 1000000n },
      },
    ]);
    t.expect(await i.X402Payment.get("8453_51234301_9")).toMatchObject({ method: "permit2_upto", amount: 1200n, builderCodes: undefined });
  });
});

describe("base mint handler", () => {
  it("stores a USDC mint", async (t) => {
    const i = await run([
      {
        contract: "UsdcMint",
        event: "Transfer",
        srcAddress: USDC,
        logIndex: 11,
        block: { number: 51234400, timestamp: 1789258200 },
        params: { from: ZERO, to: payee, value: 480379n },
        transaction: { hash: TX, from: CDP, to: "0x81d40f21f12a8f0e3252bccb954d722d4c464b64" },
      },
    ]);
    t.expect(await i.UsdcMint.get("8453_51234400_11")).toMatchObject({
      blockNumber: 51234400,
      recipient: payee,
      amount: 480379n,
      relayer: CDP,
    });
  });
});
