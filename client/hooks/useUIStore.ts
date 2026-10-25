import { create } from "zustand";

interface UIState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;

  /** The "new group" dialog is driven from state, not the URL, so it can be reopened any number of times. */
  newGroupOpen: boolean;
  setNewGroupOpen: (open: boolean) => void;

  /** Bumped to ask the sidebar to focus its search box. */
  searchFocusTick: number;
  focusSearch: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

  newGroupOpen: false,
  setNewGroupOpen: (open) => set({ newGroupOpen: open }),

  searchFocusTick: 0,
  focusSearch: () => set((state) => ({ isSidebarOpen: true, searchFocusTick: state.searchFocusTick + 1 })),
}));
