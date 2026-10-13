export function pad(v: bigint | string): string {
  const digits = typeof v === "bigint" ? v.toString(16) : v.replace(/^0x/, "");
  return digits.padStart(64, "0");
}

export function calldata(selector: string, ...words: (bigint | string)[]): string {
  return selector + words.map(pad).join("");
}
