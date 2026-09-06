# Hint — Stage 5: a Layer that depends on other Layers

## Task

Build `TodoRepoFile: Layer<TodoRepo, ..., FileSystem>` — persists to a JSON file,
validates it with `Schema`, takes its path from `Config`. Add a `FileCorrupt`
error. Swap `MainLayer` to use it. Add the `rm <id>` subcommand.

## Reach for

```ts
import { FileSystem } from "@effect/platform"
import { Config, Effect, Layer, Schema } from "effect"

const Todos = Schema.Array(Todo)

class FileCorrupt extends Data.TaggedError("FileCorrupt")<{
  readonly reason: string
}> {}

Layer.effect(TodoRepo, Effect.gen(function* () {
  const fs   = yield* FileSystem.FileSystem
  const path = yield* Config.string("TODO_PATH").pipe(Config.withDefault("todos.json"))
  ...
}))

fs.exists(path): Effect<boolean, PlatformError>
fs.readFileString(path): Effect<string, PlatformError>
fs.writeFileString(path, content): Effect<void, PlatformError>

Schema.decodeUnknown(Todos)(json): Effect<ReadonlyArray<Todo>, ParseError>

Effect.try({ try: () => JSON.parse(raw) as unknown, catch: (e) => new FileCorrupt({...}) })
Effect.mapError(effect, (e) => new FileCorrupt({ reason: String(e) }))

Layer.provideMerge(TodoRepoFile, NodeContext.layer)
```

## Gotchas

- `yield* FileSystem.FileSystem` **inside the Layer's `Effect.gen`** is what makes
  this Layer *depend on* `FileSystem`. Its type gains a requirement in the third
  slot. That is the whole lesson of the stage.
- `Layer.provideMerge(A, B)`: feed `B` into `A`'s requirements **and keep `B`** in
  the output. You need merge (not plain `Layer.provide`) because `@effect/cli`
  still needs `Terminal`/`Path` from `NodeContext` at the edge. Try plain
  `Layer.provide` and read the resulting type error.
- Every `fs.*` call fails with `PlatformError`. `JSON.parse` throws. Decoding
  fails with `ParseError`. Funnel all three into `FileCorrupt` with
  `Effect.mapError` / `Effect.try` so your service's error type stays *yours*.
- Widen the `TodoRepo` interface error slots to include `FileCorrupt`
  (`list: Effect<ReadonlyArray<Todo>, FileCorrupt>`, etc.), then let the compiler
  walk you through the call sites — including the CLI handlers.
- `Config.string("TODO_PATH")` is consumed with `yield*` like an Effect. It is a
  described dependency, not `process.env` access. Test:
  `TODO_PATH=/tmp/t.json bun run src/todo.ts list`.
- `noUncheckedIndexedAccess` is on — `todos[0]` is `Todo | undefined`. Prefer
  `.reduce` / `.some` / `.map` over index access.

## Done when

- `bun run src/todo.ts add "a"` then a **separate** `bun run src/todo.ts list`
  shows `a` — state survives.
- `todos.json` appears and round-trips (delete a required field by hand → next
  command fails with your `corrupt` message, not a stack trace).
- Removing the `NodeContext.layer` feed is a compile error.

Reference: `git diff stage-4 stage-5 -- src`
