---
name: Phased build specs
description: How to handle multi-prompt/phased product specs where later features are explicitly deferred.
---

When a user provides a spec broken into ordered phases (e.g. "Prompt #1: Foundation only, do not build Dashboard yet" followed later by "Prompt #2: build Dashboard"), treat each phase's exclusion list as a hard constraint, not a suggestion.

**Why:** Building ahead of the current phase (e.g. fleshing out Trade Log or Analytics while only Dashboard was requested) creates scope the user didn't ask for yet and may conflict with a future prompt's more detailed requirements for that same page.

**How to apply:** Register real routes/nav entries for all pages named in the full spec so the app shell and navigation are complete, but render undeferred pages as clean "coming soon" placeholders inside the real layout (not blank/broken pages, not fake data). Track phase completion in a checklist file (e.g. `PROJECT_PROGRESS.md`) if the spec asks for one.
