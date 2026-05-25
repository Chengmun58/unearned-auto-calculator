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

  it("parses quoted multiline fields without breaking row alignment", () => {
    const csv =
      'Customer Ref,Item,Owing\nCUST-3,"Motor Plan\nTier 1",500.00\nCUST-4,Standard,250.00';
    const rows = parseCSVText(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      "Customer Ref": "CUST-3",
      Item: "Motor Plan\nTier 1",
      Owing: "500.00",
    });
    expect(rows[1]?.["Customer Ref"]).toBe("CUST-4");
  });

  it("supports CRLF line endings", () => {
    const csv = "Customer Ref,Item,Owing\r\nCUST-5,Standard,100.00\r\n";
    const rows = parseCSVText(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.Owing).toBe("100.00");
  });

  it("preserves leading/trailing spaces inside quoted fields", () => {
    const csv = 'Customer Ref,Item\nCUST-6,"  Keep padded value  "';
    const rows = parseCSVText(csv);

    expect(rows[0]?.Item).toBe("  Keep padded value  ");
  });

  it("parses UTF-8 BOM in header and retains trailing empty columns", () => {
    const csv = "\uFEFFCustomer Ref,Item,Owing\nCUST-7,Standard,";
    const rows = parseCSVText(csv);

    expect(rows[0]?.["Customer Ref"]).toBe("CUST-7");
    expect(rows[0]?.Owing).toBe("");
  });

  it("treats quotes inside unquoted fields as literal characters", () => {
    const csv = 'Customer Ref,Item\nCUST-8,Plan "Alpha" Tier';
    const rows = parseCSVText(csv);

    expect(rows[0]?.Item).toBe('Plan "Alpha" Tier');
  });
});
