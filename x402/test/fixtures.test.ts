import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

if (!process.env.ENVIO_API_TOKEN) throw new Error("ENVIO_API_TOKEN is not set");

const USDC = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const F1_PAYEE = "0x1995159c8d4df2268a17c0169a80f0e7d11a7424";
const F3_PAYEE = "0x038e145fa0d1432b4cf16cf3257d8cc1d64682fd";

const cache = new Map<string, ReturnType<typeof load>>();

function window(start: number, end = start) {
  const key = `${start}_${end}`;
  let hit = cache.get(key);
  if (!hit) cache.set(key, (hit = load(start, end)));
  return hit;
}

async function load(start: number, end: number) {
  const indexer = createTestIndexer();
  await indexer.process({ chains: { 143: { startBlock: start, endBlock: end } } });
  const all = await indexer.X402Payment.getAll();
  const usdc = all.filter((r) => r.token === USDC);
  const mints = await indexer.UsdcMint.getAll();
  console.log(`window ${start} to ${end} rows of other tokens: ${all.length - usdc.length}`);
  return { all, usdc, mints };
}

const byId = <T extends { id: string }>(rows: T[], id: string) => rows.find((r) => r.id === id);
const byPosition = <T extends { blockNumber: number; logIndex: number }>(rows: T[]) =>
  [...rows].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

describe("USDC row counts per window", () => {
  it.each([
    [52_996_000, 1],
    [61_900_000, 1],
    [97_000_000, 169],
    [101_000_000, 1656],
    [102_500_000, 1615],
    [104_500_000, 1554],
    [107_000_000, 1829],
    [108_500_000, 1],
    [111_350_000, 1518],
    [111_600_000, 1528],
    [111_700_000, 1378],
  ])("window %i holds %i USDC rows", async (s, n) => expect((await window(s, s + 999)).usdc).toHaveLength(n));

  it("quiet head holds 0 USDC rows", async () => expect((await window(112_620_493, 112_625_492)).usdc).toHaveLength(0));
});

describe("EIP-3009 windows", () => {
  it("decodes the first Molandak call", async () => {
    const { usdc } = await window(52_996_000, 52_996_999);
    expect(usdc[0]).toMatchObject({
      txHash: "0xdfab5948beeb75ea2bfa333df9a8a5487a831b7c94cb9c041a9a117ccf55fd25",
      blockTime: 1770136004,
      method: "eip3009_transfer",
      payee: "0x3deff9096a99515e81f9f35f940e52a0e5fc4407",
      amount: 1000n,
      gasCost: 17629595283900000n,
    });
  });

  it("decodes the bytes-signature call", async () => {
    const { usdc } = await window(61_900_000, 61_900_999);
    expect(usdc[0]).toMatchObject({
      txHash: "0xa9ffa7a3bdfb867095568c32c8f2bd50af82a65afa0b7e1a4bb108f4715f0a3a",
      selector: "0xcf092995",
      relayer: "0x210f01cf42b4ade5b5f4fa85f483b8a6c31c6f25",
      payee: "0x8e6d686bca845a7fd0bad38a707ea334e16bdacf",
      amount: 90698n,
    });
  });

  it("keeps a routed call as other without payee or amount", async () => {
    const { usdc } = await window(76_900_000, 76_900_999);
    expect(usdc).toHaveLength(2);
    for (const r of usdc) {
      expect(r).toMatchObject({
        method: "other",
        txTo: "0xce71bb7db465378db1271c97eaa518ca37e4a85b",
        selector: "0xbc28300c",
      });
      expect(r.payee).toBeUndefined();
      expect(r.amount).toBeUndefined();
    }
  });

  it("F2 paced window pays one payee 10000 every time", async () => {
    const { usdc } = await window(97_000_000, 97_000_999);
    expect(usdc.every((r) => r.payee === "0xf999ebd45ed2fc344fbbc4d307bb4a0ea9b30941" && r.amount === 10000n)).toBe(true);
  });

  it("F1 107M window holds 1828 transfers to the F1 payee and 1 other", async () => {
    const { usdc } = await window(107_000_000, 107_000_999);
    expect(usdc.filter((r) => r.method === "eip3009_transfer" && r.payee === F1_PAYEE)).toHaveLength(1828);
    expect(usdc.filter((r) => r.method === "other")).toHaveLength(1);
  });

  it("F1 108.5M row is other", async () => {
    const { usdc } = await window(108_500_000, 108_500_999);
    expect(usdc[0]?.method).toBe("other");
  });

  it.each([111_350_000, 111_600_000, 111_700_000])("F1 window %i pays 100 to the F1 payee in every row", async (s) => {
    const { usdc } = await window(s, s + 999);
    expect(usdc.every((r) => r.amount === 100n && r.payee === F1_PAYEE)).toBe(true);
  });

  it("finds the 3 strays", async () => {
    const { usdc } = await window(111_860_078, 111_870_077);
    const rows = byPosition(usdc);
    expect(rows.map((r) => r.blockNumber)).toEqual([111860097, 111860485, 111863489]);
    expect(rows[0]).toMatchObject({ amount: 1000000n, relayer: "0x74dd46f2e70b964895fe21aa70c60a9b61fbe395" });
    for (const r of rows.slice(1)) {
      expect(r).toMatchObject({ amount: 10000n, payee: "0x93053f1e7a5efeda532fe69cbbe43cbec3a0f13f" });
    }
  });

  it("finds one self-payment in each listed block", async () => {
    const blocks = [112_301_324, 112_303_231, 112_324_998, 112_325_036, 112_325_051, 112_350_204];
    const found = [];
    for (const b of blocks) {
      const { usdc } = await window(b);
      const own = usdc.filter((r) => r.payer !== undefined && r.payer === r.payee);
      expect(own, `block ${b}`).toHaveLength(1);
      found.push(own[0]);
    }
    expect(found.at(-1)).toMatchObject({ payer: "0x940ecb27d8f4f7009c8bc12969496e9639717638", amount: 1000n });
  });

  it("scripted test F3 holds 36 rows to one payee", async () => {
    const { usdc } = await window(112_186_000, 112_187_999);
    const rows = byPosition(usdc.filter((r) => r.payee === F3_PAYEE));
    expect(rows).toHaveLength(36);
    expect(rows[0]).toMatchObject({
      txHash: "0x4f243f8406a67e191cddd9e276fe2faf8dc4e09d878a2a9fda2f3720bc9b8b7f",
      blockNumber: 112186875,
      payer: "0x971e94fed75a8f527566206e68d85e52f050c6d1",
      amount: 5000n,
    });
  });

  it("decodes the Across router call as other", async () => {
    const { all } = await window(112_611_359);
    expect(byId(all, "143_112611359_110")).toMatchObject({
      txHash: "0x33ac641e1d35014972b7c1b378dc5f36473a4314b31ea3368d38337984993e05",
      method: "other",
      payer: "0xd36e5c889a6cda9924dbd9ad6c4dba06a37b7227",
      txTo: "0x998d7c178a1f9607b47ea3a8e22426451b3ce707",
      selector: "0xe3a64e34",
      relayer: "0x07ae8551be970cb1cca11dd7a11f47ae82e70e67",
      gasCost: 56468070400000000n,
    });
  });
});

describe("Permit2 proxies", () => {
  it("finds the 6 proxy rows in block order", async () => {
    const { all } = await window(110_775_221, 110_775_343);
    const rows = byPosition(all.filter((r) => r.method.startsWith("permit2_")));
    expect(rows.map((r) => [r.method, r.blockNumber])).toEqual([
      ["permit2_exact", 110775221],
      ["permit2_exact", 110775245],
      ["permit2_exact", 110775265],
      ["permit2_upto", 110775309],
      ["permit2_upto", 110775324],
      ["permit2_upto", 110775343],
    ]);
  });

  it("decodes the Exact settle", async () => {
    const { all } = await window(110_775_221, 110_775_343);
    expect(byId(all, "143_110775265_82")).toMatchObject({
      payer: "0xd156f8adf8ada32470282b4fc6ba0ddd36c7352d",
      payee: "0x1c47e9c085c2b7458f5b6c16ccbd65a65255a9f6",
      amount: 1000n,
      validAfter: 1791209657n,
      validBefore: 1791213857n,
      relayer: "0x22c4953c882264cab154ea688004e6dead21eeeb",
    });
  });

  it("decodes the Exact settleWithPermit", async () => {
    const { all } = await window(110_775_221, 110_775_343);
    expect(byId(all, "143_110775245_167")).toMatchObject({
      payer: "0x9412787471f58e3d9a302ede90e8705464ce2bd4",
      validAfter: 1791209653n,
    });
  });

  it("decodes the Upto settle", async () => {
    const { all } = await window(110_775_221, 110_775_343);
    expect(byId(all, "143_110775343_106")).toMatchObject({
      payer: "0xa9718dfe855093a45ffce451ea764c60fb5f0e3c",
      amount: 1000n,
      validBefore: 1791213881n,
    });
  });

  it("decodes the Molandak Exact settle", async () => {
    const { all } = await window(82_686_062);
    expect(byId(all, "143_82686062_77")).toMatchObject({
      payer: "0x84ac1d1dad9382080b77cfc20c017b3bd0a7378c",
      payee: "0x59cb2aafb2d5cb65e9051dce0bae18c908d62562",
      amount: 50000n,
      validAfter: 0n,
    });
  });
});

describe("batch deposits and mints", () => {
  it("labels the batch deposit without payee or amount", async () => {
    const { all } = await window(110_769_172);
    const rows = all.filter((r) => r.method === "batch_deposit");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ txHash: "0x20ae381947f0c42b3b33ad4541dd6d91a3b115d2a6a7c633bbeef736ab07424c" });
    expect(rows[0]?.payee).toBeUndefined();
    expect(rows[0]?.amount).toBeUndefined();
  });

  it("indexes only mints and splits the 51 bridge mints between two relayers through one wrapper", async () => {
    const { mints } = await window(111_192_000, 111_192_999);
    expect(mints).toHaveLength(104);
    const funded = mints.filter((m) => m.amount === 480379n);
    expect(funded).toHaveLength(51);
    expect(funded.every((m) => m.txTo === "0x81d40f21f12a8f0e3252bccb954d722d4c464b64")).toBe(true);
    expect(funded.filter((m) => m.relayer === "0x99f5a2e5d81f22ddb130f4a194584532a3dc3c2e")).toHaveLength(3);
    expect(funded.filter((m) => m.relayer === "0xc0ac9fdde6e02df3a63d0bbdab28a404332e0ba4")).toHaveLength(48);
  });
});
