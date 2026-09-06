# The guide

Six stages. Each adds **one or two primitives**. The todo logic stays trivial on
purpose — Effect is the only thing you are actually learning.

Work on `main` (or a branch off it). After each stage, sanity-check against the
reference branch:

```
git diff main   stage-1 -- src
git diff stage-1 stage-2 -- src
git diff HEAD    stage-3 -- src     # "how far am I from the Stage 3 answer"
```

Runtime is **Bun**: `bun run src/todo.ts …`. Real type errors come from
`bun run typecheck` (Bun itself does not type-check).

---

## Stage 1 — an Effect is a description, not a running thing

**Goal:** internalise that `Effect<A, E, R>` is a *value* describing a program.
`A` = success type, `E` = error type, `R` = required services. Nothing runs until
you hand it to a runtime.

```ts
import { Console, Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Console.log("hello")
  return 42
})

Effect.runPromise(program).then(console.log) // logs "hello", then 42
```

**Notice**

- `program` is just a value. Move the `runPromise` line away and nothing logs.
- `yield*` pulls the success value out of an Effect inside `Effect.gen`.
- `Console.log` is itself an `Effect<void>` — not a side effect you fire directly.

**Play:** add `const boom = Effect.fail("nope")`. Hover it — `E` is now `string`.
`Effect.runPromise(boom)` rejects. Then try
`boom.pipe(Effect.catchAll((e) => Console.log(\`caught ${e}\`)))` and watch `E`
collapse to `never`.

Primitives: `Effect.gen`, `yield*`, `Effect.fail`, `Effect.runPromise`, the three
type slots.

---

## Stage 2 — define the service (no implementation yet)

**Goal:** a service is *an interface plus a token to look it up by*. You can write
code against it before any implementation exists.

```ts
import { Context, Data, Effect, Schema } from "effect"

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
```

Now write something that *uses* it:

```ts
const addTwo = Effect.gen(function* () {
  const repo = yield* TodoRepo          // pull the service out of context
  yield* repo.add("a")
  yield* repo.add("b")
  return yield* repo.list
})
```

**Notice**

- Hover `addTwo`: type is `Effect<ReadonlyArray<Todo>, never, TodoRepo>`. The `R`
  slot now says "needs TodoRepo".
- `Effect.runPromise(addTwo)` **does not compile** — unmet requirement. That gap
  is what a `Layer` fills in Stage 3.
- `TodoNotFound` lives in the *error* slot of `complete`. It is checked. You
  cannot forget to handle it.

Primitives: `Context.Tag`, `yield* Tag`, `Data.TaggedError`,
`Schema.Schema.Type`.

---

## Stage 3 — first implementation: an in-memory Layer

**Goal:** `Layer` = a recipe for building a service. `Ref` = Effect's mutable
cell. `Effect.provide` = discharge a requirement.

```ts
import { Clock, Effect, Layer, Ref } from "effect"

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
          if (!todos.some((t) => t.id === id)) {
            return yield* Effect.fail(new TodoNotFound({ id }))
          }
          yield* Ref.set(
            store,
            todos.map((t) => (t.id === id ? { ...t, done: true } : t)),
          )
        }),

      remove: (id) => Effect.gen(function* () { /* same shape as complete */ }),
    })
  }),
)
```

Run Stage 2's `addTwo` for real:

```ts
Effect.runPromise(addTwo.pipe(Effect.provide(TodoRepoMemory))).then(console.log)
```

**Notice**

- After `Effect.provide(TodoRepoMemory)` the `R` slot is back to `never` and it
  runs.
- `Layer.effect` because *building* the repo needs an effect (`Ref.make`). A repo
  with zero setup would use `Layer.succeed`.
- `TodoRepo.of({...})` is just an identity function that type-checks the object
  against the service shape — nice error messages.
- `Clock` is itself a service, but it is built into every runtime, so you never
  provide it.

**Play:** run `complete(99)` — rejects with the tagged error. Wrap the call in
`Effect.catchTag("TodoNotFound", (e) => Console.log(\`no #\${e.id}\`))` and watch
`E` become `never`.

Primitives: `Layer.effect`, `Layer.succeed`, `Ref.make/get/set/update/getAndUpdate`,
`Effect.provide`, `Clock.currentTimeMillis`, `Effect.catchTag`.

---

## Stage 4 — the CLI shell

**Goal:** `@effect/cli` turns `process.argv` into Effects. A command handler is
just a function returning an Effect that needs your services.

```ts
import { Args, Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect } from "effect"

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
    yield* Effect.forEach(todos, (t) => Console.log(`#${t.id} ${t.text}`), {
      discard: true,
    })
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
        .pipe(Effect.catchTag("TodoNotFound", (e) => Console.log(`no #${e.id}`)))
    }),
)

const todo = Command.make("todo").pipe(Command.withSubcommands([add, list, done]))

const cli = Command.run(todo, { name: "todo", version: "0.0.0" })

cli(process.argv).pipe(
  Effect.provide(TodoRepoMemory),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
)
```

`bun run src/todo.ts add "buy milk"`, then `bun run src/todo.ts list`.

**Notice**

- In-memory ⇒ state resets every run, so `list` is always empty. That is the itch
  Stage 5 scratches.
- `NodeContext.layer` is a Layer *someone else wrote* that provides `FileSystem`,
  `Path`, `Terminal`, … You just plug it in. `@effect/cli` needs it.
- `NodeRuntime.runMain` is the runtime for a CLI: prints errors nicely, sets the
  exit code, handles Ctrl-C.
- `Effect.forEach(…, { discard: true })` is the sequential loop that throws the
  results away.

Primitives: `@effect/cli` `Command.make` / `Args` / `withSubcommands` /
`Command.run`, `NodeContext.layer`, `NodeRuntime.runMain`, `Effect.forEach`.

---

## Stage 5 — a real Layer that depends on other services

**Goal:** the payoff. A `Layer` whose construction *needs* `FileSystem` and
`Config`. Effect wires the dependency graph and type-checks it.

```ts
import { FileSystem } from "@effect/platform"
import { Config, Effect, Layer, Schema } from "effect"

const Todos = Schema.Array(Todo)

class FileCorrupt extends Data.TaggedError("FileCorrupt")<{
  readonly reason: string
}> {}

const TodoRepoFile = Layer.effect(
  TodoRepo,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem          // <-- a dependency
    const path = yield* Config.string("TODO_PATH").pipe(
      Config.withDefault("todos.json"),
    )

    const readAll = Effect.gen(function* () {
      if (!(yield* fs.exists(path))) return [] as ReadonlyArray<Todo>
      const raw = yield* fs.readFileString(path)
      const json = JSON.parse(raw) as unknown
      return yield* Schema.decodeUnknown(Todos)(json)
    }).pipe(Effect.mapError((e) => new FileCorrupt({ reason: String(e) })))

    const writeAll = (todos: ReadonlyArray<Todo>) =>
      fs
        .writeFileString(path, JSON.stringify(todos, null, 2))
        .pipe(Effect.mapError((e) => new FileCorrupt({ reason: String(e) })))

    return TodoRepo.of({
      list: readAll,
      add: (text) => Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const todos = yield* readAll
        const id = todos.reduce((m, t) => Math.max(m, t.id), 0) + 1
        const todo: Todo = { id, text, done: false, createdAt: now }
        yield* writeAll([...todos, todo])
        return todo
      }),
      complete: (id) => Effect.gen(function* () { /* readAll, guard, writeAll */ }),
      remove: (id) => Effect.gen(function* () { /* readAll, guard, writeAll */ }),
    })
  }),
)
```

Then change **one line** in the wiring:

```ts
const MainLayer = Layer.provideMerge(TodoRepoFile, NodeContext.layer)

cli(process.argv).pipe(Effect.provide(MainLayer), NodeRuntime.runMain)
```

**Notice**

- `TodoRepoFile` does `yield* FileSystem.FileSystem` at *build* time, so its Layer
  type carries an input requirement. `Layer.provideMerge(TodoRepoFile,
  NodeContext.layer)` feeds `NodeContext`'s output into that requirement **and**
  keeps `NodeContext` in the result (the CLI still needs `Terminal`).
- Delete the `NodeContext.layer` feed and you get a **compile error** — an unmet
  Layer requirement. The dependency graph is type-checked. That is the whole
  point.
- `Config.string("TODO_PATH")` is an `Effect` (well, a `Config`, consumed as one).
  Config is not global mutable state — it is a described dependency like any
  other. `TODO_PATH=/tmp/t.json bun run src/todo.ts list`.
- `Schema.decodeUnknown(Todos)(json)` returns an Effect that fails with a
  `ParseError`. `Effect.mapError` reshapes it into your `FileCorrupt` so `list`'s
  error type stays yours.
- The service interface's error slots widen to `… | FileCorrupt`. Update the
  `Context.Tag` shape and let the compiler chase the call sites.

Primitives: `FileSystem`, `Schema.Struct` / `Schema.Array` / `decodeUnknown`,
`Config.string` / `Config.withDefault`, `Effect.mapError`, `Layer.provideMerge`,
layer-with-requirements.

---

## Stage 6 — reason about the swap

**Goal:** see, concretely, that the program is written against `TodoRepo` alone
and its behaviour is entirely decided by the Layer you hand the edge.

Add `src/scenario.ts`:

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

// same program, two backends:
Effect.runPromise(
  scenario.pipe(Effect.provide(TodoRepoMemory)),
).then((r) => console.log("memory:", r))

Effect.runPromise(
  scenario.pipe(Effect.provide(Layer.provide(TodoRepoFile, NodeContext.layer))),
).then((r) => console.log("file:  ", r))
```

Also tidy the CLI edge: one place that turns any leftover `FileCorrupt` into a
clean message and non-zero exit, e.g.
`Effect.catchTags({ FileCorrupt: (e) => Console.error(`corrupt todo file: ${e.reason}`).pipe(Effect.zipRight(Effect.fail(e))) })`
around the subcommands — or lean on `NodeRuntime.runMain`'s default rendering and
just make sure the error type is honest.

**Notice**

- `Layer.provide(a, b)` feeds `b`'s output into `a`'s requirements and returns a
  Layer that needs nothing — the combinator `Effect.provide` used implicitly in
  Stage 5.
- `TodoRepoMemory` and `Layer.provide(TodoRepoFile, NodeContext.layer)` have the
  **same type** from `scenario`'s point of view: `Layer<TodoRepo>`. That
  interchangeability is the reasoning target.
- This is also how you would test: provide a fake `TodoRepo` Layer, no disk, no
  mocks-framework.

Primitives: `Layer.provide` vs `Layer.provideMerge`, `Effect.catchTags`, one
program / many Layers.

---

## Where to go next

Add exactly one, on a scratch branch:

- `Config.redacted` + a second service (a fake "sync" client) provided by its own
  Layer — practice composing three layers.
- `Schedule.exponential` + `Effect.retry` on `writeAll` — first taste of
  `Schedule`.
- `@effect/vitest` — write a test that provides a Ref-backed `TodoRepo` and
  asserts on `list`.
