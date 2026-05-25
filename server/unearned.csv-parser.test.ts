import { describe, expect, it } from "vitest";
import { parseCSVText } from "./routers";

describe("parseCSVText", () => {
  it("parses quoted values containing commas", () => {
    const csv = `Customer Ref,Item,Owing\nCUST-1,"Motor, Comprehensive",123.45`;
    const rows = parseCSVText(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      "Customer Ref": "CUST-1",
      Item: "Motor, Comprehensive",
      Owing: "123.45",
    });
  });

  it("parses escaped quotes in quoted values", () => {
    const csv = `Customer Ref,Item\nCUST-2,"Plan ""Alpha"""`;
    const rows = parseCSVText(csv);

    expect(rows[0]?.Item).toBe('Plan "Alpha"');
  });
});
