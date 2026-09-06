# Hint — Stage 6: reason about the swap

## Task

Write `src/scenario.ts`: one program written against `TodoRepo`, run twice — once
on `TodoRepoMemory`, once on the file backend — proving the program is
backend-agnostic. Tidy the CLI's error edge so the failure type is honest.

## Reach for

```ts
import { Effect, Layer } from "effect"
import { NodeContext } from "@effect/platform-node"

const scenario = Effect.gen(function* () {
  const repo = yield* TodoRepo
  yield* repo.add("a")
  yield* repo.add("b")
  yield* repo.complete(1)
  return yield* repo.list
})

Effect.provide(scenario, TodoRepoMemory)
Effect.provide(scenario, Layer.provide(TodoRepoFile, NodeContext.layer))

Layer.provide(A, B)        // feed B into A; result needs nothing, B NOT re-exported
Layer.provideMerge(A, B)   // feed B into A; result needs nothing, B re-exported

Effect.catchTags(effect, {
  FileCorrupt: (e) => Effect.Effect,
  TodoNotFound: (e) => Effect.Effect,
})
```

## Gotchas

- `Layer.provide` vs `Layer.provideMerge`: in `scenario.ts` you only need
  `TodoRepo`, so plain `Layer.provide(TodoRepoFile, NodeContext.layer)` is right —
  nothing downstream wants `FileSystem`. In `todo.ts` you needed `provideMerge`
  because the CLI still wants `Terminal`. Same wiring, different requirement at
  the edge — make sure you can say why.
- From `scenario`'s point of view, `TodoRepoMemory` and
  `Layer.provide(TodoRepoFile, NodeContext.layer)` have the **same type**:
  `Layer<TodoRepo, never, never>`. Interchangeable. That is the reasoning target
  of the whole kata.
- `scenario.ts` importing from `todo.ts`: either export the pieces from `todo.ts`,
  or (cleaner) split `TodoRepo` + the two Layers into `src/repo.ts` and import
  from both. Your call — note how little moves.
- The `file` run will actually write `todos.json`. Point it elsewhere with
  `Config` / env, or `rm` it after.
- Error edge: decide between (a) `Effect.catchTags` at the root command mapping
  each tagged error to a message + `Effect.fail` (non-zero exit), or (b) trusting
  `NodeRuntime.runMain`'s default rendering. Either is fine — the requirement is
  that the command's `E` type names exactly what can go wrong, no `any`, no
  swallowed errors.

## Done when

- `bun run src/scenario.ts` prints the same array of todos for both `memory:` and
  `file:` lines.
- You can explain, without running it, what `Effect.provide(scenario, X)` needs
  `X` to be.
- `bun run typecheck` is clean and no command handler has a stray `any` or an
  unhandled tagged error.

Reference: `git diff stage-5 stage-6 -- src`
