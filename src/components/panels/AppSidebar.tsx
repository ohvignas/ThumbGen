"use client";

import { useState, useEffect, useRef, DragEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCanvasStore } from "@/store/canvas-store";
import { useReactFlow } from "@xyflow/react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SettingsPanel from "./SettingsPanel";
import WebcamCaptureModal from "./WebcamCaptureModal";
import { PROVIDER_COLORS } from "@/lib/model-costs";
import { Users, Image as ImageIcon, LayoutGrid, Shapes, BarChart3, Settings as SettingsIcon, Search, Plus, X, Camera, Upload, Film } from "lucide-react";

/* eslint-disable @next/next/no-img-element */

type SidebarTab = "models" | "faces" | "logos" | "swipe" | null;

type LogoEntry = { filename: string; label: string; size: number };
type SwipeEntry = { title: string; filename: string; size: number };
type YouTubeItem = { videoId: string; title: string; thumbnailUrl: string; addedAt: string };
type FaceReaction = { filename: string; label: string; size: number };
type Persona = { id: string; label: string; angles: ("front" | "left" | "right")[] };

type VisageEntry =
  | { kind: "persona"; id: string; label: string; angles: ("front" | "left" | "right")[] }
  | { kind: "legacy"; filename: string; label: string };

const MODELS = [
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro", color: PROVIDER_COLORS.gemini },
  { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash", color: PROVIDER_COLORS.gemini },
  { id: "gemini-3.1-flash-lite-image", label: "Gemini 3.1 Flash Lite", color: PROVIDER_COLORS.gemini },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash", color: PROVIDER_COLORS.gemini },
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst (précis)", color: PROVIDER_COLORS.openai },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare (rapide)", color: PROVIDER_COLORS.openai },
  { id: "gpt-image-2", label: "GPT Image 2 (4K)", color: PROVIDER_COLORS.openai },
  { id: "gpt-image-1", label: "GPT Image 1", color: PROVIDER_COLORS.openai },
  { id: "bytedance-seed/seedream-4.5", label: "Seedream 4.5 (ByteDance)", color: PROVIDER_COLORS.openrouter },
];

export default function AppSidebar() {
  const { state: sidebarState } = useSidebar();
  const [activeTab, setActiveTab] = useState<SidebarTab>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [swipeEntries, setSwipeEntries] = useState<SwipeEntry[]>([]);
  const [youtubeItems, setYoutubeItems] = useState<YouTubeItem[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [swipeSearch, setSwipeSearch] = useState("");
  const [faceReactions, setFaceReactions] = useState<FaceReaction[]>([]);
  const [faceUploading, setFaceUploading] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showWebcamCapture, setShowWebcamCapture] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [uploadedSwipes, setUploadedSwipes] = useState<SwipeEntry[]>([]);
  const [swipeUploading, setSwipeUploading] = useState(false);
  const [logos, setLogos] = useState<LogoEntry[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [visagesSearch, setVisagesSearch] = useState("");
  const [logosSearch, setLogosSearch] = useState("");
  const [newVisageOpen, setNewVisageOpen] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const swipeInputRef = useRef<HTMLInputElement>(null);
  const addNode = useCanvasStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();
  const pathname = usePathname();
  const router = useRouter();
  // The canvas now lives at /m/<projectId>; "/" only redirects to the gallery.
  const onCanvas = pathname.startsWith("/m/");

  const loadFaces = () => {
    fetch("/api/face-reactions").then((r) => r.json()).then(setFaceReactions).catch(() => {});
  };
  const loadPersonas = () => {
    fetch("/api/personas").then((r) => r.json()).then(setPersonas).catch(() => {});
  };

  // WebcamCaptureModal's naming step (added in this task — see that file) hands back
  // the name the user typed after capturing all 3 angles; fall back to the old default
  // label when it's left blank.
  const handlePersonaCaptured = async (photos: Record<"front" | "left" | "right", string>, name: string) => {
    setSavingPersona(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name || `Personnage ${personas.length + 1}`, photos }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || "Échec de l'enregistrement du personnage — réessaie.");
        return;
      }
      loadPersonas();
      setShowWebcamCapture(false);
    } catch {
      window.alert("Échec de l'enregistrement du personnage — vérifie ta connexion et réessaie.");
    } finally {
      setSavingPersona(false);
    }
  };

  const handleDeletePersona = async (id: string, label: string) => {
    if (!window.confirm(`Supprimer "${label}" ? Les nœuds du canvas qui l'utilisent ne fonctionneront plus.`)) return;
    try {
      const res = await fetch(`/api/personas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      loadPersonas();
    } catch {
      window.alert("Échec de la suppression — réessaie.");
    }
  };

  const loadUploadedSwipes = () => {
    fetch("/api/swipe-files").then((r) => r.json()).then(setUploadedSwipes).catch(() => {});
  };

  useEffect(() => {
    fetch("/swipe-file/manifest.json").then((r) => r.json()).then(setSwipeEntries).catch(() => {});
  }, []);
  useEffect(() => { loadFaces(); }, []);
  useEffect(() => { loadPersonas(); }, []);
  useEffect(() => { loadUploadedSwipes(); }, []);

  const fileToDataUrl = (file: File, maxSize = 1600): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFaceUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFaceUploading(true);
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrl(file);
      await fetch("/api/face-reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, label: file.name.replace(/\.[^.]+$/, ""), ext: "jpg" }),
      });
    }
    setFaceUploading(false);
    loadFaces();
  };

  const handleDeleteFace = async (filename: string) => {
    await fetch(`/api/face-reactions?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
    loadFaces();
  };

  const handleSwipeUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSwipeUploading(true);
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrl(file);
      await fetch("/api/swipe-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, title: file.name.replace(/\.[^.]+$/, ""), ext: "jpg" }),
      });
    }
    setSwipeUploading(false);
    loadUploadedSwipes();
  };

  const handleDeleteSwipe = async (filename: string) => {
    await fetch(`/api/swipe-files?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
    loadUploadedSwipes();
  };

  const loadLogos = () => {
    fetch("/api/logos").then((r) => r.json()).then(setLogos).catch(() => {});
  };
  useEffect(() => { loadLogos(); }, []);

  const fileToDataUrlPng = (file: File, maxSize = 512): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLogoUploading(true);
    for (const file of Array.from(files)) {
      const dataUrl = await fileToDataUrlPng(file);
      await fetch("/api/logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, label: file.name.replace(/\.[^.]+$/, ""), ext: "png" }),
      });
    }
    setLogoUploading(false);
    loadLogos();
  };

  const handleDeleteLogo = async (filename: string) => {
    await fetch(`/api/logos?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
    loadLogos();
  };

  const fetchPlaylist = () => {
    setYoutubeLoading(true);
    fetch("/api/youtube/playlist")
      .then((r) => r.json())
      .then((data) => { if (data.items) setYoutubeItems(data.items); })
      .catch(() => {})
      .finally(() => setYoutubeLoading(false));
  };

  useEffect(() => {
    fetchPlaylist();
    const interval = setInterval(fetchPlaylist, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const onSettingsSaved = () => { fetchPlaylist(); };

  const toggleTab = (tab: SidebarTab) => setActiveTab((prev) => (prev === tab ? null : tab));

  const addAtCenter = (type: string, data?: Record<string, unknown>) => {
    if (!onCanvas) {
      // No canvas mounted here — send them to pick one first.
      router.push("/miniatures");
      return;
    }
    const pos = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    pos.x += (Math.random() - 0.5) * 100;
    pos.y += (Math.random() - 0.5) * 100;
    addNode(type, pos, data);
  };

  const onDragStart = (e: DragEvent, type: string, data?: Record<string, unknown>) => {
    e.dataTransfer.setData("application/reactflow-type", type);
    if (data) e.dataTransfer.setData("application/reactflow-data", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "move";
  };

  const onSwipeDragStart = (e: DragEvent, imageUrl: string, label: string) => {
    e.dataTransfer.setData("application/reactflow-type", "swipeFile");
    e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl, label }));
    e.dataTransfer.effectAllowed = "move";
  };

  const filteredSwipe = swipeEntries.filter((e) => e.title.toLowerCase().includes(swipeSearch.toLowerCase()));
  const filteredYoutube = youtubeItems.filter((e) => e.title.toLowerCase().includes(swipeSearch.toLowerCase()));

  // Personas arrive newest-first from GET /api/personas (ORDER BY created_at
  // DESC); face-reactions arrive oldest-first from GET /api/face-reactions
  // (ORDER BY created_at ASC — an existing, unrelated API contract this task
  // does not touch) — reversed here to newest-first to match. Neither
  // response carries created_at, so a true chronological interleave across
  // both types isn't possible without a backend change (out of scope) —
  // personas group first (newest-first), then legacy faces (newest-first).
  const visageEntries: VisageEntry[] = [
    ...personas.map((p): VisageEntry => ({ kind: "persona", id: p.id, label: p.label, angles: p.angles })),
    ...[...faceReactions].reverse().map((f): VisageEntry => ({ kind: "legacy", filename: f.filename, label: f.label })),
  ];
  const filteredVisages = visageEntries.filter((e) => e.label.toLowerCase().includes(visagesSearch.toLowerCase()));
  const filteredLogos = logos.filter((l) => l.label.toLowerCase().includes(logosSearch.toLowerCase()));

  const renamePersona = async (id: string, label: string) => {
    await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    loadPersonas();
  };

  const renameFace = async (filename: string, label: string) => {
    await fetch("/api/face-reactions/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, label }),
    });
    loadFaces();
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
            <Link href="/" className="flex size-9 shrink-0 items-center justify-center rounded-xl" aria-label="ThumbGen home">
              <Image src="/illith.svg" alt="" width={24} height={24} priority />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium leading-tight">ThumbGen</span>
              <span className="truncate text-xs text-sidebar-foreground/60 leading-tight">Illith Studio</span>
            </div>
            <SidebarTrigger className="shrink-0" />
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Mes miniatures"
                    isActive={pathname === "/miniatures"}
                    onClick={() => { setActiveTab(null); router.push("/miniatures"); }}
                  >
                    <Film />
                    <span>Mes miniatures</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Bibliothèque</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Personnages" isActive={activeTab === "faces"} onClick={() => toggleTab("faces")}>
                    <Users />
                    <span>Personnages</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Modèles d'image" isActive={activeTab === "models"} onClick={() => toggleTab("models")}>
                    <ImageIcon />
                    <span>Modèles d&apos;image</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Inspirations" isActive={activeTab === "swipe"} onClick={() => toggleTab("swipe")}>
                    <LayoutGrid />
                    <span>Inspirations</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Logos" isActive={activeTab === "logos"} onClick={() => toggleTab("logos")}>
                    <Shapes />
                    <span>Logos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Usage et coûts" isActive={pathname === "/usage"} onClick={() => router.push("/usage")}>
                <BarChart3 />
                <span>Usage</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Réglages" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
                <span>Réglages</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Expandable flyout panel — same role as the old Sidebar.tsx's activeTab panel.
          The shadcn Sidebar primitive has no secondary-flyout concept, so this stays a
          plain fixed-position sibling, positioned right at the icon rail's edge. */}
      {activeTab && (
        <div
          className="fixed top-0 bottom-0 z-10 overflow-y-auto bg-sidebar border-r border-sidebar-border transition-[left] duration-200 ease-linear"
          style={{
            // Follows the real rail width so the flyout never lands under an
            // expanded sidebar (the rail is 4rem collapsed, --sidebar-width open).
            left: sidebarState === "collapsed" ? "var(--sidebar-width-icon, 4rem)" : "var(--sidebar-width)",
            width: activeTab === "swipe" || activeTab === "faces" || activeTab === "logos" ? 300 : 240,
          }}
        >
          <div className="p-4">
            {(activeTab === "faces" || activeTab === "logos") && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Rechercher"
                  value={activeTab === "faces" ? visagesSearch : logosSearch}
                  onChange={(e) => (activeTab === "faces" ? setVisagesSearch(e.target.value) : setLogosSearch(e.target.value))}
                  className="pl-9"
                />
              </div>
            )}

            {activeTab === "faces" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Visages</h3>
                  <Button size="sm" variant="secondary" onClick={() => setNewVisageOpen(true)} disabled={savingPersona || faceUploading}>
                    <Plus className="size-3" />
                    {savingPersona ? "Enregistrement…" : faceUploading ? "Import…" : "Nouveau visage"}
                  </Button>
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Clique pour ajouter au canvas ({filteredVisages.length})</p>

                {filteredVisages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => setNewVisageOpen(true)}>
                    <Users className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-center px-4 text-muted-foreground">
                      {visagesSearch ? "Aucun résultat." : "Crée ton premier visage"}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {filteredVisages.map((entry) =>
                    entry.kind === "persona" ? (
                      <div
                        key={`persona-${entry.id}`}
                        className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                        onClick={() =>
                          addAtCenter("faceReference", {
                            label: entry.label,
                            personaId: entry.id,
                            personaAngles: {
                              front: entry.angles.includes("front") ? `/api/personas/image?id=${entry.id}&angle=front` : undefined,
                              left: entry.angles.includes("left") ? `/api/personas/image?id=${entry.id}&angle=left` : undefined,
                              right: entry.angles.includes("right") ? `/api/personas/image?id=${entry.id}&angle=right` : undefined,
                            },
                          })
                        }
                      >
                        <img src={`/api/personas/image?id=${entry.id}&angle=${entry.angles[0]}`} alt={entry.label} className="w-full aspect-square object-cover" loading="lazy" />
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                          <input
                            defaultValue={entry.label}
                            className="flex-1 min-w-0 truncate text-[10px] bg-transparent text-white focus:outline-none nopan nodrag"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== entry.label) renamePersona(entry.id, v);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-[9px] text-white/80 shrink-0 ml-1">{entry.angles.length}/3</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeletePersona(entry.id, entry.label); }}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/75 hover:bg-destructive transition-colors"
                          title="Supprimer"
                        >
                          <X className="size-3 text-white" strokeWidth={2.5} />
                        </button>
                      </div>
                    ) : (
                      <div
                        key={`legacy-${entry.filename}`}
                        draggable
                        onClick={() => addAtCenter("faceReference", { imageUrl: `/api/face-reactions/image?f=${entry.filename}`, label: entry.label })}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/reactflow-type", "faceReference");
                          e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/face-reactions/image?f=${entry.filename}`, label: entry.label }));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                      >
                        <img src={`/api/face-reactions/image?f=${entry.filename}`} alt={entry.label} className="w-full aspect-square object-cover" loading="lazy" />
                        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                          <input
                            defaultValue={entry.label}
                            className="flex-1 min-w-0 truncate text-[10px] bg-transparent text-white focus:outline-none nopan nodrag"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== entry.label) renameFace(entry.filename, v);
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-[9px] text-white/80 shrink-0 ml-1">1 photo</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteFace(entry.filename); }}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/75 hover:bg-destructive transition-colors"
                          title="Supprimer"
                        >
                          <X className="size-3 text-white" strokeWidth={2.5} />
                        </button>
                      </div>
                    ),
                  )}
                </div>

                <input
                  ref={faceInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleFaceUpload(e.target.files); setNewVisageOpen(false); }}
                />
              </>
            )}

            {activeTab === "swipe" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Inspirations</h3>
                  <Button size="sm" variant="secondary" onClick={() => swipeInputRef.current?.click()} disabled={swipeUploading}>
                    <Plus className="size-3" />
                    {swipeUploading ? "Import…" : "Ajouter"}
                  </Button>
                  <input ref={swipeInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleSwipeUpload(e.target.files)} />
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Glisse-dépose sur le canvas comme référence</p>

                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Rechercher des miniatures…" value={swipeSearch} onChange={(e) => setSwipeSearch(e.target.value)} className="pl-9" />
                </div>

                {uploadedSwipes.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs font-medium text-foreground">Mes références</span>
                      <span className="text-xs text-muted-foreground">({uploadedSwipes.length})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {uploadedSwipes.filter((e) => e.title.toLowerCase().includes(swipeSearch.toLowerCase())).map((entry) => (
                        <div
                          key={entry.filename}
                          draggable
                          onClick={() => addAtCenter("swipeFile", { imageUrl: `/api/swipe-files/image?f=${entry.filename}`, label: entry.title })}
                          onDragStart={(e) => onSwipeDragStart(e, `/api/swipe-files/image?f=${entry.filename}`, entry.title)}
                          className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                        >
                          <img src={`/api/swipe-files/image?f=${entry.filename}`} alt={entry.title} className="w-full aspect-video object-cover" loading="lazy" />
                          <button
                            onClick={(ev) => { ev.stopPropagation(); handleDeleteSwipe(entry.filename); }}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Supprimer"
                          >
                            <X className="size-2.5 text-destructive" strokeWidth={2.5} />
                          </button>
                          <div className="px-1.5 py-1 bg-card">
                            <p className="text-[10px] truncate text-muted-foreground">{entry.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF0000" strokeWidth="0">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
                      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#fff" />
                    </svg>
                    <span className="text-xs font-medium text-foreground">Playlist YouTube</span>
                    <span className="text-xs text-muted-foreground">({filteredYoutube.length})</span>
                  </div>

                  {youtubeLoading && youtubeItems.length === 0 ? (
                    <p className="text-xs py-4 text-center text-muted-foreground">Chargement de la playlist…</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredYoutube.map((item) => (
                        <div
                          key={item.videoId}
                          draggable
                          onClick={() => addAtCenter("swipeFile", { imageUrl: item.thumbnailUrl, label: item.title })}
                          onDragStart={(e) => onSwipeDragStart(e, item.thumbnailUrl, item.title)}
                          className="cursor-pointer rounded-lg overflow-hidden border border-transparent hover:border-muted"
                        >
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full aspect-video object-cover" loading="lazy" />
                          <div className="px-1.5 py-1 bg-card">
                            <p className="text-[10px] truncate text-muted-foreground">{item.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {filteredSwipe.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs font-medium text-foreground">Miniatures enregistrées</span>
                      <span className="text-xs text-muted-foreground">({filteredSwipe.length})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredSwipe.map((entry) => (
                        <div
                          key={entry.filename}
                          draggable
                          onClick={() => addAtCenter("swipeFile", { imageUrl: `/swipe-file/${entry.filename}`, label: entry.title })}
                          onDragStart={(e) => onSwipeDragStart(e, `/swipe-file/${entry.filename}`, entry.title)}
                          className="cursor-pointer rounded-lg overflow-hidden border border-transparent hover:border-muted"
                        >
                          <img src={`/swipe-file/${entry.filename}`} alt={entry.title} className="w-full aspect-video object-cover" loading="lazy" />
                          <div className="px-1.5 py-1 bg-card">
                            <p className="text-[10px] truncate text-muted-foreground">{entry.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredSwipe.length === 0 && filteredYoutube.length === 0 && (
                  <p className="text-xs text-center py-4 text-muted-foreground">Aucune miniature trouvée</p>
                )}
              </>
            )}

            {activeTab === "models" && (
              <>
                <h3 className="text-sm font-medium mb-1 text-foreground">Modèles d&apos;image</h3>
                <p className="text-xs mb-3 text-muted-foreground">Glisse un modèle sur le canvas pour générer</p>
                <div className="space-y-1">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addAtCenter("generator", { model: m.id })}
                      draggable
                      onDragStart={(e) => onDragStart(e, "generator", { model: m.id })}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer bg-card border border-transparent hover:border-muted text-muted-foreground"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={m.color} strokeWidth="0">
                        <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                      </svg>
                      <span className="text-xs font-medium">{m.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTab === "logos" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Logos</h3>
                  <Button size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                    <Plus className="size-3" />
                    {logoUploading ? "Import…" : "Ajouter"}
                  </Button>
                  <input ref={logoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleLogoUpload(e.target.files)} />
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Glisse-dépose sur le canvas ({logos.length})</p>

                {filteredLogos.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => logoInputRef.current?.click()}>
                    <Shapes className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground">{logosSearch ? "Aucun résultat." : "Importe tes logos ici"}</p>
                  </div>
                )}

                <div className="space-y-2">
                  {filteredLogos.map((logo) => (
                    <div
                      key={logo.filename}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/reactflow-type", "swipeFile");
                        e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group flex items-center gap-3 px-2 py-2 rounded-xl cursor-grab bg-muted border border-transparent hover:border-primary"
                    >
                      <div
                        className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden bg-white/5"
                        style={{ width: 44, height: 44 }}
                        onClick={() => addAtCenter("swipeFile", { imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label })}
                      >
                        <img src={`/api/logos/image?f=${logo.filename}`} alt={logo.label} className="max-w-full max-h-full object-contain" loading="lazy" />
                      </div>

                      <input
                        type="text"
                        defaultValue={logo.label}
                        className="flex-1 bg-transparent text-xs font-medium focus:outline-none nopan nodrag text-foreground"
                        onBlur={(e) => {
                          const newLabel = e.target.value.trim();
                          if (newLabel && newLabel !== logo.label) {
                            fetch("/api/logos/rename", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ filename: logo.filename, label: newLabel }),
                            }).then(() => loadLogos());
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onClick={(e) => e.stopPropagation()}
                      />

                      <button
                        onClick={(ev) => { ev.stopPropagation(); handleDeleteLogo(logo.filename); }}
                        className="flex-shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-white/5"
                        title="Supprimer"
                      >
                        <X className="size-3 text-destructive" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showWebcamCapture && <WebcamCaptureModal onClose={() => setShowWebcamCapture(false)} onComplete={handlePersonaCaptured} />}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Réglages</DialogTitle>
          </DialogHeader>
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSaved={onSettingsSaved} />
        </DialogContent>
      </Dialog>

      <Dialog open={newVisageOpen} onOpenChange={setNewVisageOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau visage</DialogTitle>
            <DialogDescription>Choisis comment ajouter un visage à ta bibliothèque.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="justify-start" onClick={() => { setNewVisageOpen(false); setShowWebcamCapture(true); }}>
              <Camera className="size-4" />
              Capturer avec la webcam
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => faceInputRef.current?.click()}>
              <Upload className="size-4" />
              Importer une photo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
