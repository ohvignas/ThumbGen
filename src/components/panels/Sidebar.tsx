"use client";

import { useState, useEffect, useRef, DragEvent } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { useReactFlow } from "@xyflow/react";
import SettingsPanel from "./SettingsPanel";

type SidebarTab = "models" | "faces" | "logos" | "swipe" | "settings" | null;

type LogoEntry = {
  filename: string;
  label: string;
  size: number;
};

type SwipeEntry = {
  title: string;
  filename: string;
  size: number;
};

type YouTubeItem = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  addedAt: string;
};

type FaceReaction = {
  filename: string;
  label: string;
  size: number;
};

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState<SidebarTab>(null);
  const [swipeEntries, setSwipeEntries] = useState<SwipeEntry[]>([]);
  const [youtubeItems, setYoutubeItems] = useState<YouTubeItem[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [swipeSearch, setSwipeSearch] = useState("");
  const [faceReactions, setFaceReactions] = useState<FaceReaction[]>([]);
  const [faceUploading, setFaceUploading] = useState(false);
  const [uploadedSwipes, setUploadedSwipes] = useState<SwipeEntry[]>([]);
  const [swipeUploading, setSwipeUploading] = useState(false);
  const [logos, setLogos] = useState<LogoEntry[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const swipeInputRef = useRef<HTMLInputElement>(null);
  const addNode = useCanvasStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const loadFaces = () => {
    fetch("/api/face-reactions")
      .then((r) => r.json())
      .then(setFaceReactions)
      .catch(() => {});
  };

  const loadUploadedSwipes = () => {
    fetch("/api/swipe-files")
      .then((r) => r.json())
      .then(setUploadedSwipes)
      .catch(() => {});
  };

  // Load static swipe files
  useEffect(() => {
    fetch("/swipe-file/manifest.json")
      .then((r) => r.json())
      .then(setSwipeEntries)
      .catch(() => {});
  }, []);

  // Load face reactions from API
  useEffect(() => {
    loadFaces();
  }, []);

  // Load uploaded swipe files from API
  useEffect(() => {
    loadUploadedSwipes();
  }, []);

  const fileToDataUrl = (file: File, maxSize = 1600): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
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
        body: JSON.stringify({
          dataUrl,
          label: file.name.replace(/\.[^.]+$/, ""),
          ext: "jpg",
        }),
      });
    }
    setFaceUploading(false);
    loadFaces();
  };

  const handleDeleteFace = async (filename: string) => {
    await fetch(`/api/face-reactions?filename=${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
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
        body: JSON.stringify({
          dataUrl,
          title: file.name.replace(/\.[^.]+$/, ""),
          ext: "jpg",
        }),
      });
    }
    setSwipeUploading(false);
    loadUploadedSwipes();
  };

  const handleDeleteSwipe = async (filename: string) => {
    await fetch(`/api/swipe-files?filename=${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    loadUploadedSwipes();
  };

  const loadLogos = () => {
    fetch("/api/logos")
      .then((r) => r.json())
      .then(setLogos)
      .catch(() => {});
  };

  useEffect(() => {
    loadLogos();
  }, []);

  const fileToDataUrlPng = (file: File, maxSize = 512): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
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
        body: JSON.stringify({
          dataUrl,
          label: file.name.replace(/\.[^.]+$/, ""),
          ext: "png",
        }),
      });
    }
    setLogoUploading(false);
    loadLogos();
  };

  const handleDeleteLogo = async (filename: string) => {
    await fetch(`/api/logos?filename=${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    loadLogos();
  };

  const fetchPlaylist = () => {
    setYoutubeLoading(true);
    fetch("/api/youtube/playlist")
      .then((r) => r.json())
      .then((data) => {
        if (data.items) setYoutubeItems(data.items);
      })
      .catch(() => {})
      .finally(() => setYoutubeLoading(false));
  };

  // Load YouTube playlist items
  useEffect(() => {
    fetchPlaylist();
    const interval = setInterval(fetchPlaylist, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const onSettingsSaved = () => {
    fetchPlaylist();
  };

  const toggleTab = (tab: SidebarTab) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const addAtCenter = (type: string, data?: Record<string, unknown>) => {
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    pos.x += (Math.random() - 0.5) * 100;
    pos.y += (Math.random() - 0.5) * 100;
    addNode(type, pos, data);
  };

  const onDragStart = (e: DragEvent, type: string, data?: Record<string, unknown>) => {
    e.dataTransfer.setData("application/reactflow-type", type);
    if (data) {
      e.dataTransfer.setData("application/reactflow-data", JSON.stringify(data));
    }
    e.dataTransfer.effectAllowed = "move";
  };

  const onSwipeDragStart = (e: DragEvent, imageUrl: string, label: string) => {
    e.dataTransfer.setData("application/reactflow-type", "swipeFile");
    e.dataTransfer.setData(
      "application/reactflow-data",
      JSON.stringify({ imageUrl, label })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const filteredSwipe = swipeEntries.filter((e) =>
    e.title.toLowerCase().includes(swipeSearch.toLowerCase())
  );
  const filteredYoutube = youtubeItems.filter((e) =>
    e.title.toLowerCase().includes(swipeSearch.toLowerCase())
  );

  return (
    <div className="absolute top-0 left-0 bottom-0 z-10 flex">
      {/* Icon bar */}
      <div
        className="flex flex-col items-center py-4 gap-1"
        style={{
          width: 56,
          background: "var(--canvas-bg)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Logo */}
        <div className="mb-4 p-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent)" strokeWidth="0">
            <rect x="2" y="4" width="4" height="16" rx="1" />
            <rect x="10" y="4" width="4" height="16" rx="1" />
            <rect x="18" y="4" width="4" height="16" rx="1" />
          </svg>
        </div>

        <SidebarIcon
          active={activeTab === "faces"}
          onClick={() => toggleTab("faces")}
          title="Face Reactions"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
          </svg>
        </SidebarIcon>

        <SidebarIcon
          active={activeTab === "models"}
          onClick={() => toggleTab("models")}
          title="Image Models"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 15l5-5 4 4 4-6 5 7" />
            <circle cx="15" cy="8" r="1.5" />
          </svg>
        </SidebarIcon>

        <SidebarIcon
          active={activeTab === "swipe"}
          onClick={() => toggleTab("swipe")}
          title="Swipe Files"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="8" height="8" rx="1" />
            <rect x="14" y="2" width="8" height="8" rx="1" />
            <rect x="2" y="14" width="8" height="8" rx="1" />
            <rect x="14" y="14" width="8" height="8" rx="1" />
          </svg>
        </SidebarIcon>

        <SidebarIcon
          active={activeTab === "logos"}
          onClick={() => toggleTab("logos")}
          title="Logos"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
            <circle cx="17" cy="17" r="3" />
          </svg>
        </SidebarIcon>

        <div className="flex-1" />

        <SidebarIcon
          active={activeTab === "settings"}
          onClick={() => toggleTab("settings")}
          title="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </SidebarIcon>
      </div>

      {/* Expandable panel */}
      {activeTab && (
        <div
          className="overflow-y-auto"
          style={{
            width: activeTab === "swipe" || activeTab === "faces" || activeTab === "settings" || activeTab === "logos" ? 300 : 240,
            background: "var(--canvas-bg)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            maxHeight: "100vh",
          }}
        >
          <div className="p-4">
            {/* Search */}
            <div className="relative mb-4">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-9 pr-3 py-2 rounded-lg text-xs focus:outline-none"
                style={{
                  background: "var(--surface)",
                  color: "var(--text-secondary)",
                  border: "1px solid transparent",
                }}
              />
            </div>

            {activeTab === "faces" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Face Reactions
                  </h3>
                  <button
                    onClick={() => faceInputRef.current?.click()}
                    disabled={faceUploading}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      opacity: faceUploading ? 0.5 : 1,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {faceUploading ? "Upload..." : "Ajouter"}
                  </button>
                  <input
                    ref={faceInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFaceUpload(e.target.files)}
                  />
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Click to add to canvas ({faceReactions.length})
                </p>

                {faceReactions.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer transition-all"
                    style={{ border: "2px dashed rgba(255,255,255,0.1)" }}
                    onClick={() => faceInputRef.current?.click()}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                      <circle cx="12" cy="8" r="5" />
                      <path d="M20 21a8 8 0 0 0-16 0" />
                    </svg>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Upload tes photos ici
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {faceReactions.map((face) => (
                    <div
                      key={face.filename}
                      draggable
                      onClick={() =>
                        addAtCenter("faceReference", {
                          imageUrl: `/api/face-reactions/image?f=${face.filename}`,
                          label: face.label,
                        })
                      }
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/reactflow-type", "faceReference");
                        e.dataTransfer.setData(
                          "application/reactflow-data",
                          JSON.stringify({
                            imageUrl: `/api/face-reactions/image?f=${face.filename}`,
                            label: face.label,
                          })
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group cursor-pointer rounded-lg overflow-hidden transition-all relative"
                      style={{ border: "1px solid transparent" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--surface)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "transparent";
                      }}
                    >
                      <img
                        src={`/api/face-reactions/image?f=${face.filename}`}
                        alt={face.label}
                        className="w-full aspect-video object-cover"
                        loading="lazy"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFace(face.filename);
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.7)" }}
                        title="Supprimer"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                      <div className="px-1.5 py-1" style={{ background: "var(--node-bg)" }}>
                        <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                          {face.label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === "swipe" && (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Swipe Files
                  </h3>
                  <button
                    onClick={() => swipeInputRef.current?.click()}
                    disabled={swipeUploading}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      opacity: swipeUploading ? 0.5 : 1,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {swipeUploading ? "Upload..." : "Ajouter"}
                  </button>
                  <input
                    ref={swipeInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleSwipeUpload(e.target.files)}
                  />
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Drag to canvas as reference
                </p>

                {/* Search */}
                <div className="relative mb-3">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search thumbnails..."
                    value={swipeSearch}
                    onChange={(e) => setSwipeSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-xs focus:outline-none"
                    style={{
                      background: "var(--surface)",
                      color: "var(--text-secondary)",
                      border: "1px solid transparent",
                    }}
                  />
                </div>

                {/* Uploaded References Section */}
                {uploadedSwipes.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Mes Références
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        ({uploadedSwipes.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {uploadedSwipes
                        .filter((e) => e.title.toLowerCase().includes(swipeSearch.toLowerCase()))
                        .map((entry) => (
                        <div
                          key={entry.filename}
                          draggable
                          onClick={() =>
                            addAtCenter("swipeFile", {
                              imageUrl: `/api/swipe-files/image?f=${entry.filename}`,
                              label: entry.title,
                            })
                          }
                          onDragStart={(e) =>
                            onSwipeDragStart(e, `/api/swipe-files/image?f=${entry.filename}`, entry.title)
                          }
                          className="group cursor-pointer rounded-lg overflow-hidden transition-all relative"
                          style={{ border: "1px solid transparent" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--surface)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "transparent";
                          }}
                        >
                          <img
                            src={`/api/swipe-files/image?f=${entry.filename}`}
                            alt={entry.title}
                            className="w-full aspect-video object-cover"
                            loading="lazy"
                          />
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleDeleteSwipe(entry.filename);
                            }}
                            className="absolute top-1 right-1 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: "rgba(0,0,0,0.7)" }}
                            title="Supprimer"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                          <div className="px-1.5 py-1" style={{ background: "var(--node-bg)" }}>
                            <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                              {entry.title}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* YouTube Playlist Section */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF0000" strokeWidth="0">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
                      <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#fff" />
                    </svg>
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                      YouTube Playlist
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      ({filteredYoutube.length})
                    </span>
                  </div>

                  {youtubeLoading && youtubeItems.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
                      Loading playlist...
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredYoutube.map((item) => (
                        <div
                          key={item.videoId}
                          draggable
                          onClick={() =>
                            addAtCenter("swipeFile", {
                              imageUrl: item.thumbnailUrl,
                              label: item.title,
                            })
                          }
                          onDragStart={(e) =>
                            onSwipeDragStart(e, item.thumbnailUrl, item.title)
                          }
                          className="cursor-pointer rounded-lg overflow-hidden transition-all"
                          style={{ border: "1px solid transparent" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--surface)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "transparent";
                          }}
                        >
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            className="w-full aspect-video object-cover"
                            loading="lazy"
                          />
                          <div className="px-1.5 py-1" style={{ background: "var(--node-bg)" }}>
                            <p
                              className="text-[10px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {item.title}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Static Swipe Files Section */}
                {filteredSwipe.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Saved Thumbnails
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        ({filteredSwipe.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {filteredSwipe.map((entry) => (
                        <div
                          key={entry.filename}
                          draggable
                          onClick={() =>
                            addAtCenter("swipeFile", {
                              imageUrl: `/swipe-file/${entry.filename}`,
                              label: entry.title,
                            })
                          }
                          onDragStart={(e) =>
                            onSwipeDragStart(e, `/swipe-file/${entry.filename}`, entry.title)
                          }
                          className="cursor-pointer rounded-lg overflow-hidden transition-all"
                          style={{ border: "1px solid transparent" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--surface)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "transparent";
                          }}
                        >
                          <img
                            src={`/swipe-file/${entry.filename}`}
                            alt={entry.title}
                            className="w-full aspect-video object-cover"
                            loading="lazy"
                          />
                          <div className="px-1.5 py-1" style={{ background: "var(--node-bg)" }}>
                            <p
                              className="text-[10px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {entry.title}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredSwipe.length === 0 && filteredYoutube.length === 0 && (
                  <p className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>
                    No thumbnails found
                  </p>
                )}
              </>
            )}

            {activeTab === "models" && (
              <>
                <h3 className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Générateurs
                </h3>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Glisse un modèle sur le canvas
                </p>
                <div className="space-y-1">
                  {[
                    { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro", color: "var(--accent)" },
                    { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash", color: "var(--accent)" },
                    { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash", color: "var(--accent)" },
                    { id: "ideogram", label: "Ideogram v3", color: "#BB68FF" },
                    { id: "gpt-image-2", label: "GPT Image 2 (4K)", color: "#10a37f" },
                    { id: "gpt-image-1.5", label: "GPT Image 1.5", color: "#10a37f" },
                    { id: "gpt-image-1", label: "GPT Image 1", color: "#10a37f" },
                    { id: "grok-imagine-image", label: "Grok Imagine", color: "#fff" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => addAtCenter("generator", { model: m.id })}
                      draggable
                      onDragStart={(e) => onDragStart(e, "generator", { model: m.id })}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all"
                      style={{ background: "var(--node-bg)", border: "1px solid transparent", color: "var(--text-secondary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--surface)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
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
                  <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Logos
                  </h3>
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      opacity: logoUploading ? 0.5 : 1,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {logoUploading ? "Upload..." : "Ajouter"}
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleLogoUpload(e.target.files)}
                  />
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Drag to canvas as reference ({logos.length})
                </p>

                {logos.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer transition-all"
                    style={{ border: "2px dashed rgba(255,255,255,0.1)" }}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                      <path d="M4 4h6v6H4zM14 4h6v6h-6z" />
                      <path d="M4 14h6v6H4z" />
                      <circle cx="17" cy="17" r="3" />
                    </svg>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Upload tes logos ici
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {logos.map((logo) => (
                    <div
                      key={logo.filename}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/reactflow-type", "swipeFile");
                        e.dataTransfer.setData(
                          "application/reactflow-data",
                          JSON.stringify({
                            imageUrl: `/api/logos/image?f=${logo.filename}`,
                            label: logo.label,
                          })
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="group flex items-center gap-3 px-2 py-2 rounded-xl cursor-grab transition-all"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "transparent";
                      }}
                    >
                      {/* Logo thumbnail */}
                      <div
                        className="flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden"
                        style={{ width: 44, height: 44, background: "rgba(255,255,255,0.05)" }}
                        onClick={() =>
                          addAtCenter("swipeFile", {
                            imageUrl: `/api/logos/image?f=${logo.filename}`,
                            label: logo.label,
                          })
                        }
                      >
                        <img
                          src={`/api/logos/image?f=${logo.filename}`}
                          alt={logo.label}
                          className="max-w-full max-h-full object-contain"
                          loading="lazy"
                        />
                      </div>

                      {/* Editable name */}
                      <input
                        type="text"
                        defaultValue={logo.label}
                        className="flex-1 bg-transparent text-xs font-medium focus:outline-none nopan nodrag"
                        style={{ color: "var(--text-primary)" }}
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />

                      {/* Delete button */}
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDeleteLogo(logo.filename);
                        }}
                        className="flex-shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(255,255,255,0.05)" }}
                        title="Supprimer"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === "settings" && (
              <SettingsPanel onClose={() => setActiveTab(null)} onSaved={onSettingsSaved} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarIcon({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2.5 rounded-xl transition-all"
      style={{
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
      }}
    >
      {children}
    </button>
  );
}

