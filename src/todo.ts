// Stage 6 — the CLI. Written against TodoRepo only; the backend is decided
// entirely by MainLayer at the bottom.

import { Args, Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer } from "effect"
import { type Todo, TodoRepo, TodoRepoFile } from "./repo"

const render = (t: Todo) => `${t.done ? "x" : " "} #${t.id}  ${t.text}`

const add = Command.make(
  "add",
  { text: Args.text({ name: "text" }) },
  ({ text }) =>
    Effect.gen(function* () {
      const repo = yield* TodoRepo
      const todo = yield* repo.add(text)
      yield* Console.log(`added #${todo.id}`)
    }),
)

const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const repo = yield* TodoRepo
    const todos = yield* repo.list
    if (todos.length === 0) {
      yield* Console.log("(no todos)")
    } else {
      yield* Effect.forEach(todos, (t) => Console.log(render(t)), { discard: true })
    }
  }),
)

const done = Command.make(
  "done",
  { id: Args.integer({ name: "id" }) },
  ({ id }) =>
    Effect.gen(function* () {
      const repo = yield* TodoRepo
      yield* repo
        .complete(id)
        .pipe(Effect.catchTag("TodoNotFound", (e) => Console.log(`no todo #${e.id}`)))
    }),
)

const rm = Command.make(
  "rm",
  { id: Args.integer({ name: "id" }) },
  ({ id }) =>
    Effect.gen(function* () {
      const repo = yield* TodoRepo
      yield* repo
        .remove(id)
        .pipe(Effect.catchTag("TodoNotFound", (e) => Console.log(`no todo #${e.id}`)))
    }),
)

const root = Command.make("todo").pipe(
  Command.withSubcommands([add, list, done, rm]),
)

const cli = Command.run(root, { name: "todo", version: "1.0.0" })

// The one line that decides everything. Swap TodoRepoFile -> TodoRepoMemory
// (and drop the NodeContext feed for the repo, keeping it for the CLI) to run
// the exact same commands against memory.
const MainLayer = Layer.provideMerge(TodoRepoFile, NodeContext.layer)

cli(process.argv).pipe(
  // any FileCorrupt that a handler didn't deal with: print it, fail non-zero.
  Effect.catchTag("FileCorrupt", (e) =>
    Console.error(`corrupt todo file: ${e.reason}`).pipe(Effect.zipRight(Effect.fail(e))),
  ),
  Effect.provide(MainLayer),
  NodeRuntime.runMain,
)
