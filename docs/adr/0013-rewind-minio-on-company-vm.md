# ADR-0013: Rewind's production MinIO runs on the evoucher VM behind nginx; functions run in hnd1

## Status

Accepted. Supersedes ADR-0011.

## Date

2026-09-30

## Context

ADR-0011 kept MinIO on the dev machine for v1, so production could sign
URLs but not serve media: `/api/health` reported `"storage":"unreachable"`
and anyone but the developer got broken images (`examples/rewind/DEFERRED.md`
D1). `examples/rewind/docs/minio-vps-plan.md` proposed a VPS with Caddy.

The dev machine turned out to be the company VM `evoucher`, already public
at 103.177.56.120 and already serving `https://bugrail.dermaesthetics.id`
through nginx and certbot on 80/443. The infra team gave Rewind the
subdomain `cdn-rewind.dermaesthetics.id` on the same IP.

A Vercel page is HTTPS, so browsers block `http://` media as mixed
content: MinIO must be reached over TLS, not on a bare port.

The Vercel project ran functions in `iad1` (US East) while Turso is in
`aws-ap-northeast-1` (Tokyo) and MinIO is in Indonesia, so every request
crossed the Pacific.

## Decision

- MinIO keeps running on the evoucher VM as a native binary under PM2
  (`~/minio/start.sh`). nginx serves `cdn-rewind.dermaesthetics.id` on 443
  with a certbot certificate and proxies to `127.0.0.1:9000`, next to the
  bugrail site; the MinIO console stays on `127.0.0.1:9001`.
- The nginx site passes `Host` through unchanged (presigned URLs sign it),
  disables request buffering, and has no body size limit.
- Vercel production `S3_ENDPOINT` is `https://cdn-rewind.dermaesthetics.id`.
  CORS allows `https://rewind-ecru.vercel.app` (`MINIO_API_CORS_ALLOW_ORIGIN`
  in `start.sh`).
- The Vercel project's function region is `hnd1` (Tokyo), next to Turso.
  Database calls outnumber server-side storage calls, and browsers upload
  to MinIO directly.

## Alternatives Considered

### A separate VPS with Caddy, as the plan proposed

- Pros: isolates Rewind from other company sites.
- Cons: a new machine to pay for and run, when an approved public host
  with TLS tooling already exists; Caddy would fight nginx for 443 on
  this VM.
- Rejected: the VM and domain were available the same day.

### Expose MinIO on plain `http://…:9000`

- Pros: no proxy.
- Cons: mixed-content blocking breaks every browser upload and playback
  from the HTTPS site; no TLS for credentials-signed URLs.
- Rejected: does not work from the production page.

### Functions in `sin1` (Singapore), nearest to Indonesia

- Pros: closest to MinIO and to the users.
- Cons: every database query crosses Singapore to Tokyo; requests make
  several queries and at most a few storage calls.
- Rejected: `hnd1` measured `/api/health` at about 0.3–0.7 s from
  Indonesia, against 0.6–2.0 s on `iad1`.

## Consequences

- Production media works for everyone; `/api/health` reports
  `{"database":"ok","storage":"ok"}`.
- Rewind's media now shares a VM with bugrail. Load or outages on one
  affect the other, and nginx changes on the VM need `nginx -t` first.
- The certificate renews through certbot's timer (the first one expires
  2026-12-29). If media ever fails TLS, check `sudo certbot renew --dry-run`.
- Port 9000 was opened publicly during setup; it is no longer needed and
  should be closed (MinIO bound back to `127.0.0.1:9000`, ufw rule
  removed, upstream firewall rule removed by infra).
- Anything on the VM is outside this repo: `~/minio/start.sh` and
  `/etc/nginx/sites-available/cdn-rewind.dermaesthetics.id` are the source
  of truth for the running setup.
