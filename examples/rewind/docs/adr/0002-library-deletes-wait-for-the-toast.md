# ADR-0002: Library deletes wait for the toast, with no timer

## Status

Accepted.

## Date

2026-09-24

## Context

The library deletes Rewinds and folders with Undo. The API has no soft
delete: `DELETE /api/rewinds/[id]` removes the row and its media blob,
and `DELETE /api/folders/[id]` unfiles its Rewinds through
`ON DELETE SET NULL`. Undo therefore cannot call the API after the fact.
It has to stop the request from being sent. The user chose, on
2026-09-24, that a delete toast has no timer (`SPEC-library.md`,
Decision 3).

## Decision

- Delete hides the item on screen and queues it in
  `src/lib/use-pending-deletes.ts`. Nothing is sent.
- The toast's `×` sends the `DELETE`. Undo drops it from the queue and
  restores the item. Each delete has its own toast.
- Leaving the page counts as `×`: `pagehide` and unmount send every
  queued `DELETE` with `fetch(..., { keepalive: true })`.
- Delete toasts never auto-dismiss. Other toasts still clear after 3 s.

## Alternatives Considered

### Soft delete (`deletedAt`) with a restore endpoint

- Pros: the delete is durable at once, and Undo works from any tab or
  after a crash.
- Cons: a schema change, a new route, and every read must filter
  `deletedAt`. The media blob needs a purge job.
- Rejected for v1: the spec forbids schema changes and new routes.

### Timed toast (send after N seconds)

- Pros: the delete lands even if the user never closes the toast.
- Cons: the user asked for no timer, so a slow reader can still undo.
- Rejected by the user.

## Consequences

- Until the toast closes, other tabs and API callers still see the item.
- A delete that never flushes is lost, not applied: a browser crash, or
  a `keepalive` request the browser drops, leaves the item in place.
  This fails safe (nothing is deleted by mistake).
- A test that reloads right after a delete must close the toast and wait
  for the `DELETE` first (`e2e/library.spec.ts`).
- Switching to soft delete later means a new ADR, a migration, and
  replacing `use-pending-deletes.ts`. The UI flow can stay the same.
