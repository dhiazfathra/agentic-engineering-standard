"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import styles from "./login.module.css";

// Matches EMAIL_COOKIE in src/lib/auth.ts. Not imported directly: that
// module is server-only.
const EMAIL_COOKIE = "rw_last_email";

type Mode = "login" | "signup";

type FieldErrors = Partial<
  Record<"email" | "password" | "firstName" | "lastName", string>
>;

function readEmailCookie(): string | null {
  const match = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${EMAIL_COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(EMAIL_COOKIE.length + 1)) || null;
}

/** Flattened zod error shape from `parseBody`'s 400 response. */
type FlattenedError = { fieldErrors?: Record<string, string[]> };

function isFlattenedError(error: unknown): error is FlattenedError {
  return typeof error === "object" && error !== null && "fieldErrors" in error;
}

// The cookie never changes from outside this component, so subscribe is a
// no-op; only getSnapshot matters. getServerSnapshot avoids reading
// `document` during SSR (see learning/LESSONS.md on hydration mismatches).
const emailCookieStore = {
  subscribe: () => () => {},
  getSnapshot: readEmailCookie,
  getServerSnapshot: () => null,
};

export function LoginForm() {
  const router = useRouter();
  const cookieEmail = useSyncExternalStore(
    emailCookieStore.subscribe,
    emailCookieStore.getSnapshot,
    emailCookieStore.getServerSnapshot,
  );
  const [dismissedRemembered, setDismissedRemembered] = useState(false);
  const rememberedEmail = dismissedRemembered ? null : cookieEmail;
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const useRemembered = rememberedEmail !== null;
    const loginMode = useRemembered || mode === "login";
    const body = loginMode
      ? { email: useRemembered ? rememberedEmail : email, password }
      : { email, password, firstName, lastName };

    try {
      const res = await fetch(
        loginMode ? "/api/auth/login" : "/api/auth/signup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (res.ok) {
        router.push("/");
        return;
      }
      const data: unknown = await res.json().catch(() => null);
      const error = (data as { error?: unknown } | null)?.error;
      if (isFlattenedError(error) && error.fieldErrors) {
        const next: FieldErrors = {};
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          if (messages?.[0]) next[field as keyof FieldErrors] = messages[0];
        }
        setFieldErrors(next);
      } else {
        setFormError(
          typeof error === "string" ? error : "Something went wrong.",
        );
      }
    } catch {
      setFormError("Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const showRemembered = rememberedEmail !== null;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M11 5L3 12l8 7zM21 5l-8 7 8 7z"
            fill="var(--rw-accent-ink)"
          />
        </svg>
        <h1 className={styles.title}>
          {showRemembered ? "Welcome back" : "Log in to Rewind"}
        </h1>
        {!showRemembered && (
          <p className={styles.subtitle}>
            {mode === "login"
              ? "Log in to get to your Rewinds."
              : "Create an account to get started."}
          </p>
        )}
        <form className={styles.form} onSubmit={handleSubmit}>
          {formError && <div className={styles.formError}>{formError}</div>}
          {!showRemembered && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {fieldErrors.email && (
                <span className={styles.fieldError}>{fieldErrors.email}</span>
              )}
            </div>
          )}
          {!showRemembered && mode === "signup" && (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-first-name">
                  First name
                </label>
                <input
                  id="login-first-name"
                  type="text"
                  className={styles.input}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                {fieldErrors.firstName && (
                  <span className={styles.fieldError}>
                    {fieldErrors.firstName}
                  </span>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-last-name">
                  Last name
                </label>
                <input
                  id="login-last-name"
                  type="text"
                  className={styles.input}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
                {fieldErrors.lastName && (
                  <span className={styles.fieldError}>
                    {fieldErrors.lastName}
                  </span>
                )}
              </div>
            </>
          )}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {fieldErrors.password && (
              <span className={styles.fieldError}>
                {fieldErrors.password}
              </span>
            )}
          </div>
          <button type="submit" className={styles.submit} disabled={pending}>
            {pending
              ? "…"
              : showRemembered
                ? `Continue as ${rememberedEmail}`
                : mode === "login"
                  ? "Log in"
                  : "Create account"}
          </button>
        </form>
        {showRemembered ? (
          <button
            type="button"
            className={styles.switchLink}
            onClick={() => setDismissedRemembered(true)}
          >
            Not you? Use another email
          </button>
        ) : (
          <span className={styles.switch}>
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  className={styles.switchLink}
                  onClick={() => setMode("signup")}
                >
                  Create account
                </button>
              </>
            ) : (
              <>
                Have an account?{" "}
                <button
                  type="button"
                  className={styles.switchLink}
                  onClick={() => setMode("login")}
                >
                  Log in
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
