# Signed update releases

The current client accepts only published stable releases with tags of the form `vMAJOR.MINOR.PATCH`. A release is considered an update only when all of the following are true: the release is newer than the running app, its tag and stable channel agree, it has the expected `YapCord1.0.exe` asset, and both `update.json` and `update.json.sig` verify with the public key embedded in the client. The signed manifest binds the app ID, version, tag, channel, asset name, exact size, and SHA-256 digest.

## First release checklist

1. Bump `package.json` and the installer metadata to the same higher version.
2. Build and test `YapCord1.0.exe` from the source.
3. Push the matching version tag. `Draft tagged release` creates a draft only.
4. Upload `YapCord1.0.exe` to the draft.
5. Run `Verify YapCord update-signing key` once from `main` to confirm the environment-scoped secret matches `src/main/update-public.pem`; the secret is never printed.
6. Run `Sign YapCord update manifest` from `main` with the tag. The signing job uses the `update-signing` environment, accepts only a stable draft without existing signed assets, and verifies its result both locally and from GitHub.
7. Inspect the draft's three assets, then run `Publish verified YapCord release`. The separate workflow validates the files again immediately before publication.

The app never embeds or downloads the private key. It does not install automatically: after the signature and download hash checks pass, the user still chooses **Install and restart**.

No published GitHub Release currently exists, so there is no public update for clients to download. The `update-signing` environment currently has no required-reviewer rule; only a manually dispatched workflow on `main` can use its secret. Add required reviewers in GitHub's environment settings if signing runs should require an additional human approval. Until the first installer is uploaded, signed, and published through the sequence above, the client must not accept the old unsigned `latest.json` feed.
