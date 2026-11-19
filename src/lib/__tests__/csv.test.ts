import { describe, expect, it } from "vitest";
import { toCSV } from "@/lib/csv";

describe("toCSV", () => {
  it("writes a header row and one row per record, in column order", () => {
    const csv = toCSV(
      [
        { id: 1, name: "Baner flat", price: 25000 },
        { id: 2, name: "Wakad PG", price: 9000 },
      ],
      ["id", "name", "price"],
    );
    expect(csv).toBe("id,name,price\n1,Baner flat,25000\n2,Wakad PG,9000");
  });

  it("only includes the requested columns", () => {
    expect(toCSV([{ a: 1, b: 2, c: 3 }], ["c", "a"])).toBe("c,a\n3,1");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    const csv = toCSV([{ v: 'He said "hi"' }, { v: "a,b" }, { v: "line1\nline2" }], ["v"]);
    expect(csv).toBe('v\n"He said ""hi"""\n"a,b"\n"line1\nline2"');
  });

  it("renders null/undefined as empty and objects as JSON", () => {
    const csv = toCSV([{ a: null, b: undefined, c: { x: 1 } }], ["a", "b", "c"]);
    expect(csv).toBe('a,b,c\n,,"{""x"":1}"');
  });

  it("returns just the header for no rows", () => {
    expect(toCSV([] as Array<{ id: number }>, ["id"])).toBe("id\n");
  });
});
