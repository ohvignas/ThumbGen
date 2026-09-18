import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SkillPicker from "@/components/panels/chat/SkillPicker";
import { SLASH_SKILLS } from "@/lib/agent/skills/slash-catalog";

describe("SkillPicker", () => {
  it("renders croquis as a selectable option and an empty state", () => {
    const html = renderToStaticMarkup(
      <SkillPicker items={SLASH_SKILLS} activeIndex={0} onHover={() => {}} onPick={() => {}} />,
    );
    expect(html).toContain("role=\"listbox\"");
    expect(html).toContain("/croquis");
    expect(html).toContain("Croquis");
    expect(html).toContain("Brainstorm puis dessine un croquis");
    expect(html).toContain("/create-prompt");
    expect(html).toContain("Create prompt");
    expect(html).not.toContain("/create-propt");
    expect(html).not.toContain("finish_turn");
    expect(html).not.toContain("Étape n/7");

    const empty = renderToStaticMarkup(
      <SkillPicker items={[]} activeIndex={0} onHover={() => {}} onPick={() => {}} />,
    );
    expect(empty).toContain("Aucune skill");
  });
});
