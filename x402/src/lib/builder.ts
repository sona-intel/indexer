const MARKER = "80218021802180218021802180218021";
const MAX_CHARS = 128;

// CDP publishes no signer list, so its ERC-8021 code is the only evidence of the facilitator
export function builderCodes(input: string | undefined): string | undefined {
  if (input === undefined || input.length % 2 !== 0 || !/^0x[0-9a-f]*$/i.test(input)) return undefined;
  const hex = input.slice(2).toLowerCase();
  if (!hex.endsWith(MARKER)) return undefined;
  const body = hex.slice(0, hex.length - MARKER.length);
  const schema = body.slice(-2);
  const lengthChars = schema === "00" ? 2 : schema === "02" ? 4 : 0;
  if (lengthChars === 0 || body.length < 2 + lengthChars) return undefined;
  const length = Number.parseInt(body.slice(-2 - lengthChars, -2), 16);
  const end = body.length - 2 - lengthChars;
  if (length === 0 || end < length * 2) return undefined;
  const data = bytesOf(body.slice(end - length * 2, end));
  const text = schema === "00" ? printable(data) : (cborText(data) ?? (printable(data) === "" ? "" : rawHex(data)));
  return text === "" ? undefined : text.slice(0, MAX_CHARS);
}

function bytesOf(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function rawHex(bytes: number[]): string {
  return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function printable(bytes: number[]): string {
  let out = "";
  let gap = false;
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) {
      if (gap && out !== "") out += "|";
      gap = false;
      out += String.fromCharCode(b);
    } else {
      gap = true;
    }
  }
  return out;
}

// the draft puts a map of short text keys in the suffix, values of other types are skipped
function cborText(bytes: number[]): string | undefined {
  let at = 0;
  const head = (): { major: number; value: number } | undefined => {
    const b = bytes[at++];
    if (b === undefined) return undefined;
    const info = b & 31;
    if (info < 24) return { major: b >> 5, value: info };
    if (info === 24) {
      const next = bytes[at++];
      return next === undefined ? undefined : { major: b >> 5, value: next };
    }
    return undefined;
  };
  const text = (): string | undefined => {
    const h = head();
    if (h === undefined || h.major !== 3 || at + h.value > bytes.length) return undefined;
    const s = String.fromCharCode(...bytes.slice(at, at + h.value));
    at += h.value;
    return /^[\x20-\x7e]*$/.test(s) ? s : undefined;
  };
  const skip = (): boolean => {
    const h = head();
    if (h === undefined) return false;
    if (h.major === 0 || h.major === 1 || h.major === 7) return true;
    if (h.major !== 2 || at + h.value > bytes.length) return false;
    at += h.value;
    return true;
  };
  const map = head();
  if (map === undefined || map.major !== 5 || map.value === 0) return undefined;
  const pairs: string[] = [];
  for (let i = 0; i < map.value; i++) {
    const k = text();
    if (k === undefined) return undefined;
    const valueAt = at;
    const v = text();
    if (v !== undefined) {
      pairs.push(`${k}=${v}`);
    } else {
      at = valueAt;
      if (!skip()) return undefined;
    }
  }
  return at === bytes.length ? pairs.join(",") : undefined;
}
