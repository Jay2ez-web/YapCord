# Release workflow

The `Draft tagged release` GitHub Actions workflow runs when a version tag matching `v*` is pushed. It creates a draft GitHub Release with generated notes; it does not build, upload, or publish binaries.

Suggested tag pattern once the updater and release build are ready:

- Stable: `v1.2.3`
- Beta: `v1.2.3-beta.1`
- Preview: `v1.2.3-preview.1`

Do not publish an installer or enable automatic updates until the updater client, update-feed format, and trusted update-signing process have been implemented and tested. The current YapCord 1.0 installer is unsigned and is not part of this repository.
