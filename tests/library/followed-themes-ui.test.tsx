// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TypesSummary from "@/components/library/followed-channels/TypesSummary";
import VideoCard from "@/components/library/followed-channels/VideoCard";
import VideoGrid from "@/components/library/followed-channels/VideoGrid";
import VideoInfoDialog from "@/components/library/followed-channels/VideoInfoDialog";
import type { ChannelListItem, VideoListItem, WorkingSubjectHit } from "@/lib/youtube/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const typesSummary = vi.fn();
const videos = vi.fn();
const workingSubject = vi.fn();
const why = vi.fn();

vi.mock("@/components/library/followed-channels/api", () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
  channelsApi: {
    typesSummary: (...args: unknown[]) => typesSummary(...args),
    videos: (...args: unknown[]) => videos(...args),
    workingSubject: (...args: unknown[]) => workingSubject(...args),
    why: (...args: unknown[]) => why(...args),
  },
}));

const whyOk = {
  videoId: "c1",
  facts: {
    overperformance: 4,
    performance: { kind: "scored", score: 4, band: "over" },
    viewsPerHour: 12,
    velocityKind: "average",
    formatId: "tutorial",
    disclaimer: "no_studio",
  },
  captions: {
    status: "ok",
    kind: "official",
    language: "fr",
    quotes: ["Voici le chiffre"],
    hookText: "Voici le chiffre",
  },
  jev: {
    used: true,
    note: 8,
    holdNoul: 0.7,
    holdBand: "holds",
    categoryId: "curiosity_gap",
    confidence: 0.8,
  },
};

const channel = (id: string, title: string): ChannelListItem => ({
  id,
  youtubeChannelId: `UC${id.padEnd(22, "x")}`,
  title,
  handle: null,
  avatarUrl: null,
  subscriberCount: null,
  isMine: id === "mine",
  medianViews: 1000,
  lastSyncedAt: null,
  syncStatus: "idle",
  syncError: null,
  videoCount: 3,
  createdAt: "2026-09-01T00:00:00.000Z",
});

const video = (videoId: string, title: string): VideoListItem => ({
  videoId,
  channelId: "mine",
  channelTitle: "Ma chaîne",
  title,
  publishedAt: "2026-09-01T00:00:00.000Z",
  durationSeconds: 600,
  viewCount: 4000,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  thumbType: "face_text",
  thumbTypeSource: "ai",
  performance: { kind: "scored", score: 4, band: "over" },
  description: "On parle de Cursor 2.0.",
});

const subject: WorkingSubjectHit = {
  subjectId: "tendance",
  label: "En hausse",
  channelCount: 3,
  medianScore: 4.2,
  why: "3 chaînes · ×4,2 vs médiane · moy. depuis publication · 180 vues/h · 7 j",
  videoIds: ["c1", "c2", "c3", "c4"],
};

const four = [video("c1", "Cursor 2.0 smash"), video("c2", "Cursor 2.0 tips"), video("c3", "Tuto Cursor 2.0"), video("c4", "Cursor 2.0 vs Claude")];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  typesSummary.mockReset();
  videos.mockReset();
  workingSubject.mockReset();
  why.mockReset();
  typesSummary.mockResolvedValue({ rows: [], jevUsed: false });
  videos.mockResolvedValue({ items: four, total: 4, offset: 0, limit: 12 });
  workingSubject.mockResolvedValue({ period: "7d", subject, videos: four, jevUsed: false });
  why.mockResolvedValue(whyOk);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("working subject UI", () => {
  it("shows the why line and exactly 4 rising videos — never Autres sujets or types-summary", async () => {
    const onSubject = vi.fn();
    await act(async () => {
      root.render(<TypesSummary version="1" onOpen={vi.fn()} onSubject={onSubject} />);
    });
    await act(async () => {
      await workingSubject.mock.results[0]?.value;
    });
    expect(workingSubject).toHaveBeenCalledWith();
    expect(typesSummary).not.toHaveBeenCalled();
    expect(container.textContent).toContain("🏆 Tendance Youtube");
    expect(container.textContent).not.toContain("Sujet qui marche en ce moment");
    expect(container.textContent).not.toContain("idée partagée");
    expect(container.textContent).toContain("3 chaînes · ×4,2 vs médiane · moy. depuis publication · 180 vues/h · 7 j");
    expect(container.textContent).not.toContain("Autres sujets");
    expect(container.textContent).not.toContain("AffiliationCoupon");
    expect([...container.querySelectorAll("[data-working-video]")].map((node) => node.getAttribute("data-working-video"))).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
    expect(onSubject).toHaveBeenCalledWith(subject);
  });

  it("shows format, Jev note, and the CODE performance band on each tile", async () => {
    workingSubject.mockResolvedValue({
      period: "7d",
      subject,
      videos: [
        {
          ...four[0],
          title: "Tuto Cursor smash",
          overperformance: 4.2,
          formatId: "tutorial",
          jevNote: 8.2,
          velocityKind: "average",
        },
        { ...four[1], overperformance: 1.1, formatId: "commentary", velocityKind: "average" },
        { ...four[2], overperformance: 0, formatId: "vlog", velocityKind: "average" },
      ],
      jevUsed: true,
    });
    await act(async () => {
      root.render(<TypesSummary version="1" onOpen={vi.fn()} onSubject={vi.fn()} />);
    });
    await act(async () => {
      await workingSubject.mock.results[0]?.value;
    });
    expect(container.textContent).toContain("Tutoriel");
    expect(container.textContent).toContain("8,2/10");
    expect(container.textContent).toContain("Surperforme");
    expect(container.textContent).toContain("Dans la moyenne");
    expect(container.textContent).not.toContain("Sous-performe");
    expect(container.textContent).not.toContain("×0,0");
    expect(container.querySelector("[data-working-video='c1']")?.getAttribute("title")).toBe(
      "Moyenne depuis la publication (un seul relevé)",
    );
  });

  it("does not claim a climb when the 7-day pool is empty", async () => {
    workingSubject.mockResolvedValue({ period: "7d", subject: null, videos: [], jevUsed: false });
    await act(async () => {
      root.render(<TypesSummary version="1" onOpen={vi.fn()} onSubject={vi.fn()} />);
    });
    await act(async () => {
      await workingSubject.mock.results[0]?.value;
    });
    expect(container.textContent).toContain("Aucune vidéo qui performe ces 7 derniers jours sur tes chaînes suivies.");
    expect(container.textContent).not.toContain("grimpe assez fort");
  });

  it("shows only the videos that passed both filters — never pads to 4", async () => {
    workingSubject.mockResolvedValue({
      period: "7d",
      subject: {
        ...subject,
        channelCount: 2,
        medianScore: 2.4,
        why: "2 chaînes · ×2,4 vs médiane · moy. depuis publication · 90 vues/h · 7 j",
        videoIds: ["c1", "c2"],
      },
      videos: four.slice(0, 2),
      jevUsed: false,
    });
    await act(async () => {
      root.render(<TypesSummary version="1" onOpen={vi.fn()} onSubject={vi.fn()} />);
    });
    await act(async () => {
      await workingSubject.mock.results[0]?.value;
    });
    expect(container.textContent).toContain("🏆 Tendance Youtube");
    expect(container.textContent).toContain("2 chaînes · ×2,4 vs médiane · moy. depuis publication · 90 vues/h · 7 j");
    expect(container.textContent).not.toContain("idée partagée");
    expect([...container.querySelectorAll("[data-working-video]")].map((node) => node.getAttribute("data-working-video"))).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("keeps the 7j/1m/6m switch on the grid, not on the trend hero", async () => {
    const onPeriod = vi.fn();
    await act(async () => {
      root.render(<TypesSummary version="1" onOpen={vi.fn()} onSubject={vi.fn()} />);
    });
    await act(async () => {
      await workingSubject.mock.results[0]?.value;
    });
    expect(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "7 jours")).toBeUndefined();
    expect(container.querySelector("[data-theme-card]")).toBeNull();
    expect(container.textContent).not.toContain("creerQuFaut");
    expect(container.textContent).not.toContain("AffiliationCoupon");
    expect(container.textContent).not.toContain("Autres sujets");

    await act(async () => {
      root.render(
        <VideoGrid
          channels={[channel("mine", "Ma chaîne")]}
          version="1"
          period="30d"
          onPeriod={onPeriod}
          onOpen={vi.fn()}
          onUse={vi.fn()}
        />,
      );
    });
    await act(async () => {
      await videos.mock.results.at(-1)?.value;
    });
    const seven = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "7 jours");
    expect(seven).toBeDefined();
    await act(async () => seven!.click());
    expect(onPeriod).toHaveBeenCalledWith("7d");
  });

  it("filters the grid by type de vidéo and keyword, without Type de miniature", async () => {
    await act(async () => {
      root.render(
        <VideoGrid
          channels={[channel("mine", "Ma chaîne")]}
          version="1"
          period="30d"
          onPeriod={vi.fn()}
          onOpen={vi.fn()}
          onUse={vi.fn()}
        />,
      );
    });
    await act(async () => {
      await videos.mock.results.at(-1)?.value;
    });
    expect(container.querySelector('[aria-label="Type de vidéo"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Rechercher un sujet parmi les chaînes suivies"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Type de miniature");
    expect(container.textContent).not.toContain("Visage+texte");
    expect(container.textContent).not.toContain("Autres sujets");
    expect(videos).toHaveBeenCalledWith(expect.objectContaining({ period: "30d", format: "", q: "" }));
  });

  it("opens the stats popup from a thumbnail and keeps use-as-reference", async () => {
    const onOpen = vi.fn();
    const onUse = vi.fn();
    await act(async () => {
      root.render(<VideoCard video={video("c1", "Tuto Cursor 2.0 smash")} onOpen={onOpen} onUse={onUse} />);
    });
    expect(container.textContent).not.toContain("Type de miniature");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Détails de « Tuto Cursor 2.0 smash »"]')!.click();
    });
    expect(onOpen).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <VideoInfoDialog
          video={video("c1", "Tuto Cursor 2.0 smash")}
          period="30d"
          subjectLabel="Cursor 2.0"
          onClose={vi.fn()}
          onUse={onUse}
        />,
      );
    });
    expect(document.body.textContent).toContain("Tuto Cursor 2.0 smash");
    expect(document.body.textContent).toContain("Ma chaîne");
    expect(document.body.textContent).toContain("Cursor 2.0");
    expect(document.body.textContent).toContain("Tutoriel");
    expect(document.body.textContent).toContain("Cote");
    expect(document.body.textContent).toContain("Surperforme");
    expect(document.body.textContent).toContain("On parle de Cursor 2.0.");
    expect(document.body.textContent).toContain("Voir sur YouTube");
    expect(document.body.textContent).toContain("Utiliser comme référence");
    const useButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Utiliser comme référence"),
    );
    await act(async () => useButton!.click());
    expect(onUse).toHaveBeenCalledTimes(1);

    await act(async () => {
      await why.mock.results[0]?.value;
    });
    expect(document.body.textContent).toContain("Pourquoi ça performe");
    expect(document.body.textContent).toMatch(/pas de CTR/i);
    expect(document.body.textContent).toContain("Voici le chiffre");
    expect(document.body.textContent).toContain("Écart de curiosité");
    expect(document.body.textContent).toContain("8,0/10");
    expect(document.body.textContent).not.toMatch(/\bCTR\b.*%/);
  });

  it("explains from title and ×N when public captions are missing", async () => {
    why.mockResolvedValue({
      ...whyOk,
      captions: { status: "missing", kind: null, language: null, quotes: [], hookText: "" },
      jev: { used: false, note: null, holdNoul: null, holdBand: null, categoryId: null, confidence: null },
    });
    await act(async () => {
      root.render(
        <VideoInfoDialog
          video={video("c1", "Tuto Cursor 2.0 smash")}
          period="30d"
          subjectLabel="Cursor 2.0"
          onClose={vi.fn()}
          onUse={vi.fn()}
        />,
      );
    });
    await act(async () => {
      await why.mock.results.at(-1)?.value;
    });
    expect(document.body.textContent).toContain("Pourquoi ça performe");
    expect(document.body.textContent).toContain("Pas de sous-titres publics — on ne peut pas juger l'accroche parlée");
    expect(document.body.textContent).toContain("Sous-titres indisponibles");
    expect(document.body.textContent).not.toMatch(/\/10/);
  });
});
