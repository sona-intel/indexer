import { describe, expect, it } from "vitest";
import { gasCost, rowId, selectorOf } from "./ids";

describe("ids", () => {
  it("builds the row id", () => expect(rowId(143, 52996376, 15)).toBe("143_52996376_15"));

  it.each([
    ["0xe3ee160e" + "00".repeat(32), "0xe3ee160e"],
    ["0x", undefined],
    ["0xe3ee16", undefined],
    [undefined, undefined],
  ])("reads the selector of %s", (input, want) => expect(selectorOf(input)).toBe(want));

  it("multiplies gas and price", () => {
    expect(gasCost(172839n, 102000100000n)).toBe(17629595283900000n);
    expect(gasCost(551446n, 102400000000n)).toBe(56468070400000000n);
    expect(gasCost(undefined, 1n)).toBeUndefined();
    expect(gasCost(1n, undefined)).toBeUndefined();
  });
});
