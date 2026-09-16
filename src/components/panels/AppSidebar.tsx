"use client";

import { useState, useEffect, useRef, DragEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCanvasStore } from "@/store/canvas-store";
import { useLibraryStore } from "@/store/library-store";
import { useReactFlow } from "@xyflow/react";
import { useGeneratorDefaults } from "@/hooks/useGeneratorDefaults";
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
import WebcamCaptureModal from "./WebcamCaptureModal";
import PersonaImportDialog from "./PersonaImportDialog";
import { personaImageUrl, personaNodeData, type PersonaAngle, type PersonaSummary } from "@/lib/personas";
import { PROVIDER_COLORS } from "@/lib/model-costs";
import { Users, Image as ImageIcon, LayoutGrid, Shapes, BarChart3, Settings as SettingsIcon, Search, Plus, X, Camera, Upload, Film } from "lucide-react";

/* eslint-disable @next/next/no-img-element */

type LogoEntry = { filename: string; label: string; size: number };
type SwipeEntry = { title: string; filename: string; size: number };
type YouTubeItem = { videoId: string; title: string; thumbnailUrl: string; addedAt: string };

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
  const activeTab = useLibraryStore((s) => s.activeTab);
  const setActiveTab = useLibraryStore((s) => s.setActiveTab);
  const toggleTab = useLibraryStore((s) => s.toggleTab);
  const [swipeEntries, setSwipeEntries] = useState<SwipeEntry[]>([]);
  const [youtubeItems, setYoutubeItems] = useState<YouTubeItem[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [swipeSearch, setSwipeSearch] = useState("");
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [showWebcamCapture, setShowWebcamCapture] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [uploadedSwipes, setUploadedSwipes] = useState<SwipeEntry[]>([]);
  const [swipeUploading, setSwipeUploading] = useState(false);
  const [logos, setLogos] = useState<LogoEntry[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [personasSearch, setPersonasSearch] = useState("");
  const [logosSearch, setLogosSearch] = useState("");
  const [newPersonaOpen, setNewPersonaOpen] = useState(false);
  const [personaImportOpen, setPersonaImportOpen] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const swipeInputRef = useRef<HTMLInputElement>(null);
  const addNode = useCanvasStore((s) => s.addNode);
  const generatorDefaults = useGeneratorDefaults();
  const { screenToFlowPosition } = useReactFlow();
  const pathname = usePathname();
  const router = useRouter();
  // The canvas now lives at /m/<projectId>; "/" only redirects to the gallery.
  const onCanvas = pathname.startsWith("/m/");

  const loadPersonas = () => {
    fetch("/api/personas").then((r) => r.json()).then(setPersonas).catch(() => {});
  };

  // Shared by the webcam wizard (3 angles + name) and the per-angle import
  // dialog (front required). A blank name falls back to « Personnage N ».
  const savePersona = async (photos: Partial<Record<PersonaAngle, string>>, name: string) => {
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
      setPersonaImportOpen(false);
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

  // The sidebar stays mounted across every /reglages section, so a saved
  // YouTube channel in "Ma chaîne" (ChaineSection) wouldn't otherwise refresh
  // this feed until the next 5-minute poll — refetch as soon as it's saved.
  useEffect(() => {
    const handler = () => fetchPlaylist();
    window.addEventListener("youtube-channel-saved", handler);
    return () => window.removeEventListener("youtube-channel-saved", handler);
  }, []);

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

  const filteredPersonas = personas.filter((p) => p.label.toLowerCase().includes(personasSearch.toLowerCase()));
  const filteredLogos = logos.filter((l) => l.label.toLowerCase().includes(logosSearch.toLowerCase()));

  const renamePersona = async (id: string, label: string) => {
    await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    loadPersonas();
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
              <SidebarMenuButton
                tooltip="Réglages"
                isActive={pathname.startsWith("/reglages")}
                onClick={() => { setActiveTab(null); router.push("/reglages"); }}
              >
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
                  value={activeTab === "faces" ? personasSearch : logosSearch}
                  onChange={(e) => (activeTab === "faces" ? setPersonasSearch(e.target.value) : setLogosSearch(e.target.value))}
                  className="pl-9"
                />
              </div>
            )}

            {activeTab === "faces" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-foreground">Personnages</h3>
                  <Button size="sm" variant="secondary" onClick={() => setNewPersonaOpen(true)} disabled={savingPersona}>
                    <Plus className="size-3" />
                    {savingPersona ? "Enregistrement…" : "Nouveau personnage"}
                  </Button>
                </div>
                <p className="text-xs mb-3 text-muted-foreground">Clique pour ajouter au canvas ({filteredPersonas.length})</p>

                {filteredPersonas.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer border-2 border-dashed border-border" onClick={() => setNewPersonaOpen(true)}>
                    <Users className="size-8 mb-2 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xs text-center px-4 text-muted-foreground">
                      {personasSearch ? "Aucun résultat." : "Crée ton premier personnage"}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {filteredPersonas.map((persona) => (
                    <div
                      key={persona.id}
                      className="group cursor-pointer rounded-lg overflow-hidden relative border border-transparent hover:border-muted"
                      onClick={() => addAtCenter("faceReference", personaNodeData(persona))}
                    >
                      {persona.angles[0] ? (
                        <img src={personaImageUrl(persona.id, persona.angles[0])} alt={persona.label} className="w-full aspect-square object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full aspect-square bg-muted" />
                      )}
                      <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent">
                        <input
                          defaultValue={persona.label}
                          className="flex-1 min-w-0 truncate text-[10px] bg-transparent text-white focus:outline-none nopan nodrag"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== persona.label) renamePersona(persona.id, v);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="text-[9px] text-white/80 shrink-0 ml-1">{persona.angles.length}/3</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeletePersona(persona.id, persona.label); }}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/75 hover:bg-destructive transition-colors"
                        title="Supprimer"
                      >
                        <X className="size-3 text-white" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
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
                      onClick={() => addAtCenter("generator", { ...generatorDefaults, model: m.id })}
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
                        e.dataTransfer.setData("application/reactflow-data", JSON.stringify({ imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label, kind: "logo" }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group flex items-center gap-3 px-2 py-2 rounded-xl cursor-grab bg-muted border border-transparent hover:border-primary"
                    >
                      <div
                        className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden bg-white/5"
                        style={{ width: 44, height: 44 }}
                        onClick={() => addAtCenter("swipeFile", { imageUrl: `/api/logos/image?f=${logo.filename}`, label: logo.label, kind: "logo" })}
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

      {showWebcamCapture && <WebcamCaptureModal onClose={() => setShowWebcamCapture(false)} onComplete={savePersona} />}

      {personaImportOpen && (
        <PersonaImportDialog
          onClose={() => setPersonaImportOpen(false)}
          prepareFile={(file) => fileToDataUrl(file)}
          onSubmit={savePersona}
          saving={savingPersona}
        />
      )}

      <Dialog open={newPersonaOpen} onOpenChange={setNewPersonaOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau personnage</DialogTitle>
            <DialogDescription>Ton visage sous trois angles (face, profil gauche, profil droit) pour des miniatures qui te ressemblent.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="justify-start" onClick={() => { setNewPersonaOpen(false); setShowWebcamCapture(true); }}>
              <Camera className="size-4" />
              Capturer avec la webcam
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => { setNewPersonaOpen(false); setPersonaImportOpen(true); }}>
              <Upload className="size-4" />
              Importer une photo par angle
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
