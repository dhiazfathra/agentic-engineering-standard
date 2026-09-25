const KEY = "rewind-theme";

/**
 * The literal, constant script text the root layout inlines
 * (`dangerouslySetInnerHTML`) so dark mode applies before paint. No user
 * input ever reaches it.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(KEY)})==="dark")document.body.classList.add("rw-dark")}catch(e){}`;

/** Toggles `rw-dark` on `<body>`. */
export function applyTheme(dark: boolean): void {
  document.body.classList.toggle("rw-dark", dark);
}

/** Persists the choice; a blocked store still lets the class toggle. */
export function storeTheme(dark: boolean): void {
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light");
  } catch {
    // storage blocked (private mode, quota) — theme still applies this session
  }
}

/** Applies and stores in one call, for the toggle and the palette item. */
export function setTheme(dark: boolean): void {
  applyTheme(dark);
  storeTheme(dark);
}
