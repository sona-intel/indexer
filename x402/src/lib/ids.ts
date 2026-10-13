export function rowId(chainId: number, block: number, logIndex: number): string {
  return `${chainId}_${block}_${logIndex}`;
}

export function selectorOf(input: string | undefined): string | undefined {
  if (input === undefined || input.length < 10) return undefined;
  return input.slice(0, 10).toLowerCase();
}

export function gasCost(gas: bigint | undefined, gasPrice: bigint | undefined): bigint | undefined {
  if (gas === undefined || gasPrice === undefined) return undefined;
  return gas * gasPrice;
}
