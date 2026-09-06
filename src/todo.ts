// Stage 5 — a real Layer that depends on other services.
//
// TodoRepoFile is built inside an Effect that yields FileSystem and Config,
// so the Layer *carries those as requirements*. Effect wires the graph and
// type-checks it: remove the NodeContext feed below and this file won't compile.

import { Args, Command } from "@effect/cli"
import { FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Clock, Config, Console, Context, Data, Effect, Layer, Ref, Schema } from "effect"

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

const Todo = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.Number,
})
type Todo = Schema.Schema.Type<typeof Todo>

const Todos = Schema.Array(Todo)

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class TodoNotFound extends Data.TaggedError("TodoNotFound")<{
  readonly id: number
}> {}

class FileCorrupt extends Data.TaggedError("FileCorrupt")<{
  readonly reason: string
}> {}

// ---------------------------------------------------------------------------
// Service — note the error slots now include FileCorrupt
// ---------------------------------------------------------------------------

class TodoRepo extends Context.Tag("TodoRepo")<
  TodoRepo,
  {
    readonly list: Effect.Effect<ReadonlyArray<Todo>, FileCorrupt>
    readonly add: (text: string) => Effect.Effect<Todo, FileCorrupt>
    readonly complete: (id: number) => Effect.Effect<void, TodoNotFound | FileCorrupt>
    readonly remove: (id: number) => Effect.Effect<void, TodoNotFound | FileCorrupt>
  }
>() {}

const findOrFail = (todos: ReadonlyArray<Todo>, id: number) =>
  todos.some((t) => t.id === id)
    ? Effect.void
    : Effect.fail(new TodoNotFound({ id }))

// ---------------------------------------------------------------------------
// Implementation 1: in-memory (kept for comparison / Stage 6)
// ---------------------------------------------------------------------------

const TodoRepoMemory = Layer.effect(
  TodoRepo,
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<Todo>>([])
    const nextId = yield* Ref.make(1)
    return TodoRepo.of({
      list: Ref.get(store),
      add: (text) =>
        Effect.gen(function* () {
          const id = yield* Ref.getAndUpdate(nextId, (n) => n + 1)
          const now = yield* Clock.currentTimeMillis
          const todo: Todo = { id, text, done: false, createdAt: now }
          yield* Ref.update(store, (todos) => [...todos, todo])
          return todo
        }),
      complete: (id) =>
        Effect.gen(function* () {
          const todos = yield* Ref.get(store)
          yield* findOrFail(todos, id)
          yield* Ref.set(store, todos.map((t) => (t.id === id ? { ...t, done: true } : t)))
        }),
      remove: (id) =>
        Effect.gen(function* () {
          const todos = yield* Ref.get(store)
          yield* findOrFail(todos, id)
          yield* Ref.set(store, todos.filter((t) => t.id !== id))
        }),
    })
  }),
)

// ---------------------------------------------------------------------------
// Implementation 2: JSON file — depends on FileSystem + Config
// ---------------------------------------------------------------------------

const TodoRepoFile = Layer.effect(
  TodoRepo,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Config.string("TODO_PATH").pipe(
      Config.withDefault("todos.json"),
    )

    const corrupt = (reason: unknown) =>
      new FileCorrupt({ reason: String(reason) })

    const readAll: Effect.Effect<ReadonlyArray<Todo>, FileCorrupt> = Effect.gen(
      function* () {
        const exists = yield* fs.exists(path).pipe(Effect.mapError(corrupt))
        if (!exists) return []
        const raw = yield* fs.readFileString(path).pipe(Effect.mapError(corrupt))
        const json = yield* Effect.try({
          try: () => JSON.parse(raw) as unknown,
          catch: (e) => corrupt(`not JSON: ${e}`),
        })
        return yield* Schema.decodeUnknown(Todos)(json).pipe(
          Effect.mapError((e) => corrupt(e.message)),
        )
      },
    )

    const writeAll = (todos: ReadonlyArray<Todo>) =>
      fs
        .writeFileString(path, JSON.stringify(todos, null, 2))
        .pipe(Effect.mapError(corrupt))

    return TodoRepo.of({
      list: readAll,
      add: (text) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis
          const todos = yield* readAll
          const id = todos.reduce((m, t) => Math.max(m, t.id), 0) + 1
          const todo: Todo = { id, text, done: false, createdAt: now }
          yield* writeAll([...todos, todo])
          return todo
        }),
      complete: (id) =>
        Effect.gen(function* () {
          const todos = yield* readAll
          yield* findOrFail(todos, id)
          yield* writeAll(todos.map((t) => (t.id === id ? { ...t, done: true } : t)))
        }),
      remove: (id) =>
        Effect.gen(function* () {
          const todos = yield* readAll
          yield* findOrFail(todos, id)
          yield* writeAll(todos.filter((t) => t.id !== id))
        }),
    })
  }),
)

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

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

const todo = Command.make("todo").pipe(
  Command.withSubcommands([add, list, done, rm]),
)

const cli = Command.run(todo, { name: "todo", version: "1.0.0" })

// ---------------------------------------------------------------------------
// Wiring — swap TodoRepoFile <-> TodoRepoMemory on this one line.
// provideMerge: feed NodeContext into TodoRepoFile's requirements AND keep
// NodeContext in the output (the CLI still needs Terminal / Path).
// ---------------------------------------------------------------------------

const MainLayer = Layer.provideMerge(TodoRepoFile, NodeContext.layer)

cli(process.argv).pipe(Effect.provide(MainLayer), NodeRuntime.runMain)
