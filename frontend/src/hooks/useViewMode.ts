import { create } from "zustand";

type ViewMode = "ae" | "carrier";

interface ViewModeState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

export const useViewMode = create<ViewModeState>((set) => ({
  viewMode: (typeof window !== "undefined" ? localStorage.getItem("viewMode") as ViewMode : null) || "ae",
  setViewMode: (mode) => {
    localStorage.setItem("viewMode", mode);
    set({ viewMode: mode });
  },
  toggleViewMode: () =>
    set((state) => {
      const next = state.viewMode === "ae" ? "carrier" : "ae";
      localStorage.setItem("viewMode", next);
      return { viewMode: next };
    }),
}));
