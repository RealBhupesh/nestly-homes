import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";

const base = {
  uid: "tour-123",
  title: "Visit: 2BHK in Baner",
  start: new Date(Date.UTC(2026, 10, 21, 4, 30, 0)),
  end: new Date(Date.UTC(2026, 10, 21, 5, 0, 0)),
};

describe("buildIcs", () => {
  it("produces a CRLF-delimited VCALENDAR with one VEVENT", () => {
    const ics = buildIcs(base);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines).toContain("VERSION:2.0");
  });

  it("formats start/end as UTC basic format", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("DTSTART:20261121T043000Z");
    expect(ics).toContain("DTEND:20261121T050000Z");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it("namespaces the UID", () => {
    expect(buildIcs(base)).toContain("UID:tour-123@nestly");
  });

  it("escapes commas, semicolons, backslashes and newlines in text", () => {
    const ics = buildIcs({
      ...base,
      title: "Flat, Baner; 2\\3",
      description: "Line one\nLine two",
      location: "Plot 4, Baner Road",
    });
    expect(ics).toContain("SUMMARY:Flat\\, Baner\\; 2\\\\3");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics).toContain("LOCATION:Plot 4\\, Baner Road");
  });

  it("omits optional fields when not provided", () => {
    const ics = buildIcs(base);
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toMatch(/^DESCRIPTION:(?!Property visit)/m);
    // no blank lines left behind by filtered fields
    expect(ics.split("\r\n").every((l) => l.length > 0)).toBe(true);
  });

  it("includes a one-hour reminder", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT60M");
  });
});
