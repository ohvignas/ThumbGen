import { describe, it, expect, beforeEach } from "vitest";
import { useLibraryStore } from "@/store/library-store";

beforeEach(() => useLibraryStore.setState({ activeTab: null }));

describe("library store", () => {
  it("opens a tab and closes it", () => {
    useLibraryStore.getState().setActiveTab("faces");
    expect(useLibraryStore.getState().activeTab).toBe("faces");
    useLibraryStore.getState().setActiveTab(null);
    expect(useLibraryStore.getState().activeTab).toBeNull();
  });

  it("toggles the same tab closed and switches to another tab", () => {
    const { toggleTab } = useLibraryStore.getState();
    toggleTab("logos");
    expect(useLibraryStore.getState().activeTab).toBe("logos");
    toggleTab("faces");
    expect(useLibraryStore.getState().activeTab).toBe("faces");
    toggleTab("faces");
    expect(useLibraryStore.getState().activeTab).toBeNull();
  });
});
