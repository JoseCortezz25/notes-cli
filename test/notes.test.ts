import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.ts";
import { addNote, deleteNote, filterByTag, formatList, NotesError, type Note } from "../src/notes.ts";

const DAY = "2026-11-06";
const tmpFile = () => join(mkdtempSync(join(tmpdir(), "notes-")), "notes.json");

describe("notes", () => {
  it("adds a note with the next id", () => {
    const notes = addNote(addNote([], "first", DAY), "second", DAY);
    expect(notes.map((n) => n.id)).toEqual([1, 2]);
  });

  it("trims text and refuses empty notes", () => {
    expect(addNote([], "  hi  ", DAY)[0].text).toBe("hi");
    expect(() => addNote([], "   ", DAY)).toThrow(NotesError);
  });

  it("deletes by id and refuses unknown ids", () => {
    const notes: Note[] = addNote([], "a", DAY);
    expect(deleteNote(notes, 1)).toEqual([]);
    expect(() => deleteNote(notes, 9)).toThrow("no note with id 9");
  });

  it("formats a list", () => {
    expect(formatList([])).toBe("No notes yet.");
    expect(formatList(addNote([], "milk", DAY))).toBe("1. milk (2026-11-06)");
  });
});

describe("tags", () => {
  it("stores tags trimmed, lowercased and deduplicated", () => {
    expect(addNote([], "x", DAY, [" Work ", "work", "Urgent"])[0].tags).toEqual(["work", "urgent"]);
  });

  it("leaves out the tags key without tags", () => {
    expect("tags" in addNote([], "x", DAY)[0]).toBe(false);
  });

  it("rejects invalid tags", () => {
    for (const bad of ["", "  ", "a b", "a\tb", "a,b"]) {
      expect(() => addNote([], "x", DAY, [bad])).toThrow(NotesError);
    }
  });

  it("filters by tag case-insensitively", () => {
    const notes = addNote(addNote([], "a", DAY, ["work"]), "b", DAY);
    expect(filterByTag(notes, "WORK").map((n) => n.text)).toEqual(["a"]);
  });

  it("treats malformed tags as untagged", () => {
    const base = { id: 1, text: "t", created: DAY };
    const notes = [{ ...base }, { ...base, tags: "work" }, { ...base, tags: null }, { ...base, tags: {} }] as unknown as Note[];
    expect(filterByTag(notes, "work")).toEqual([]);
    expect(formatList(notes)).toBe(notes.map(() => "1. t (2026-11-06)").join("\n"));
  });

  it("renders tags and the empty messages", () => {
    const notes = addNote(addNote([], "a", DAY, ["x", "y"]), "b", DAY);
    expect(formatList(notes)).toBe("1. a (2026-11-06) [x, y]\n2. b (2026-11-06)");
    expect(formatList(notes, "zzz")).toBe("No notes with tag zzz.");
    expect(formatList([], "zzz")).toBe("No notes yet.");
  });
});

describe("cli tags", () => {
  const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));

  it("adds with repeatable tags anywhere", () => {
    const file = tmpFile();
    run(["add", "--tag", "work", "ship", "--tag", "urgent", "it"], file, DAY);
    expect(read(file)[0]).toEqual({ id: 1, text: "ship it", created: DAY, tags: ["work", "urgent"] });
  });

  it("lists by tag", () => {
    const file = tmpFile();
    expect(run(["list", "--tag", "x"], file, DAY).out).toBe("No notes yet.");
    run(["add", "--tag", "work", "a"], file, DAY);
    run(["add", "b"], file, DAY);
    expect(run(["list", "--tag", "work"], file, DAY).out).toBe("1. a (2026-11-06) [work]");
    expect(run(["list", "--tag", "x"], file, DAY).out).toBe("No notes with tag x.");
    expect(run(["list"], file, DAY).out).toBe("1. a (2026-11-06) [work]\n2. b (2026-11-06)");
  });

  it("rejects missing or invalid tags", () => {
    const file = tmpFile();
    for (const argv of [["add", "--tag"], ["list", "--tag"], ["add", "--tag", "a b", "t"], ["add", "--tag", "a,b", "t"], ["list", "--tag", "a b"]]) {
      const r = run(argv, file, DAY);
      expect(r.code).toBe(1);
      expect(r.out.startsWith("error:")).toBe(true);
    }
    expect(run(["list"], file, DAY).out).toBe("No notes yet.");
  });

  it("stays compatible with old notes files", () => {
    const file = tmpFile();
    const old = [{ id: 1, text: "old", created: "2026-01-01" }, { id: 2, text: "older", created: "2025-01-01" }];
    writeFileSync(file, JSON.stringify(old));
    const before = readFileSync(file, "utf8");
    expect(run(["list"], file, DAY).out).toBe("1. old (2026-01-01)\n2. older (2025-01-01)");
    expect(run(["list", "--tag", "x"], file, DAY).out).toBe("No notes with tag x.");
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(run(["add", "--tag", "x", "new"], file, DAY).code).toBe(0);
    expect(read(file).slice(0, 2)).toEqual(old);
    expect(read(file)[2].tags).toEqual(["x"]);
    expect(run(["list", "--tag", "x"], file, DAY).out).toBe("3. new (2026-11-06) [x]");
  });
});

describe("cli", () => {
  it("adds and lists notes in the file", () => {
    const file = tmpFile();
    expect(run(["add", "buy", "milk"], file, DAY)).toEqual({ code: 0, out: "Added note 1." });
    expect(run(["list"], file, DAY).out).toBe("1. buy milk (2026-11-06)");
  });

  it("deletes a note", () => {
    const file = tmpFile();
    run(["add", "x"], file, DAY);
    expect(run(["delete", "1"], file, DAY).code).toBe(0);
    expect(run(["list"], file, DAY).out).toBe("No notes yet.");
  });

  it("reports errors with exit code 1", () => {
    const file = tmpFile();
    writeFileSync(file, "{ not json");
    expect(run(["list"], file, DAY).code).toBe(1);
    expect(run(["delete", "3"], tmpFile(), DAY)).toEqual({ code: 1, out: "error: no note with id 3" });
  });

  it("prints usage for unknown commands", () => {
    expect(run(["fly"], tmpFile(), DAY).code).toBe(2);
  });
});
