# Adding a feature — checklist

Run through this before shipping anything new. Most of it is quick to answer; the point is
to make sure the legal posture (see [legal-constraints.md](./legal-constraints.md)) doesn't
quietly regress one feature at a time.

- [ ] **Does it touch a third-party service?** (a lyrics/subtitle provider, a media platform,
      an AI API, anything not purely your own code) → read `legal-constraints.md`'s checklist
      first. Don't add a new integration without answering: does it have an official API, and
      does it have a compliant path for your use case?
- [ ] **Does it store user data?** → does it go through `owner_token` scoping
      (`get_owned`/`update` in `repository.py`, never a bare lookup by ID)? A new endpoint
      that reads/writes a course must accept the `X-Owner-Token` header and use the scoped
      repository methods.
- [ ] **Is it cacheable?** → cache by a hash of the actual content (text or file), never by
      song/artist/title identity. Check `repository.py`'s `ProcessingCacheRepository` for the
      existing pattern before inventing a new one.
- [ ] **Does it touch course export/import?** → new fields on `Song`/`CourseExport` need to
      be added to both `MediaReferenceExport`/`CourseExport` (backend `models.py`) and the
      frontend `courseApi.ts` types, kept in sync manually (no shared codegen yet). Never add
      a field that would carry media bytes into an export. If it's text sourced from a
      licensed provider, it needs to go through the redaction check in `service.py::export_course`.
- [ ] **Does it add a new media source or a new way to get audio bytes?** → re-read the
      YouTube-audio-download section of `legal-constraints.md` first. The only currently
      compliant source of transcribable audio is a user-uploaded file — a new source needs
      the same "does it have a compliant path" analysis before any code gets written.
- [ ] **Tests.** Backend: `uv run pytest -q` in `backend/`. Frontend: `npx vitest run` in
      `frontend/`, plus `npx vue-tsc --noEmit -p .nuxt/tsconfig.app.json` (run `npx nuxi
      prepare` first if `.nuxt/` doesn't exist yet). Both should stay fully green — if you
      inherit a pre-existing failure, don't feel obligated to fix it as part of an unrelated
      change, but don't add new ones either.
- [ ] **Docs.** If the feature changes anything described in `docs/product-architecture.md`
      or this `context/` directory, update them in the same change — they drift fast
      otherwise, and the next agent/dev to touch this code will trust what's written here.
