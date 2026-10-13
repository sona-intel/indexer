import { indexer } from "envio";
import { mintRow } from "../lib/rows";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

indexer.onEvent(
  {
    contract: "UsdcMint",
    event: "Transfer",
    where: () => ({ params: [{ from: ZERO }] }),
    fields: { transaction: ["hash", "from", "to"], block: ["timestamp"] },
  },
  async ({ event, context }) => {
    context.UsdcMint.set(mintRow(event, event.params.to, event.params.value));
  },
);
