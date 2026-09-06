// Stage 3 — first implementation: an in-memory Layer.
//
// Layer  = a recipe for building a service.
// Ref    = Effect's mutable cell.
// provide = discharge an R requirement.

import { Clock, Console, Context, Data, Effect, Layer, Ref, Schema } from "effect"

// ---------------------------------------------------------------------------
// Domain + error + service (unchanged from Stage 2)
// ---------------------------------------------------------------------------

const Todo = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  done: Schema.Boolean,
  createdAt: Schema.Number,
})
type Todo = Schema.Schema.Type<typeof Todo>

class TodoNotFound extends Data.TaggedError("TodoNotFound")<{
  readonly id: number
}> {}

class TodoRepo extends Context.Tag("TodoRepo")<
  TodoRepo,
  {
    readonly list: Effect.Effect<ReadonlyArray<Todo>>
    readonly add: (text: string) => Effect.Effect<Todo>
    readonly complete: (id: number) => Effect.Effect<void, TodoNotFound>
    readonly remove: (id: number) => Effect.Effect<void, TodoNotFound>
  }
>() {}

// ---------------------------------------------------------------------------
// Implementation: in-memory, backed by two Refs
// ---------------------------------------------------------------------------

const TodoRepoMemory = Layer.effect(
  TodoRepo,
  Effect.gen(function* () {
    const store = yield* Ref.make<ReadonlyArray<Todo>>([])
    const nextId = yield* Ref.make(1)

    const findOrFail = (todos: ReadonlyArray<Todo>, id: number) =>
      todos.some((t) => t.id === id)
        ? Effect.void
        : Effect.fail(new TodoNotFound({ id }))

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
          yield* Ref.set(
            store,
            todos.map((t) => (t.id === id ? { ...t, done: true } : t)),
          )
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const todos = yield* Ref.get(store)
          yield* findOrFail(todos, id)
          yield* Ref.set(
            store,
            todos.filter((t) => t.id !== id),
          )
        }),
    })
  }),
)

// ---------------------------------------------------------------------------
// Run a program against the Layer
// ---------------------------------------------------------------------------

const demo = Effect.gen(function* () {
  const repo = yield* TodoRepo
  yield* repo.add("a")
  yield* repo.add("b")
  yield* repo.complete(1)

  // not-found path, recovered — E goes from TodoNotFound to never:
  yield* repo
    .complete(99)
    .pipe(Effect.catchTag("TodoNotFound", (e) => Console.log(`no todo #${e.id}`)))

  return yield* repo.list
})

// Effect.provide closes the R gap; now it runs.
Effect.runPromise(demo.pipe(Effect.provide(TodoRepoMemory))).then((todos) => {
  console.log(todos)
})

export { Todo, TodoNotFound, TodoRepo, TodoRepoMemory }
