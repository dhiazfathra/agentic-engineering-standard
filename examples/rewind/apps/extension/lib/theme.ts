export type Theme = "light" | "dark" | "system";

/** Toggles `body.rw-dark`; "system" follows `prefers-color-scheme`. */
export function applyTheme(theme: Theme): void {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.classList.toggle("rw-dark", dark);
}
