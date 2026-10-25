"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

// The app calls toast.*() in many places but never rendered a <Toaster />,
// so none of those messages were ever shown.
export function ToasterThemed() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      offset={16}
      toastOptions={{
        style: {
          background: "var(--surface)",
          color: "var(--ink)",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          fontFamily: "var(--font-sans)",
          boxShadow: "none",
        },
      }}
    />
  );
}
