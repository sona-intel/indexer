import { describe, expect, it } from "vitest";
import { builderCodes } from "./builder";

const MARKER = "80218021802180218021802180218021";
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
const body = "0xcf092995" + "11".repeat(32);
const cdp = "a1" + "61" + ascii("w") + "6a" + ascii("cdp_facil1");
const withApp = "a2" + "61" + ascii("a") + "6b" + ascii("bc_rd8s0npa") + "61" + ascii("w") + "6a" + ascii("cdp_facil1");
const suffix = (cbor: string, schema = "02") => cbor + (cbor.length / 2).toString(16).padStart(4, "0") + schema + MARKER;

describe("builderCodes", () => {
  it("reads the CDP code of a CBOR suffix as seen on Base", () =>
    expect(builderCodes(body + "00".repeat(5) + suffix(cdp))).toBe("w=cdp_facil1"));

  it("reads an app code next to the facilitator code", () =>
    expect(builderCodes(body + suffix(withApp))).toBe("a=bc_rd8s0npa,w=cdp_facil1"));

  it("reads a schema 0 code list", () => {
    const codes = ascii("bc_tyhmcm97,cdp_facil1");
    expect(builderCodes(body + codes + (codes.length / 2).toString(16).padStart(2, "0") + "00" + MARKER)).toBe("bc_tyhmcm97,cdp_facil1");
  });

  it("does not read the calldata before the suffix", () => {
    const noisy = "0x" + ascii("early text and a signature ") + "00".repeat(40);
    expect(builderCodes(noisy + suffix(cdp))).toBe("w=cdp_facil1");
  });

  it("keeps the raw hex of a CBOR it cannot read", () => {
    const array = "81" + "6a" + ascii("cdp_facil1");
    expect(builderCodes(body + suffix(array))).toBe("0x" + array);
  });

  it("skips values that are not text", () => {
    const mixed = "a3" + "61" + ascii("n") + "05" + "61" + ascii("b") + "42" + "0102" + "61" + ascii("w") + "6a" + ascii("cdp_facil1");
    expect(builderCodes(body + suffix(mixed))).toBe("w=cdp_facil1");
  });

  it("compares the marker without case", () => expect(builderCodes(body + suffix(cdp).toUpperCase().replace("0X", "0x"))).toBe("w=cdp_facil1"));

  it("cuts a long text", () => {
    const long = "a1" + "61" + ascii("w") + "78" + "c8" + ascii("x".repeat(200));
    expect(builderCodes(body + suffix(long))?.length).toBe(128);
  });

  it.each([
    ["no input", undefined],
    ["a plain call", body],
    ["a marker in the middle", body + MARKER + "00".repeat(8)],
    ["a marker with nothing before it", "0x" + MARKER],
    ["a schema this reader does not know", body + cdp + "000e" + "01" + MARKER],
    ["a length longer than the input", "0x" + "ffff" + "02" + MARKER],
    ["a length of zero", "0x" + "0000" + "02" + MARKER],
    ["a suffix of unprintable bytes", body + suffix("0102030405")],
    ["a short input", "0x8021"],
    ["an odd number of digits", body + "0" + suffix(cdp)],
    ["non-hex digits", body + "zz" + suffix(cdp)],
  ])("returns nothing for %s", (_n, input) => expect(builderCodes(input)).toBeUndefined());
});
