import { addressWord, nonceWord, uintWord, words } from "./decode";
import { selectorOf } from "./ids";

export type Method =
  | "eip3009_transfer"
  | "eip3009_receive"
  | "batch_deposit"
  | "permit2_exact"
  | "permit2_upto"
  | "other";

export type Decoded = {
  method: Method;
  token?: string;
  payer?: string;
  payee?: string;
  amount?: bigint;
  nonce?: string;
  validAfter?: bigint;
  validBefore?: bigint;
};

const BATCH = "0x4020074e9df2ce1dee5a9c1b5c3f541d02a10003";
const EIP3009_METHOD = new Map<string, Method>([
  ["0xe3ee160e", "eip3009_transfer"],
  ["0xcf092995", "eip3009_transfer"],
  ["0xef55bec6", "eip3009_receive"],
  ["0x88b7ab63", "eip3009_receive"],
]);
const EIP3009_HEAD_WORDS = 6;

const SETTLE = {
  exact: {
    method: "permit2_exact",
    selectorShift: new Map([
      ["0x13cd3b53", 0],
      ["0xfa340378", 5],
    ]),
    words: 7,
    at: { token: 0, amount: 1, nonce: 2, deadline: 3, owner: 4, payee: 5, validAfter: 6 },
  },
  upto: {
    method: "permit2_upto",
    selectorShift: new Map([
      ["0xff11e7b4", 0],
      ["0x016c1748", 5],
    ]),
    words: 9,
    at: { token: 0, amount: 4, nonce: 2, deadline: 3, owner: 5, payee: 6, validAfter: 8 },
  },
} as const;

export function classifyAuthorization(a: {
  emitter: string;
  authorizer: string;
  nonce: string;
  txTo?: string;
  input?: string;
}): Decoded {
  const txTo = a.txTo?.toLowerCase();
  if (txTo === BATCH) return { method: "batch_deposit" };
  if (txTo === undefined || txTo !== a.emitter.toLowerCase() || a.input === undefined) return { method: "other" };

  const selector = selectorOf(a.input);
  const method = selector === undefined ? undefined : EIP3009_METHOD.get(selector);
  if (method === undefined) return { method: "other" };

  const w = words(a.input, 0, EIP3009_HEAD_WORDS);
  if (w === undefined) return { method: "other" };
  const [from, to, value, validAfter, validBefore, nonce] = w as [string, string, string, string, string, string];
  if (addressWord(from) !== a.authorizer.toLowerCase() || nonceWord(nonce) !== a.nonce.toLowerCase()) {
    return { method: "other" };
  }
  return {
    method,
    payee: addressWord(to),
    amount: uintWord(value),
    validAfter: uintWord(validAfter),
    validBefore: uintWord(validBefore),
  };
}

export function decodeSettlement(
  proxy: "exact" | "upto",
  a: { emitter: string; txTo?: string; input?: string },
): Decoded {
  const layout = SETTLE[proxy];
  const kept: Decoded = { method: layout.method };
  if (a.input === undefined || a.txTo?.toLowerCase() !== a.emitter.toLowerCase()) return kept;

  const selector = selectorOf(a.input);
  const shift = selector === undefined ? undefined : layout.selectorShift.get(selector);
  if (shift === undefined) return kept;

  const w = words(a.input, shift, layout.words);
  if (w === undefined) return kept;
  const f = layout.at;
  const at = (i: number) => w[i] as string;
  return {
    method: layout.method,
    token: addressWord(at(f.token)),
    payer: addressWord(at(f.owner)),
    payee: addressWord(at(f.payee)),
    amount: uintWord(at(f.amount)),
    nonce: nonceWord(at(f.nonce)),
    validAfter: uintWord(at(f.validAfter)),
    validBefore: uintWord(at(f.deadline)),
  };
}
