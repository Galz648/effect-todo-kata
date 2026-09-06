// Stage 4 — the CLI shell.
//
// @effect/cli turns process.argv into Effects. A command handler is just a
// function returning an Effect that needs your services.

import { Args, Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Clock, Console, Context, Data, Effect, Layer, Ref, Schema } from "effect"

// ---------------------------------------------------------------------------
// Domain + error + service (unchanged from Stage 3)
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
// In-memory implementation (unchanged from Stage 3)
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

const todo = Command.make("todo").pipe(Command.withSubcommands([add, list, done]))

const cli = Command.run(todo, { name: "todo", version: "0.0.0" })

// NOTE: in-memory ⇒ state resets every invocation, so `list` is always empty
// across separate runs. Stage 5 swaps in a file-backed Layer.
cli(process.argv).pipe(
  Effect.provide(TodoRepoMemory),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
)
