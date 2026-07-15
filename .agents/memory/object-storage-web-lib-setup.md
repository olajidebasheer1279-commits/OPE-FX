---
name: object-storage-web lib project references
description: TS project-reference build error when adding lib/object-storage-web (or any new workspace lib) as a referenced project from an artifact's tsconfig.
---

When a workspace lib package (e.g. `lib/object-storage-web`) is added as a TS project reference from an artifact's `tsconfig.json` (via `references`), its own `tsconfig.json` must set `"composite": true` (plus `declarationMap`/`emitDeclarationOnly`, matching sibling libs like `lib/db`, `lib/api-client-react`). Without it, referencing tsconfig throws `TS6306: Referenced project must have setting "composite": true`.

**Why:** TS project references require every referenced project to be composite so incremental builds can find its `.d.ts` output. New libs copied from skill templates often ship a plain (non-composite) tsconfig.

**How to apply:** After scaffolding a new lib package and wiring it into other tsconfigs' `references`, immediately check/set `composite: true` on the new lib's tsconfig, then run `pnpm --filter <lib> exec tsc -b` once to produce the `dist/*.d.ts` output before typechecking dependents (otherwise you'll hit `TS6305: Output file ... has not been built from source`).
