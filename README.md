# effect-todo-kata

A staged, branch-per-step kata for getting hands-on with the core
[Effect](https://effect.website) (TypeScript) primitives in a few hours — enough
to start reasoning about Effect on your own.

The vehicle is deliberately boring: a `todo` CLI backed by a single JSON file.
The todo logic stays trivial so that Effect is the only new thing you are
learning at any moment.

## Runtime

Uses **[Bun](https://bun.sh)** — no build step, no `tsx`, no `ts-node`.

```
bun install
bun run src/todo.ts add "buy milk"
bun run typecheck            # tsc --noEmit, the real type check
```

## How the repo is laid out

- `main` — scaffold: this README, `GUIDE.md`, `hints/`, and a `src/todo.ts`
  skeleton. **You work here** (or on a branch off `main`).
- `stage-1` … `stage-6` — cumulative reference solutions. `stage-N` is the
  working app through Stage N of the guide.

You never need to check out a `stage-*` branch to make progress. Use them to
check yourself:

```
git diff main stage-1 -- src        # what Stage 1 introduces
git diff stage-1 stage-2 -- src     # what Stage 2 introduces
git diff HEAD stage-3 -- src        # how far off am I from the Stage 3 reference
```

## The path

| Stage | Theme | New primitives |
|-------|-------|----------------|
| 1 | Effect is a description | `Effect.gen`, `yield*`, the `A / E / R` slots, `Effect.fail`, `Effect.runPromise` |
| 2 | Define a service | `Context.Tag`, `yield* Tag`, `Data.TaggedError` |
| 3 | First implementation | `Layer.effect`, `Ref`, `Effect.provide`, `Clock`, `Effect.catchTag` |
| 4 | The CLI shell | `@effect/cli` (`Command`, `Args`), `NodeContext.layer`, `NodeRuntime.runMain`, `Effect.forEach` |
| 5 | A real, dependent Layer | `FileSystem`, `Schema`, `Config`, `Effect.mapError`, layers that depend on layers |
| 6 | Reason about the swap | `Layer.provide` / `Layer.provideMerge`, `Effect.catchTags`, running one program on two backends |

Full prose in [`GUIDE.md`](./GUIDE.md). Per-stage nudges (signatures + gotchas,
no full solutions) in [`hints/`](./hints).

## Deliberately out of scope

`Schedule` / retries, `Effect.all` concurrency, `Stream`, `Scope` /
`acquireRelease`, `Fiber`, the `Effect.Service` class API, `Runtime`
customization, telemetry. All are easier once the above is reflex.
