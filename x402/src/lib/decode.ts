const HEX = /^[0-9a-f]*$/i;
const SELECTOR_CHARS = 10;
const WORD_CHARS = 64;

export function words(input: string, index: number, count: number): string[] | undefined {
  const start = SELECTOR_CHARS + index * WORD_CHARS;
  const body = input.slice(start, start + count * WORD_CHARS);
  if (body.length !== count * WORD_CHARS || !HEX.test(body)) return undefined;
  const out = new Array<string>(count);
  for (let i = 0; i < count; i++) out[i] = body.slice(i * WORD_CHARS, (i + 1) * WORD_CHARS);
  return out;
}

export function addressWord(w: string): string {
  return "0x" + w.slice(24).toLowerCase();
}

export function nonceWord(w: string): string {
  return "0x" + w.toLowerCase();
}

export function uintWord(w: string): bigint {
  return BigInt("0x" + w);
}
