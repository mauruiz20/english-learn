Docker Compose and deployment config for the Raspberry Pi 5 (the api only;
the web app is on Cloudflare Pages).

- `compose.yml`: production stack (postgres, migrate, api, cloudflared, backup).
- `compose.test.yml`: layered on `compose.yml` by `test/smoke.sh`, which
  builds the images locally and checks the stack end to end.
- `backup/`: the backup image (nightly `pg_dump`, retention, restore drill).
- `.env.example`: non-secret settings; copy to `.env`.
- `secrets/`: Docker secret files (git-ignored), created on the Pi.

Full procedure, including the secrets: [`docs/deploy.md`](../docs/deploy.md).
