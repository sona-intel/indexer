import { gasCost, rowId, selectorOf } from "./ids";
import type { Decoded } from "./method";

export type Tx = { hash: string; from?: string; to?: string; input?: string; gas?: bigint; gasPrice?: bigint };

export type Logged = {
  chainId: number;
  logIndex: number;
  block: { number: number; timestamp: number };
  transaction: Tx;
};

export function paymentRow(event: Logged, d: Decoded & { token?: string; payer?: string; nonce?: string }) {
  const tx = event.transaction;
  return {
    id: rowId(event.chainId, event.block.number, event.logIndex),
    blockNumber: event.block.number,
    blockTime: event.block.timestamp,
    txHash: tx.hash,
    logIndex: event.logIndex,
    method: d.method,
    token: d.token,
    payer: d.payer,
    payee: d.payee,
    amount: d.amount,
    nonce: d.nonce,
    validAfter: d.validAfter,
    validBefore: d.validBefore,
    relayer: tx.from,
    txTo: tx.to,
    selector: selectorOf(tx.input),
    gasCost: gasCost(tx.gas, tx.gasPrice),
  };
}

type Minted = Omit<Logged, "transaction"> & { transaction: Pick<Tx, "hash" | "from" | "to"> };

export function mintRow(event: Minted, recipient: string, amount: bigint) {
  const tx = event.transaction;
  return {
    id: rowId(event.chainId, event.block.number, event.logIndex),
    blockNumber: event.block.number,
    blockTime: event.block.timestamp,
    txHash: tx.hash,
    recipient,
    amount,
    relayer: tx.from,
    txTo: tx.to,
  };
}
