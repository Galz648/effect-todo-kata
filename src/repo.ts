// Stage 6 — the repo, split out so both the CLI (todo.ts) and a plain
// script (scenario.ts) can wire it up differently.
//
// Nothing here runs. It is domain + errors + the service + two Layers.

import { FileSystem } from "@effect/platform"
import { Clock, Config, Context, Data, Effect, Layer, Ref, Schema } from "effect"

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export const Todo = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.Number,
})
export type Todo = Schema.Schema.Type<typeof Todo>

const Todos = Schema.Array(Todo)

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TodoNotFound extends Data.TaggedError("TodoNotFound")<{
  readonly id: number
}> {}

export class FileCorrupt extends Data.TaggedError("FileCorrupt")<{
  readonly reason: string
}> {}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TodoRepo extends Context.Tag("TodoRepo")<
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
// Layer: in-memory (Ref-backed, no IO, no requirements)
// ---------------------------------------------------------------------------

export const TodoRepoMemory = Layer.effect(
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
// Layer: JSON file — REQUIRES FileSystem (and reads Config)
// ---------------------------------------------------------------------------

export const TodoRepoFile = Layer.effect(
  TodoRepo,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Config.string("TODO_PATH").pipe(
      Config.withDefault("todos.json"),
    )

    const corrupt = (reason: unknown) => new FileCorrupt({ reason: String(reason) })

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
