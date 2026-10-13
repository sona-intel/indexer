import { indexer, type EvmOnEventContext } from "envio";
import { builderCodes } from "../lib/builder";
import { decodeSettlement } from "../lib/method";
import { paymentRow, type Logged } from "../lib/rows";

type Settlement = Logged & { srcAddress: string };

const fields = {
  transaction: ["hash", "from", "to", "input", "gas", "gasPrice"],
  block: ["timestamp"],
} as const;

const settle =
  (proxy: "exact" | "upto") =>
  async ({ event, context }: { event: Settlement; context: EvmOnEventContext }) => {
    const tx = event.transaction;
    const decoded = decodeSettlement(proxy, { emitter: event.srcAddress, txTo: tx.to, input: tx.input });
    context.X402Payment.set({ ...paymentRow(event, decoded), builderCodes: builderCodes(tx.input) });
  };

indexer.onEvent({ contract: "ExactProxy", event: "Settled", fields }, settle("exact"));
indexer.onEvent({ contract: "ExactProxy", event: "SettledWithPermit", fields }, settle("exact"));
indexer.onEvent({ contract: "UptoProxy", event: "Settled", fields }, settle("upto"));
indexer.onEvent({ contract: "UptoProxy", event: "SettledWithPermit", fields }, settle("upto"));
