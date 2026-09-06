// Stage 2 — define the service. No implementation yet.
//
// A service = an interface (its value shape) + a Tag to look it up by.
// You can write code against it before any Layer exists.

import { Context, Data, Effect, Schema } from "effect"

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

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class TodoNotFound extends Data.TaggedError("TodoNotFound")<{
  readonly id: number
}> {}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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
// A program that USES the service.
//   hover addTwo: Effect<ReadonlyArray<Todo>, never, TodoRepo>
//                                                  ^^^^^^^^ unmet requirement
// ---------------------------------------------------------------------------

const addTwo = Effect.gen(function* () {
  const repo = yield* TodoRepo
  yield* repo.add("a")
  yield* repo.add("b")
  return yield* repo.list
})

// This does NOT compile — TodoRepo is still required:
//   Effect.runPromise(addTwo)
//   Argument of type 'Effect<..., TodoRepo>' is not assignable to
//   parameter of type 'Effect<..., never>'.
//
// Stage 3 provides a Layer and closes the gap.

console.log("Stage 2: TodoRepo defined, no implementation yet. See hints/stage-3.md")

export { Todo, TodoNotFound, TodoRepo, addTwo }
