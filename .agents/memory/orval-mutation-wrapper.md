---
name: Orval mutation wrapper pattern
description: Orval wraps mutation variables in { data: T } — must be unwrapped when calling mutate()
---

Orval generates mutation hooks where the variable passed to `mutate()` is wrapped: `{ data: BodyType<InputSchema> }` not the plain input object. This is consistent across all generated PATCH/POST mutation hooks.

**Why:** Orval separates the request body (`data`) from potential path/query params in a single variable object, so the generated hook can destructure cleanly.

**How to apply:** Always call `mutation.mutate({ data: { ...fields } })` not `mutation.mutate({ ...fields })` for generated hooks. Also: query hooks use `{ query: { refetchInterval: ... } }` not bare options — the `query` key wraps TanStack Query options.
