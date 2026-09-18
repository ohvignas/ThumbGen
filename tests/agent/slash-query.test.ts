import { describe, it, expect } from "vitest";
import {
  applySlashPick,
  composerSlashQuery,
  filterSlashSkills,
  parseInvokedSkillFromText,
  slashQueryAtCursor,
  slashRemainderAfterInvoke,
} from "@/lib/agent/skills/slash-query";

describe("slashQueryAtCursor", () => {
  it("opens at start of input and after whitespace", () => {
    expect(slashQueryAtCursor("/", 1)).toEqual({ start: 0, query: "" });
    expect(slashQueryAtCursor("/cro", 4)).toEqual({ start: 0, query: "cro" });
    expect(slashQueryAtCursor("hello /cro", 10)).toEqual({ start: 6, query: "cro" });
    expect(slashQueryAtCursor("a\n/", 3)).toEqual({ start: 2, query: "" });
  });

  it("does not steal / inside a URL, path, or mid-word", () => {
    const url = "https://youtube.com/watch?v=abc";
    expect(slashQueryAtCursor(url, url.length)).toBeNull();
    expect(slashQueryAtCursor("https://", 8)).toBeNull();
    expect(slashQueryAtCursor("n/7", 3)).toBeNull();
    expect(slashQueryAtCursor("foo/bar", 7)).toBeNull();
    expect(slashQueryAtCursor("regarde/", 8)).toBeNull();
  });

  it("only looks at the token ending at the cursor", () => {
    expect(slashQueryAtCursor("/croquis moi", 12)).toBeNull();
    expect(slashQueryAtCursor("/croquis moi", 8)).toEqual({ start: 0, query: "croquis" });
  });
});

describe("composerSlashQuery", () => {
  it("opens on a lone / even when the stored cursor is still 0", () => {
    expect(slashQueryAtCursor("/", 0)).toBeNull();
    expect(composerSlashQuery("/", 0)).toEqual({ start: 0, query: "" });
    expect(composerSlashQuery("/cro", 0)).toEqual({ start: 0, query: "cro" });
    expect(composerSlashQuery("go /", 0)).toEqual({ start: 3, query: "" });
    expect(composerSlashQuery("go /", 4)).toEqual({ start: 3, query: "" });
    expect(composerSlashQuery("go /", 1)).toBeNull();
  });

  it("still ignores URLs and a slash that is no longer at the end", () => {
    expect(composerSlashQuery("https://youtube.com/watch", 0)).toBeNull();
    expect(composerSlashQuery("/croquis moi", 0)).toBeNull();
  });
});

describe("filterSlashSkills", () => {
  it("lists every picker skill on an empty query and filters croquis", () => {
    expect(filterSlashSkills("").map((row) => row.slash)).toContain("croquis");
    expect(filterSlashSkills("").map((row) => row.slash)).toContain("create-prompt");
    expect(filterSlashSkills("  ").length).toBe(filterSlashSkills("").length);
    expect(filterSlashSkills("CRO").map((row) => row.slash)).toEqual(["croquis"]);
    expect(filterSlashSkills("generate_sketch").map((row) => row.slash)).toEqual(["croquis"]);
    expect(filterSlashSkills("create-propt").map((row) => row.slash)).toEqual(["create-prompt"]);
    expect(filterSlashSkills("zzzz-nope")).toEqual([]);
  });
});

describe("applySlashPick", () => {
  it("replaces the open /query with /alias and a trailing space", () => {
    expect(applySlashPick("/cro", 4, "croquis")).toEqual({ text: "/croquis ", cursor: 9 });
    expect(applySlashPick("go /c", 5, "croquis")).toEqual({ text: "go /croquis ", cursor: 12 });
    expect(applySlashPick("/create-pro", 12, "create-prompt")).toEqual({ text: "/create-prompt ", cursor: 15 });
  });

  it("replaces a lone / even when the stored cursor is still 0", () => {
    expect(applySlashPick("/", 0, "croquis")).toEqual({ text: "/croquis ", cursor: 9 });
  });
});

describe("parseInvokedSkillFromText", () => {
  it("invokes the first known slash token, including hidden skill-name alias", () => {
    expect(parseInvokedSkillFromText("/croquis")?.skill).toBe("generate_sketch");
    expect(parseInvokedSkillFromText("/croquis moi à droite")?.slash).toBe("croquis");
    expect(parseInvokedSkillFromText("  /croquis")?.skill).toBe("generate_sketch");
    expect(parseInvokedSkillFromText("idée /croquis svp")?.skill).toBe("generate_sketch");
    expect(parseInvokedSkillFromText("/generate_sketch pencil")?.slash).toBe("croquis");
    expect(parseInvokedSkillFromText("/create-prompt moi à droite")?.skill).toBe("create-prompt");
    expect(parseInvokedSkillFromText("/create-propt")?.slash).toBe("create-prompt");
  });

  it("ignores unknown slashes, URLs, and tool names that are not picker skills", () => {
    expect(parseInvokedSkillFromText("/unknown")).toBeNull();
    expect(parseInvokedSkillFromText("https://youtube.com/watch?v=abc")).toBeNull();
    expect(parseInvokedSkillFromText("/finish_turn")).toBeNull();
    expect(parseInvokedSkillFromText("pas un slash")).toBeNull();
  });
});

describe("slashRemainderAfterInvoke", () => {
  it("is empty for a bare /croquis (with or without trailing space)", () => {
    expect(slashRemainderAfterInvoke("/croquis")).toBe("");
    expect(slashRemainderAfterInvoke("/croquis ")).toBe("");
    expect(slashRemainderAfterInvoke("  /croquis  ")).toBe("");
    expect(slashRemainderAfterInvoke("/generate_sketch")).toBe("");
    expect(slashRemainderAfterInvoke("/create-prompt")).toBe("");
    expect(slashRemainderAfterInvoke("/create-propt")).toBe("");
  });

  it("keeps the extra user text after the first known slash", () => {
    expect(slashRemainderAfterInvoke("/croquis moi à droite")).toBe("moi à droite");
    expect(slashRemainderAfterInvoke("idée /croquis svp")).toBe("idée svp");
    expect(slashRemainderAfterInvoke("/create-prompt moi à droite")).toBe("moi à droite");
  });
});
