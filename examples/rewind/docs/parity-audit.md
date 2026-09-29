# Parity audit

Checklist for making `examples/rewind` match `docs/design/Rewind.dc.html` (the source of truth). Each row was checked by screenshot with `apps/web/scripts/parity-shot.mjs` (design state vs app route at 1412x826), not by reading code. Status: MATCH, DRIFT, MISSING, APP-ONLY (in the app, not in the design: remove or gate), UNVERIFIED (not yet compared), FLAG-OFF (built behind a flag that is off; visuals not yet compared). The goal is done when every row is MATCH or DEFERRED with a reason.

Audit run: 2026-09-30 on commit `d2222f6`. Rows live in the per-area tables below; evidence images sit next to each table.

| Area      | Rows                                          | Count | By status                                                                                                     |
| --------- | --------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| library   | [table](evidence/00-audit/library/audit.md)   | 35    | APP-ONLY 2, DRIFT 23, MATCH 3, MISSING 4, UNVERIFIED 3                                                        |
| viewer    | [table](evidence/00-audit/viewer/audit.md)    | 30    | APP-ONLY 3, DRIFT 11, MATCH 8, MISSING 8                                                                      |
| settings  | [table](evidence/00-audit/settings/audit.md)  | 46    | APP-ONLY 2, DRIFT 21, FLAG-OFF 9, MATCH 9, MISSING 3, UNVERIFIED 2                                            |
| links     | [table](evidence/00-audit/links/audit.md)     | 17    | APP-ONLY 1, DRIFT 6, MATCH 4, MISSING 5                                                                       |
| extension | [table](evidence/00-audit/extension/audit.md) | 25    | APP-ONLY 4, DRIFT 7, MATCH 6, MISSING 3, MISSING/UNVERIFIED 1, NOT-COMPARABLE 2, UNVERIFIED 2                 |
| **total** |                                               | 153   | APP-ONLY 12, DRIFT 68, FLAG-OFF 9, MATCH 30, MISSING 23, MISSING/UNVERIFIED 1, NOT-COMPARABLE 2, UNVERIFIED 7 |

## Required flows

| #   | Flow                                                                                                     | Status                   | Notes                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| F1  | Extension login, signed-in state, sign-out                                                               | MISSING                  | Popup has no sign-in UI; uploads depend on the web cookie (EXT-16).                      |
| F2  | Capture screenshot, tab video, area video, instant replay with console, network, events, env, timestamps | DRIFT                    | Captures exist with e2e; network headers/bodies and env (browser/OS/viewport) to verify. |
| F3  | Local draft, reopen, edit, upload; survives restart                                                      | DRIFT                    | Drafts exist; restart survival not yet e2e-tested.                                       |
| F4  | Upload to S3/MinIO + Turso; plays in viewer with synced timelines                                        | DRIFT (prod DEFERRED D1) | Works locally; prod storage unreachable.                                                 |
| F5  | Sign up, log in, log out, change password, profile, members/invites                                      | DRIFT                    | `/signup` 404 (LIB), no change-password (in progress).                                   |
| F6  | Share link, comments, error-signature grouping                                                           | DRIFT                    | See VIEW and LIB rows.                                                                   |
| F7  | Developer view: repro steps, first error + stack, failing request, env                                   | DRIFT                    | Env details missing from viewer header (VIEW-02/27).                                     |

## App-only drift

Each APP-ONLY row in the area tables is either removed or gated behind a flag in `apps/web/src/lib/flags.ts` when its area is fixed.
