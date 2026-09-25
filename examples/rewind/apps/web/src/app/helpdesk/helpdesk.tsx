"use client";

import Link from "next/link";
import { ToastStack, useToast } from "@/components/toast";
import styles from "./helpdesk.module.css";

/**
 * `HELPDESK`-flagged screen (SPEC-design-parity.md § Screens): "Resolve
 * customer issues without back and forth." No real Intercom/helpdesk
 * integration exists, so both buttons are toast-only stubs, same as the
 * design's own `helpdeskFin` handlers.
 */
export function HelpdeskPage() {
  const { toasts, showToast, undo, close } = useToast();

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>
        ← Back to app
      </Link>
      <div className={styles.hero}>
        <h1 className={styles.title}>
          Resolve customer issues without back and forth
        </h1>
        <p className={styles.subtitle}>
          Every ticket comes with a Rewind: what the customer saw, what they
          clicked, and what broke.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => showToast("Intercom tab")}
          >
            Install for Intercom ↗
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => showToast("Other helpdesks")}
          >
            Other helpdesks ↗
          </button>
        </div>
      </div>
      <ToastStack toasts={toasts} onUndo={undo} onClose={close} />
    </div>
  );
}
