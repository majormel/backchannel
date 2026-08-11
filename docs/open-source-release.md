# Open-Source Release Checklist

Publish Backchannel from a clean, reviewed snapshot. Do not change an older private repository to public when its history, pull requests, workflow logs, releases, or deleted branches may contain private material.

Do not zip or upload a development checkout. Ignored files remain on disk and are not made safe by `.gitignore`; export only reviewed tracked content from the clean repository.

## Prepare the Snapshot

1. Create a new repository from the intended release tree with no inherited private history.
2. Review every tracked path with `git ls-files`.
3. Confirm that only synthetic captures and fixtures are present.
4. Inspect the archive itself with `git archive --format=tar HEAD | tar -tf -`.
5. Build fresh distributions in a temporary directory and inspect their file lists. Never upload every file from a reused local `dist/` directory.
6. Use a GitHub no-reply commit address or another identity you intend to publish.

Do not publish local captures, SQLite databases, HAR files, packet captures, certificates, private keys, mobile profiles, `.env` files, decoder artifacts, screenshots with tokens, editor state, assistant transcripts, internal plans, or generated research output.

## Verify the Tree

Run:

```bash
gitleaks git --redact
uv lock --check
uv sync --extra dev
uv run pytest -q

uv export --python 3.13 --no-dev --no-emit-project --no-hashes --format requirements-txt |
  uvx pip-audit -r /dev/stdin --no-deps --disable-pip --progress-spinner off

cd dashboard
npm ci
npm test -- --run
npx tsc --noEmit
npm run build
npm audit --audit-level=high
cd ..
```

Gitleaks supplements manual review; it does not prove that a repository contains no personal data or proprietary traffic. Search explicitly for home-directory paths, email addresses, private host names, device identifiers, tokens, cookies, and captured payloads.

CI audits the resolved Python dependencies without vulnerability exclusions. The root uv configuration selects patched transitive versions constrained by mitmproxy 12.2.3, so installation and verification must use `uv sync` or `uv run`.

Version 0.1.0 is a source-only release. Install and run it with uv so the reviewed lock and the mitmproxy 12.2.3 security overrides are applied. Do not publish the wheel or source distribution to PyPI until mitmproxy metadata permits the fixed transitive versions without uv overrides.

Build validation artifacts in a fresh temporary directory:

```bash
backchannel_release_dir="$(mktemp -d)"
uv build --out-dir "$backchannel_release_dir"
uvx twine check "$backchannel_release_dir"/*
```

## Create the Clean Repository

After the release candidate is committed and verified, export the tracked tree and initialize new history:

```bash
backchannel_snapshot_dir="$(mktemp -d)"
git archive --format=tar HEAD | tar -xf - -C "$backchannel_snapshot_dir"
cd "$backchannel_snapshot_dir"
git init -b main
git add -A
git diff --cached --check
git commit -m "Initial public release"
gitleaks git --redact
```

Create the destination GitHub repository as private first. If the intended public name is occupied by the private development repository, rename the private repository before creating the clean destination. Push only this new `main` branch, configure the repository security settings, verify CI, and then change its visibility to public. Do not copy branches, tags, pull requests, Actions logs, or the `.git` directory from the private development repository.

## Configure the Public Repository

- enable branch protection and required CI checks
- enable private vulnerability reporting before announcing the project
- enable GitHub secret scanning and push protection when available
- review Actions logs and permissions
- publish signed tags or release attestations when the release process supports them
- verify project links, license metadata, package contents, and maintainer contact paths

If a secret reaches any Git object or published artifact, rotate it first. History rewriting alone does not invalidate the credential or remove copies from clones and caches.
