// Stage 6 — the reasoning payoff.
//
// `scenario` is written against TodoRepo alone. It has no idea whether it is
// talking to memory or a file. We run the identical program twice by handing
// it two different Layers.
//
//   bun run src/scenario.ts

import { NodeContext } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { TodoRepo, TodoRepoFile, TodoRepoMemory } from "./repo"

const scenario = Effect.gen(function* () {
  const repo = yield* TodoRepo
  yield* repo.add("a")
  yield* repo.add("b")
  yield* repo.complete(1)
  return yield* repo.list
})
//    hover scenario: Effect<ReadonlyArray<Todo>, TodoNotFound | FileCorrupt, TodoRepo>

// Backend A: in-memory. Layer<TodoRepo, never, never> — needs nothing.
const memory = TodoRepoMemory

// Backend B: file. TodoRepoFile needs FileSystem; feed NodeContext in.
// Layer.provide (not provideMerge): nothing downstream of `scenario` wants
// FileSystem, so we do not re-export it. Result is also Layer<TodoRepo>.
const file = Layer.provide(TodoRepoFile, NodeContext.layer)

const run = (label: string, layer: Layer.Layer<TodoRepo, unknown>) =>
  scenario.pipe(
    Effect.provide(layer),
    Effect.tap((todos) => Effect.sync(() => console.log(label, todos))),
    Effect.catchAll((e) => Effect.sync(() => console.error(label, "failed:", e))),
  )

Effect.runPromise(
  Effect.all([run("memory:", memory), run("file:  ", file)], { discard: true }),
)
