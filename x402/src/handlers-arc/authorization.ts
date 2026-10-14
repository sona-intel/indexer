import { indexer } from "envio";
import { classifyAuthorization } from "../lib/method";
import { paymentRow } from "../lib/rows";

indexer.onEvent(
  {
    contract: "Eip3009",
    event: "AuthorizationUsed",
    fields: {
      transaction: ["hash", "from", "to", "input", "gas", "gasPrice"],
      block: ["timestamp"],
    },
  },
  async ({ event, context }) => {
    const { authorizer, nonce } = event.params;
    const tx = event.transaction;
    const decoded = classifyAuthorization({
      emitter: event.srcAddress,
      authorizer,
      nonce,
      txTo: tx.to,
      input: tx.input,
    });
    context.X402Payment.set(paymentRow(event, { ...decoded, token: event.srcAddress, payer: authorizer, nonce }));
  },
);
