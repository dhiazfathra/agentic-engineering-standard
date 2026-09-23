# ADR-0001: The server owns media keys, one blob per Rewind

## Status

Accepted.

## Date

2026-09-23

## Context

Clients upload media straight to MinIO with a presigned `PUT`, then post
the Rewind that points at it. The `extension` and `recording-links`
modules will both depend on this contract. If a client chose the object
key, it could point a Rewind at any object in the bucket, and deleting
that Rewind would delete someone else's media.

## Decision

- `POST /api/uploads` takes only a content type from an allowlist
  (`video/webm`, `video/mp4`, `image/png`, `image/jpeg`) and returns a
  key of the form `rewinds/<nanoid>.<ext>`. The content type is signed
  into the URL.
- `mediaKeyPattern` in `packages/schema` is the one definition of that
  shape. `createRewind` rejects any other key.
- `rewinds.mediaKey` is unique. A second Rewind with the same key gets
  409, so deleting a Rewind can only delete its own blob.

## Alternatives Considered

### Client-chosen keys under a prefix

- Pros: the client could name files meaningfully.
- Cons: every check the server skips becomes a way to reach another
  object.
- Rejected.

### Finalize step that moves the object to a server key

- Pros: the server could also verify size and type after upload.
- Cons: a server-side copy, which cannot run from Vercel while MinIO stays
  local (ADR-0011 at the monorepo root).
- Rejected for v1. Revisit with the VPS.

## Consequences

- Changing the key shape means changing `mediaKeyPattern` and migrating
  stored keys. Seed rows use their own fixed keys and are written
  directly, not through the API.
- A presigned `PUT` cannot cap object size. A presigned `POST` policy with
  `content-length-range` replaces it when uploads become public.
- v1 has no auth (spec decision), so any caller can create or delete
  Rewinds. This ADR limits what a delete can reach; it does not add
  access control.
