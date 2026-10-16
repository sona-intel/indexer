import { describe, expect, it } from "vitest";
import routed from "../../test/routed.json";
import { calldata } from "../../test/support";
import { classifyAuthorization, decodeSettlement } from "./method";

const USDC = "0x754704bc059f8c67012fed69bc8a327a5aafb603";
const BATCH = "0x4020074e9df2ce1dee5a9c1b5c3f541d02a10003";
const ACROSS = "0x998d7c178a1f9607b47ea3a8e22426451b3ce707";
const EXACT = "0x402085c248eea27d92e8b30b2c58ed07f9e20001";
const UPTO = "0x4020a4f3b7b90cca423b9fabcc0ce57c6c240002";
const payer = "0x00000000000000000000000000000000000000a1";
const payee = "0x3deff9096a99515e81f9f35f940e52a0e5fc4407";
const nonce = "0x" + "ab".repeat(32);
const head = [payer, payee, 1000n, 0n, 1770136304n, nonce];
const sig = ["0x1b", "0x" + "11".repeat(32), "0x" + "22".repeat(32)];
const transfer = calldata("0xe3ee160e", ...head, ...sig);

describe("classifyAuthorization", () => {
  const a = { emitter: USDC, authorizer: payer, nonce, txTo: USDC, input: transfer };
  const decoded = { payee, amount: 1000n, validAfter: 0n, validBefore: 1770136304n };

  it("reads transferWithAuthorization", () =>
    expect(classifyAuthorization(a)).toEqual({ method: "eip3009_transfer", ...decoded }));

  it("reads the bytes-signature form of 420 bytes", () =>
    expect(
      classifyAuthorization({ ...a, input: calldata("0xcf092995", ...head, ...Array(7).fill(0n)) }),
    ).toEqual({ method: "eip3009_transfer", ...decoded }));

  it.each(["0xef55bec6", "0x88b7ab63"])("reads receiveWithAuthorization %s", (s) =>
    expect(classifyAuthorization({ ...a, input: calldata(s, ...head, ...sig) })).toEqual({
      method: "eip3009_receive",
      ...decoded,
    }));

  it("returns lowercase addresses from an uppercase input", () =>
    expect(classifyAuthorization({ ...a, input: transfer.toUpperCase().replace("0X", "0x") })).toEqual({
      method: "eip3009_transfer",
      ...decoded,
    }));

  it("compares addresses without case", () =>
    expect(classifyAuthorization({ ...a, txTo: "0x" + USDC.slice(2).toUpperCase() }).method).toBe(
      "eip3009_transfer",
    ));

  it("labels a batch deposit by tx.to", () =>
    expect(classifyAuthorization({ ...a, txTo: BATCH, input: calldata("0x140f1e75", 0n) })).toEqual({
      method: "batch_deposit",
    }));

  it("labels the Across gateway other", () =>
    expect(classifyAuthorization({ ...a, txTo: ACROSS, input: calldata("0xe3a64e34", 0n) })).toEqual({
      method: "other",
    }));

  it.each([
    ["no tx.to", { txTo: undefined }],
    ["no input", { input: undefined }],
    ["a short input", { input: calldata("0xe3ee160e", ...head.slice(0, 5)) }],
    ["another authorizer", { authorizer: "0x00000000000000000000000000000000000000a2" }],
    ["another nonce", { nonce: "0x" + "cd".repeat(32) }],
    ["a non-hex word", { input: transfer.slice(0, 80) + "zz" + transfer.slice(82) }],
    ["an input without the 0x prefix", { input: transfer.slice(2) }],
  ])("falls back to other with %s", (_n, over) =>
    expect(classifyAuthorization({ ...a, ...over })).toEqual({ method: "other" }));
});

describe("classifyAuthorization of a routed call", () => {
  const MULTICALL = "0xca11bde05977b3631167028862be2a173976ca11";
  const inner = transfer.slice(2);
  const a = { emitter: USDC, authorizer: payer, nonce, txTo: MULTICALL };
  const decoded = { payee, amount: 1000n, validAfter: 0n, validBefore: 1770136304n };

  it("reads the token call inside another contract's input", () =>
    expect(classifyAuthorization({ ...a, input: calldata("0x82ad56cb", 32n, 1n) + inner })).toEqual({
      method: "eip3009_routed",
      ...decoded,
    }));

  it("reads a token call that starts off the word grid", () =>
    expect(classifyAuthorization({ ...a, input: "0x9aefaff8" + "ab".repeat(17) + inner })).toEqual({
      method: "eip3009_routed",
      ...decoded,
    }));

  it("skips an earlier copy of the nonce", () =>
    expect(classifyAuthorization({ ...a, input: calldata("0x82ad56cb", nonce, ...head, 0n) + inner })).toEqual({
      method: "eip3009_routed",
      ...decoded,
    }));

  it.each([
    ["receiveWithAuthorization", calldata("0x82ad56cb", 1n) + calldata("0xef55bec6", ...head, ...sig).slice(2)],
    ["no token selector before the head", calldata("0x82ad56cb", 1n, ...head, ...sig)],
    ["another authorizer", calldata("0x82ad56cb", 1n) + calldata("0xe3ee160e", payee, payee, 1000n, 0n, 1n, nonce).slice(2)],
    ["a head half a byte off", "0x82ad56cb0" + inner],
    ["a head cut short", calldata("0x82ad56cb", 1n) + inner.slice(0, 8 + 5 * 64 + 10)],
  ])("keeps other with %s", (_n, input) => expect(classifyAuthorization({ ...a, input })).toEqual({ method: "other" }));

  it.each(routed)("$name", (r) => {
    const got = classifyAuthorization({ emitter: r.emitter, authorizer: r.authorizer, nonce: r.nonce, txTo: r.txTo, input: r.input });
    if (!r.routed) return expect(got).toEqual({ method: "other" });
    expect(got).toMatchObject({ method: "eip3009_routed", payee: r.transfer?.to, amount: BigInt(r.transfer?.value ?? -1) });
  });
});

describe("decodeSettlement", () => {
  const owner = "0xd156f8adf8ada32470282b4fc6ba0ddd36c7352d";
  const to = "0x1c47e9c085c2b7458f5b6c16ccbd65a65255a9f6";
  const exact = [USDC, 1000n, "0xfe1a592bc8", 1791213857n, owner, to, 1791209657n];
  const want = {
    method: "permit2_exact",
    token: USDC,
    payer: owner,
    payee: to,
    amount: 1000n,
    nonce: "0x" + "0".repeat(54) + "fe1a592bc8",
    validAfter: 1791209657n,
    validBefore: 1791213857n,
  };
  const a = { emitter: EXACT, txTo: EXACT };
  const settle = calldata("0x13cd3b53", ...exact);

  it("reads settle of 388 bytes", () =>
    expect(
      decodeSettlement("exact", { ...a, input: calldata("0x13cd3b53", ...exact, ...Array(5).fill(0n)) }),
    ).toEqual(want));

  it("reads settleWithPermit and ignores a tail of 581 bytes", () =>
    expect(
      decodeSettlement("exact", {
        ...a,
        input: calldata("0xfa340378", 1000n, 0n, 0n, 0n, 0n, ...exact, ...Array(6).fill(0n)) + "00",
      }),
    ).toEqual(want));

  it("stores the Upto actual amount, not the ceiling", () => {
    const upto = [
      USDC,
      5000n,
      "0xabc36af9e1",
      1791213881n,
      1200n,
      owner,
      to,
      "0xcace789ea79011b164f9e3cc4146de0bd3eb41a8",
      1791209681n,
    ];
    const got = decodeSettlement("upto", {
      emitter: UPTO,
      txTo: UPTO,
      input: calldata("0xff11e7b4", ...upto, ...Array(5).fill(0n)),
    });
    expect(got).toEqual({
      method: "permit2_upto",
      token: USDC,
      payer: owner,
      payee: to,
      amount: 1200n,
      nonce: "0x" + "0".repeat(54) + "abc36af9e1",
      validAfter: 1791209681n,
      validBefore: 1791213881n,
    });
    const withPermit = decodeSettlement("upto", {
      emitter: UPTO,
      txTo: UPTO,
      input: calldata("0x016c1748", 0n, 0n, 0n, 0n, 0n, ...upto),
    });
    expect(withPermit).toEqual(got);
  });

  it.each([
    ["another tx.to", { txTo: "0xce71bb7db465378db1271c97eaa518ca37e4a85b", input: calldata("0x13cd3b53", ...exact) }],
    ["the Upto selector on the Exact proxy", { input: calldata("0xff11e7b4", ...exact) }],
    ["a short input", { input: calldata("0x13cd3b53", USDC, 1000n) }],
    ["no input", { input: undefined }],
    ["a non-hex word", { input: settle.slice(0, 80) + "zz" + settle.slice(82) }],
  ])("keeps the method with %s", (_n, over) =>
    expect(decodeSettlement("exact", { ...a, ...over })).toEqual({ method: "permit2_exact" }));
});
