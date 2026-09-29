# Plan: MinIO on a VPS for production media

Status: proposed. Unblocks D1 in `DEFERRED.md`.

## Problem

Production media URLs point at the dev PC:

```
http://localhost:9000/rewind/rewinds/<id>.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&...
```

`apps/web/src/lib/storage.ts` signs URLs against `S3_ENDPOINT`, and Vercel's
`S3_ENDPOINT` is `http://localhost:9000`. On anyone else's machine that host
is their own laptop, so every image and video 404s or fails, and
`/api/health` reports `"storage":"unreachable"`.

The fix is config only: run MinIO on a public host with HTTPS and point
`S3_ENDPOINT` at it. No code change is needed.

## What the app needs from storage

Read from the code, so the setup matches it:

| Need                                        | Source                                   | Consequence for the VPS                                                                                                                  |
| ------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Path-style URLs (`https://host/rewind/key`) | `forcePathStyle: true` in `storage.ts`   | One hostname, no wildcard DNS or wildcard cert.                                                                                          |
| Region `us-east-1`                          | `storage.ts`                             | Leave MinIO's default region.                                                                                                            |
| Presigned GET (1 h) and PUT (15 min)        | `mediaUrl`, `presignPut`                 | The signature covers the `Host` header. The proxy must pass `Host` through unchanged, and `S3_ENDPOINT` must be the exact public origin. |
| `HeadBucket`                                | `/api/health`                            | App user needs `s3:ListBucket` on the bucket.                                                                                            |
| `GetObject`, `PutObject`, `DeleteObject`    | `storage.ts`, `DELETE /api/rewinds/[id]` | App user needs these on `rewind/*`, nothing else.                                                                                        |
| Browser PUT from the web app (avatar, logo) | `/api/me/avatar`, `/api/workspace/logo`  | CORS must allow `https://rewind-ecru.vercel.app`.                                                                                        |
| Extension PUT                               | extension upload                         | No CORS entry: `host_permissions: ["<all_urls>"]` exempts it.                                                                            |
| HTTPS                                       | Vercel page is HTTPS                     | Plain `http://` media is blocked as mixed content. TLS is required.                                                                      |

## Target

```
browser / extension ──HTTPS──▶ s3.<domain> :443 ─▶ Caddy ─▶ minio:9000 (docker, loopback only)
Vercel functions ─────HTTPS──▶ s3.<domain> (HeadBucket, DeleteObject, signing is local)
admin ──SSH tunnel──▶ 127.0.0.1:9001 (MinIO console, never public)
```

## Steps

### 1. VPS and DNS

- Any 1 vCPU / 1–2 GB Linux VPS with a disk sized for media (Hetzner CX22,
  DigitalOcean, Vultr, or a company VM with a public IP). Ubuntu 24.04 LTS.
- Create an `A` record `s3.<domain>` pointing at the VPS IP. (`AAAA` too if
  it has IPv6.)
- Firewall: allow 22 (SSH, keys only), 80 (ACME challenge), 443. Block
  everything else, including 9000 and 9001.

```sh
ufw default deny incoming
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw enable
```

Set `PasswordAuthentication no` in `/etc/ssh/sshd_config`, then install
Docker (`curl -fsSL https://get.docker.com | sh`).

### 2. Compose file on the VPS

`/opt/rewind-s3/docker-compose.yml`, the same pinned image as the local
`docker-compose.yml`:

```yaml
services:
  minio:
    image: quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z
    command: server /data --console-address :9001
    restart: unless-stopped
    ports:
      - "127.0.0.1:9001:9001" # console, reach it through an SSH tunnel only
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_SERVER_URL: https://s3.<domain>
      MINIO_API_CORS_ALLOW_ORIGIN: https://rewind-ecru.vercel.app
    volumes:
      - /srv/minio:/data
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:9000/minio/health/live"]
      interval: 10s
      retries: 5

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on: [minio]

volumes:
  caddy-data:
```

`/opt/rewind-s3/Caddyfile` (Caddy gets and renews the Let's Encrypt cert,
and keeps the `Host` header by default, so signatures stay valid):

```
s3.<domain> {
  request_body {
    max_size 500MB
  }
  reverse_proxy minio:9000
}
```

`/opt/rewind-s3/.env` (mode `600`, never committed):

```sh
MINIO_ROOT_USER=admin-$(openssl rand -hex 4)
MINIO_ROOT_PASSWORD=$(openssl rand -base64 36)
```

Write the generated values into the file, not the `$(...)` text. Keep the
root credentials in a password manager. The app never gets them.

```sh
cd /opt/rewind-s3 && docker compose up -d
curl -fsS https://s3.<domain>/minio/health/live && echo ok
```

### 3. Bucket, private policy and a least-privilege app user

Run `mc` from the VPS (the root credentials stay on the box):

```sh
docker compose exec minio sh -c '
  mc alias set prod http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" &&
  mc mb --ignore-existing prod/rewind &&
  mc anonymous set none prod/rewind'
```

The bucket stays private. Every read goes through a presigned URL.

App policy `rewind-app.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::rewind"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::rewind/*"]
    }
  ]
}
```

```sh
docker compose cp rewind-app.json minio:/tmp/rewind-app.json
docker compose exec minio sh -c '
  APP_SECRET=$(head -c 30 /dev/urandom | base64 | tr -d "/+=") &&
  mc admin user add prod rewind-app "$APP_SECRET" &&
  mc admin policy create prod rewind-app /tmp/rewind-app.json &&
  mc admin policy attach prod rewind-app --user rewind-app &&
  echo "S3_SECRET_KEY=$APP_SECRET"'
```

Copy the printed secret straight into Vercel in step 4, then clear the
terminal scrollback.

### 4. Point Vercel at it

From `examples/rewind/apps/web`, replacing each production value (use
`vercel env rm <NAME> production` first where one exists):

```sh
vercel env add S3_ENDPOINT production    # https://s3.<domain>
vercel env add S3_BUCKET production      # rewind
vercel env add S3_ACCESS_KEY production  # rewind-app
vercel env add S3_SECRET_KEY production  # secret from step 3
```

Then `vercel deploy --prod` from the monorepo root. Env changes only apply
to new deployments.

### 5. Verify

Each check must pass before D1 is closed. Record the output in
`docs/evidence/`.

1. `curl -s https://rewind-ecru.vercel.app/api/health` returns
   `{"database":"ok","storage":"ok"}`.
2. Upload a rewind from the extension against prod. The library thumbnail
   and viewer media load, and the media URL starts with
   `https://s3.<domain>/rewind/` and carries `X-Amz-Expires=3600`.
3. `curl -I https://s3.<domain>/rewind/<key>` without a signature returns
   `403`. The bucket is not public.
4. The same presigned URL with one character of `X-Amz-Signature` changed
   returns `403`.
5. Change avatar in settings on prod. The browser PUT succeeds, with no
   CORS error in the console.
6. Delete a rewind on prod. `mc ls prod/rewind/rewinds/` no longer lists its key.
7. From outside the VPS, `nc -zv <vps-ip> 9000` and `9001` fail.

### 6. Operations

- **Backups:** nightly `mc mirror --overwrite prod/rewind <offsite>/rewind`
  to a second provider, or at least a VPS disk snapshot. Media without a
  backup is one disk failure away from gone.
- **Updates:** pin image tags. Bump MinIO and Caddy on purpose, run step 5
  checks after.
- **Monitoring:** an uptime check on `https://s3.<domain>/minio/health/live`
  and on `/api/health`.
- **Disk:** alert at 80 % of `/srv/minio`. Nothing deletes orphaned uploads
  yet.
- **Key rotation:** add a new user with the same policy, swap the Vercel
  env, redeploy, then `mc admin user remove prod rewind-app`.

## Known limits

- Presigned PUT cannot cap size (see the `debt:` note in `storage.ts`).
  Caddy's `max_size 500MB` is the only cap until uploads move to presigned
  POST with `content-length-range`.
- A single VPS is a single point of failure. Fine for this example; move to
  managed S3/R2 or a distributed MinIO when uptime matters.

## After it works

- Update the production column in `docs/STACK.md` and `SPEC-infra.md`
  (`S3_ENDPOINT` row still says "MinIO stays on this PC").
- Close D1 in `DEFERRED.md` and link the evidence.
- Remove the `ponytail:` root-user note in `docker-compose.yml`, or point it
  here.
