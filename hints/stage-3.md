# Hint — Stage 3: in-memory Layer

## Task

Build `TodoRepoMemory: Layer<TodoRepo>` backed by two `Ref`s (the list, and the
id counter). Then run your Stage 2 program by providing that Layer.

## Reach for

```ts
import { Clock, Effect, Layer, Ref } from "effect"

Layer.effect(TodoRepo, Effect.gen(function* () {
  const store  = yield* Ref.make<ReadonlyArray<Todo>>([])
  const nextId = yield* Ref.make(1)
  return TodoRepo.of({ list, add, complete, remove })
}))

Ref.get(ref): Effect<A>
Ref.set(ref, a): Effect<void>
Ref.update(ref, (a) => a): Effect<void>
Ref.getAndUpdate(ref, (a) => a): Effect<A>     // returns the OLD value
Ref.modify(ref, (a) => [returnValue, newState]): Effect<returnValue>
Clock.currentTimeMillis: Effect<number>
Effect.void                                    // Effect<void>, the "ok, nothing" value
Effect.fail(new TodoNotFound({ id }))

effect.pipe(Effect.provide(TodoRepoMemory))
Effect.catchTag("TodoNotFound", (e) => Effect.Effect)
```

## Gotchas

- `Layer.effect` (not `Layer.succeed`) because you need `Ref.make`, which is an
  Effect. `Layer.succeed` is for a service you can build with no effects.
- `TodoRepo.of({...})` wraps the record — it is an identity function that gives
  you a precise type error if a method's shape is wrong. Use it.
- `Ref.getAndUpdate(nextId, n => n + 1)` returns the id you should assign, then
  bumps the counter. Order matters — read the docs on `getAndUpdate` vs
  `updateAndGet`.
- For the not-found guard: `if (!todos.some(...)) return yield* Effect.fail(...)`.
  The `return yield*` short-circuits the `gen` block.
- A helper `findOrFail(todos, id): Effect<void, TodoNotFound>` returning
  `Effect.void` or `Effect.fail(...)` keeps `complete`/`remove` tidy.
- `Clock` needs no Layer — it is ambient in every runtime. Just `yield*` it.
- After `Effect.provide(TodoRepoMemory)`, the program's `R` is `never` and
  `Effect.runPromise` compiles.

## Done when

- `Effect.runPromise(addTwo.pipe(Effect.provide(TodoRepoMemory)))` prints two
  todos.
- Calling `complete(99)` rejects; wrapping it in `Effect.catchTag("TodoNotFound",
  …)` makes the error type `never` and it no longer rejects.

Reference: `git diff stage-2 stage-3 -- src`
