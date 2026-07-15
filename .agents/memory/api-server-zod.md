---
name: api-server zod imports
description: Why bare "zod" imports fail in api-server and how to fix it
---

The api-server uses esbuild to bundle everything into a single dist/index.mjs. Bare module imports like `import { z } from "zod"` only work if zod is listed in the package's own `dependencies` in `artifacts/api-server/package.json`. 

**Why:** The other routes don't import zod directly — they import schemas from `@workspace/api-zod` (the codegen output) which itself bundles zod. The api-server build does not hoist workspace peer dependencies.

**How to apply:** If a new route needs inline zod validation, either:
1. Add `"zod": "catalog:"` to `artifacts/api-server/package.json` dependencies and run `pnpm install`, or
2. Use `@workspace/api-zod` generated schemas (preferred for OpenAPI-documented endpoints), or
3. Do manual validation without importing zod.
