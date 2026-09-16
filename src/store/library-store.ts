import { create } from "zustand";

export type LibraryTab = "models" | "faces" | "logos" | "swipe";

interface LibraryState {
  /** Sidebar flyout currently open (null = closed). */
  activeTab: LibraryTab | null;
  setActiveTab: (tab: LibraryTab | null) => void;
  toggleTab: (tab: LibraryTab) => void;
}

/**
 * Shared so that canvas nodes (the Personnage node's « Créer un
 * personnage ») can open a library tab of the AppSidebar.
 */
export const useLibraryStore = create<LibraryState>((set) => ({
  activeTab: null,
  setActiveTab: (activeTab) => set({ activeTab }),
  toggleTab: (tab) => set((state) => ({ activeTab: state.activeTab === tab ? null : tab })),
}));
