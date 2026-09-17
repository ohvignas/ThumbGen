// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import AskUserCard from "@/components/panels/chat/AskUserCard";
import PendingUiAction, { type PendingToolPart } from "@/components/panels/chat/PendingUiAction";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function render(input: unknown, onAnswer = vi.fn()) {
  await act(async () => root.render(<AskUserCard input={input} onAnswer={onAnswer} />));
  return onAnswer;
}

const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
const button = (text: string) => buttons().find((el) => el.textContent?.includes(text));
const click = async (el: HTMLElement | undefined) => {
  expect(el).toBeDefined();
  await act(async () => el!.click());
};

async function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const videos = ["v1", "v2", "v3", "v4", "v5"].map((id) => ({
  id,
  label: `Vidéo ${id}`,
  description: `Description ${id}`,
  image: `youtube:${id}`,
}));

describe("AskUserCard — image grid", () => {
  it("shows the question, the counter and a 16:9 grid; one click answers once", async () => {
    const onAnswer = await render({ question: "De quoi parle la vidéo ?", step: 1, options: videos });
    expect(container.textContent).toContain("De quoi parle la vidéo ?");
    expect(container.textContent).toContain("Étape 1/7");
    expect(container.querySelector(".grid-cols-2")).not.toBeNull();
    const images = Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(images).toEqual(videos.map((v) => `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`));
    expect(container.querySelector(".aspect-video")).not.toBeNull();

    await click(button("Vidéo v2"));
    await click(button("Vidéo v3"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ selected: ["v2"] });
  });

  it("uses square tiles in three columns for personas", async () => {
    await render({
      question: "Quel personnage ?",
      step: 3,
      options: [
        { id: "p1", label: "Antoine", image: "stored:persona_p1" },
        { id: "p2", label: "Florence", image: "stored:persona_p2" },
      ],
    });
    expect(container.querySelector(".grid-cols-3")).not.toBeNull();
    expect(container.querySelector(".aspect-square")).not.toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/personas/image?id=p1&angle=front");
  });

  it("swaps a broken image for a placeholder", async () => {
    await render({ question: "Quel logo ?", step: 5, options: [{ id: "l1", label: "Claude", image: "stored:lg_l1" }] });
    const img = container.querySelector("img")!;
    await act(async () => {
      img.dispatchEvent(new Event("error"));
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-slot='ask-user-placeholder']")).not.toBeNull();
  });

  it("limits a multiple choice and validates in option order", async () => {
    const onAnswer = await render({
      question: "Quelles références ?",
      step: 4,
      multiple: true,
      max_selected: 2,
      options: videos.slice(0, 4),
    });
    expect(container.textContent).toContain("Jusqu'à 2 choix");
    const validate = () => button("Valider")!;
    expect(validate().disabled).toBe(true);
    await click(button("Vidéo v3"));
    await click(button("Vidéo v1"));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(button("Vidéo v2")!.disabled).toBe(true);
    expect(button("Vidéo v1")!.getAttribute("aria-pressed")).toBe("true");
    await click(button("Vidéo v1"));
    expect(button("Vidéo v2")!.disabled).toBe(false);
    await click(button("Vidéo v1"));
    expect(validate().disabled).toBe(false);
    await click(validate());
    expect(onAnswer).toHaveBeenCalledWith({ selected: ["v1", "v3"] });
  });
});

describe("AskUserCard — focus", () => {
  const input = { question: "Quel angle ?", step: 2, options: [{ id: "a", label: "Choc" }] };

  it("takes the focus when it appears", async () => {
    await render(input);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Quel angle ?");
  });

  it("never takes it from a field the user is typing in", async () => {
    const field = document.createElement("textarea");
    field.value = "Je tape…";
    document.body.appendChild(field);
    field.focus();
    await render(input);
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});

describe("AskUserCard — focus from an empty composer", () => {
  it("takes the focus from an empty field (the composer after an answer)", async () => {
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.focus();
    await render({ question: "Quel angle ?", step: 2, options: [{ id: "a", label: "Choc" }] });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Quel angle ?");
    field.remove();
  });
});

describe("AskUserCard — a failed answer", () => {
  const input = { question: "Quel angle ?", step: 2, options: [{ id: "a", label: "Choc" }] };

  it("unlocks the card when the answer throws", async () => {
    const onAnswer = vi.fn(() => {
      throw new Error("not sent");
    });
    await render(input, onAnswer);
    await click(button("Choc"));
    expect(button("Choc")!.disabled).toBe(false);
    await click(button("Choc"));
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it("unlocks the card when the answer's promise rejects", async () => {
    const onAnswer = vi.fn(async () => {
      throw new Error("not sent");
    });
    await render(input, onAnswer);
    await click(button("Choc"));
    expect(button("Choc")!.disabled).toBe(false);
  });

  it("stays locked while an answer is being sent", async () => {
    const onAnswer = vi.fn(() => new Promise(() => {}));
    await render(input, onAnswer);
    await click(button("Choc"));
    await click(button("Choc"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(button("Choc")!.disabled).toBe(true);
  });
});

describe("AskUserCard — invalid questions", () => {
  it("renders an unreadable card for duplicate option ids or max_selected without multiple", async () => {
    await render({ question: "?", step: 1, options: [{ id: "a", label: "A" }, { id: "a", label: "B" }] });
    expect(container.textContent).toContain("Question illisible");
    await render({ question: "?", step: 1, max_selected: 2, options: [{ id: "a", label: "A" }] });
    expect(container.textContent).toContain("Question illisible");
  });
});

describe("AskUserCard — text options and footer", () => {
  const angles = {
    question: "Quel angle ?",
    step: 2,
    options: [
      { id: "a", label: "Choc", description: "Un visage choqué face au résultat." },
      { id: "b", label: "Démo", description: "Le produit en action." },
    ],
  };

  it("lists outline buttons with their description", async () => {
    const onAnswer = await render(angles);
    expect(container.querySelector(".grid-cols-2, .grid-cols-3")).toBeNull();
    expect(container.textContent).toContain("Un visage choqué face au résultat.");
    await click(button("Démo"));
    expect(onAnswer).toHaveBeenCalledWith({ selected: ["b"] });
  });

  it("sends « Autre » only when it is not blank", async () => {
    const onAnswer = await render(angles);
    const input = container.querySelector<HTMLInputElement>("input[placeholder='Autre…']")!;
    expect(input).not.toBeNull();
    expect(button("Envoyer")!.disabled).toBe(true);
    await typeInto(input, "   ");
    expect(button("Envoyer")!.disabled).toBe(true);
    await typeInto(input, "  Mon lien  ");
    expect(button("Envoyer")!.disabled).toBe(false);
    await click(button("Envoyer"));
    expect(onAnswer).toHaveBeenCalledWith({ other: "Mon lien" });
  });

  it("sends « Autre » with Enter", async () => {
    const onAnswer = await render(angles);
    const input = container.querySelector<HTMLInputElement>("input[placeholder='Autre…']")!;
    await typeInto(input, "Tuto");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onAnswer).toHaveBeenCalledWith({ other: "Tuto" });
  });

  // Live report: Enter did nothing in the « Autre » field while « Envoyer » worked. macOS inline predictive
  // text (Chrome/Safari) keeps the field in an IME composition, so the Enter keydown arrives with
  // isComposing: true — the card ignored it and the browser skipped the form submission. The composer
  // sends on any Enter; the card now does the same.
  it("sends « Autre » with Enter even while the field is composing (macOS inline predictions)", async () => {
    const onAnswer = await render(angles);
    const input = container.querySelector<HTMLInputElement>("input[placeholder='Autre…']")!;
    await typeInto(input, "Tuto");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
    });
    expect(onAnswer).toHaveBeenCalledWith({ other: "Tuto" });
  });

  it("sends the free answer with Enter", async () => {
    const onAnswer = await render({ question: "De quoi parle la vidéo ?", step: 1, options: [], allow_skip: false });
    const input = container.querySelector<HTMLInputElement>("input[placeholder='Ta réponse…']")!;
    await typeInto(input, "Les miniatures");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ other: "Les miniatures" });
  });

  it("sends once on Enter followed by a form submit", async () => {
    const onAnswer = await render(angles);
    const input = container.querySelector<HTMLInputElement>("input[placeholder='Autre…']")!;
    await typeInto(input, "Tuto");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    await act(async () => {
      input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("offers « Passer » only when allowed", async () => {
    const onAnswer = await render(angles);
    await click(button("Passer"));
    expect(onAnswer).toHaveBeenCalledWith({ skipped: true });

    await act(async () => root.render(<AskUserCard input={{ ...angles, allow_skip: false }} onAnswer={vi.fn()} />));
    expect(button("Passer")).toBeUndefined();
  });

  it("still lets the user skip an unreadable question", async () => {
    const onAnswer = await render({ question: "?" });
    expect(container.textContent).toContain("Question illisible");
    await click(button("Passer"));
    expect(onAnswer).toHaveBeenCalledWith({ skipped: true });
  });
});

describe("AskUserCard — thumbnail journey", () => {
  it("asks a free question with a text field only", async () => {
    const onAnswer = await render({ question: "De quoi parle la vidéo ?", step: 1, options: [], allow_skip: false });
    expect(container.textContent).toContain("Étape 1/7");
    expect(container.querySelector("input[placeholder='Autre…']")).toBeNull();
    const input = container.querySelector<HTMLInputElement>("input[placeholder='Ta réponse…']")!;
    expect(input).not.toBeNull();
    expect(input.getAttribute("aria-label")).toBe("Ta réponse");
    expect(buttons().map((el) => el.textContent)).toEqual(["Envoyer"]);
    await typeInto(input, "Une vidéo sur les miniatures");
    await click(button("Envoyer"));
    expect(onAnswer).toHaveBeenCalledWith({ other: "Une vidéo sur les miniatures" });
  });

  it("lays out more than 6 text options in two columns and allows 5 picks", async () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));
    await render({ question: "Lesquelles ?", step: 3, multiple: true, max_selected: 5, options });
    expect(container.querySelectorAll("[aria-pressed]")).toHaveLength(12);
    expect(container.querySelector(".grid-cols-2")).not.toBeNull();
    expect(container.textContent).toContain("Jusqu'à 5 choix");
  });

  it("shows generated sketches as 16:9 images", async () => {
    await render({
      question: "Variante A : valider l'esquisse ?",
      step: 7,
      options: [{ id: "ok", label: "Valider", image: "generated:sk_abc123" }],
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/generated-sketches/sk_abc123");
    expect(container.querySelector(".aspect-video")).not.toBeNull();
  });
});

describe("PendingUiAction — ask_user", () => {
  it("starts a fresh card for each question", async () => {
    const part = (toolCallId: string) =>
      ({
        type: "tool-ask_user",
        toolCallId,
        state: "input-available",
        input: { question: "Quel angle ?", step: 2, options: [{ id: "a", label: "Choc" }] },
      }) as unknown as PendingToolPart;
    await act(async () => root.render(<PendingUiAction part={part("q1")} onResolve={() => {}} />));
    await click(button("Choc"));
    expect(button("Choc")!.disabled).toBe(true);
    await act(async () => root.render(<PendingUiAction part={part("q2")} onResolve={() => {}} />));
    expect(button("Choc")!.disabled).toBe(false);
  });

  it("renders the card and resolves the tool call with the answer", async () => {
    const onResolve = vi.fn();
    const part = {
      type: "tool-ask_user",
      toolCallId: "q1",
      state: "input-available",
      input: { question: "Quel angle ?", step: 2, options: [{ id: "a", label: "Choc" }] },
    } as unknown as PendingToolPart;
    await act(async () => root.render(<PendingUiAction part={part} onResolve={onResolve} />));
    expect(container.textContent).toContain("Étape 2/7");
    await click(button("Choc"));
    expect(onResolve).toHaveBeenCalledWith("q1", { selected: ["a"] });
  });
});
