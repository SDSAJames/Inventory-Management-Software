# Release workflow

For every completed code update, update the application version, release notes, and affected documentation in the same change, as requested by the user.

- Use a patch increment for fixes and UI refinements; use a minor increment for additive features.
- Set the version in `package.json`. Add a dated entry to `src/data/patchHistory.js` describing the completed changes. Keep previous release versions and notes unchanged; only the newest entry uses `APP_VERSION`.
- Update the relevant behavior in `README.md`, `Software Design Document.md`, and `Technical Specification.md` where applicable. Avoid copying implementation details into every document.
- Run `npm run docs:sync` to synchronize package-lock metadata, document versions and release dates, and generated `PATCH_NOTES.md`.
- Run the checks appropriate to the code change and `npm run build`. For documentation-only updates, verify release synchronization and the build.
- Use the user's current local date for release entries. Do not modify stored database records as part of release documentation work.
