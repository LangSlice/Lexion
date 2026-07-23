# context/

Start here if you're an agent or developer picking up work on Lexion for the first time.
This directory is the onboarding path — read these before touching code, in this order:

1. **[legal-constraints.md](./legal-constraints.md)** — the legal/IP principles this project
   is built around, the decisions already made (and why), and a checklist to run before
   adding any integration with a third-party service. This is the single most important
   document in this repo: most of the "why does the code do it this weird way" questions are
   answered here.
2. **[system-map.md](./system-map.md)** — where things live: backend layers, frontend layers,
   the data model, the endpoint list.
3. **[adding-a-feature.md](./adding-a-feature.md)** — a short checklist to run through before
   shipping any new feature.
4. **[../docs/product-architecture.md](../docs/product-architecture.md)** — the detailed
   technical reference: exact file paths, function names, request/response shapes. Go here
   once you know *where* you're working and need the specifics.

## Why this exists

Lexion is a fork of a private project, specifically prepared for open-source release after a
legal audit found several structural risks in the original (see legal-constraints.md for the
details: a Genius integration that scraped pages instead of using an API, and a YouTube
audio-download path that violated YouTube's Terms of Service). Those were fixed by redesigning
the architecture, not by hiding the problem behind a flag — the fixes are load-bearing, not
optional. Any new feature needs to fit inside that same posture.
