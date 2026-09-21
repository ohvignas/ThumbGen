import { describe, it, expect } from "vitest";
import { emptyStudioDraft, isNewTemplateMarkdown, parseStudioPageMarkdown, renderStudioPageMarkdown } from "@/lib/studio/page-template";

const NEW_TEMPLATE = `SCRIPT
<details>
<summary>Script Vidéo longue</summary>
\`\`\`javascript
## 1. Introduction

Hook maison.
\`\`\`
</details>
<details>
<summary>Description</summary>
\`\`\`javascript
Pitch.

👉 Ce que vous allez apprendre :
✅ Point A

⌚️ Les temps forts de la vidéo :
00:00 Introduction
\`\`\`
</details>
---
## A/B Titre
| Titre | Texte miniature | Concept visuel |
| --- | --- | --- |
| Titre A | TEXTE A | Concept A |
| Titre B | TEXTE B | Concept B |
| Titre C | TEXTE C | Concept C |
---
## Miniature
`;

describe("page-template", () => {
  it("parses the house script, description and A/B table", () => {
    const draft = parseStudioPageMarkdown(NEW_TEMPLATE);
    expect(isNewTemplateMarkdown(NEW_TEMPLATE)).toBe(true);
    expect(draft.script).toContain("## 1. Introduction");
    expect(draft.description).toContain("Ce que vous allez apprendre");
    expect(draft.titleVariants[0]).toEqual({ title: "Titre A", thumbText: "TEXTE A", visualConcept: "Concept A" });
    expect(draft.titleVariants[2].title).toBe("Titre C");
  });

  it("treats a legacy n8n-style page as raw script and does not claim the new template", () => {
    const legacy = "## 🎬 Introduction (15-30 sec)\nInstaller n8n.\n## 📢 Outro\nAbonne-toi.";
    const draft = parseStudioPageMarkdown(legacy);
    expect(isNewTemplateMarkdown(legacy)).toBe(false);
    expect(draft.script).toContain("Installer n8n");
    expect(draft.description).toBe("");
    expect(draft.titleVariants).toEqual(emptyStudioDraft().titleVariants);
  });

  it("round-trips a draft through render then parse", () => {
    const draft = emptyStudioDraft();
    draft.script = "## 1. Introduction\nBonjour.";
    draft.description = "Pitch\n👉 Ce que vous allez apprendre :\n✅ Un point";
    draft.titleVariants[1] = { title: "Vibe Coding : c’est quoi ?", thumbText: "LE GUIDE DÉBUTANT", visualConcept: "" };
    const again = parseStudioPageMarkdown(renderStudioPageMarkdown(draft));
    expect(again.script).toContain("Bonjour.");
    expect(again.description).toContain("Un point");
    expect(again.titleVariants[1].title).toBe("Vibe Coding : c’est quoi ?");
    expect(again.titleVariants[1].thumbText).toBe("LE GUIDE DÉBUTANT");
  });
});
