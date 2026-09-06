# Hint — Stage 2: define the service

## Task

Define the `Todo` shape, a `TodoNotFound` tagged error, and a `TodoRepo` service
*interface* (no implementation). Then write a small program that uses `TodoRepo`
and confirm it does **not** compile when run.

## Reach for

```ts
import { Context, Data, Effect, Schema } from "effect"

// data
const Todo = Schema.Struct({ id: Schema.Number, text: Schema.String,
                             done: Schema.Boolean, createdAt: Schema.Number })
type Todo = Schema.Schema.Type<typeof Todo>

// error
class TodoNotFound extends Data.TaggedError("TodoNotFound")<{
  readonly id: number
}> {}

// service: a Tag whose value type is the interface
class TodoRepo extends Context.Tag("TodoRepo")<
  TodoRepo,
  {
    readonly list: Effect.Effect<ReadonlyArray<Todo>>
    readonly add: (text: string) => Effect.Effect<Todo>
    readonly complete: (id: number) => Effect.Effect<void, TodoNotFound>
    readonly remove: (id: number) => Effect.Effect<void, TodoNotFound>
  }
>() {}

// use it
const prog = Effect.gen(function* () {
  const repo = yield* TodoRepo
  ...
})
```

## Gotchas

- The two type parameters to `Context.Tag(...)<Self, Shape>()` are: the class
  itself (`TodoRepo`), then the service's value shape. The `()` at the end is
  required.
- Every field is an `Effect`, not a plain value/function-returning-value. `list`
  is a *bare* `Effect` (no args); `add` is a function returning an `Effect`.
- `yield* TodoRepo` is how you read the service out of context. After it, hover
  the surrounding `gen` — the `R` slot contains `TodoRepo`.
- `Effect.runPromise(prog)` should be a red squiggle: `Type 'TodoRepo' is not
  assignable to type 'never'`. That unmet requirement is the point.
- Put `TodoNotFound` in the error slot of `complete`/`remove` only — `list`/`add`
  can't fail yet (`E = never`, omit it).

## Done when

- The file type-checks (`bun run typecheck`) *without* a run line, and fails to
  type-check *with* `Effect.runPromise(prog)`.
- You can point at where `TodoNotFound` appears in `prog`'s inferred type.

Reference: `git diff stage-1 stage-2 -- src`
