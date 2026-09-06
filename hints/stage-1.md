# Hint — Stage 1: an Effect is a description

## Task

In `src/todo.ts`: build one `Effect.gen` program that logs a line and returns a
number, then run it. Then add a second value that *fails*, and observe its type
and its behaviour when run and when caught.

## Reach for

```ts
import { Console, Effect } from "effect"

Effect.gen(function* () { ... })            // Effect<A, E, R>
yield* someEffect                            // unwrap A inside gen
Console.log(msg): Effect.Effect<void>
Effect.fail(value): Effect.Effect<never, typeof value>
Effect.succeed(value): Effect.Effect<typeof value>
Effect.runPromise(effect): Promise<A>        // rejects if E
Effect.runSync(effect): A                    // throws if E or async
Effect.catchAll(effect, (e) => recoverEffect)
```

## Gotchas

- Nothing executes until `runPromise` / `runSync`. If you delete the run line,
  the program is inert — no log. Prove that to yourself.
- `Console.log` returns an Effect. `yield*` it. Don't call `console.log`
  directly inside `gen` and expect Effect semantics.
- `return x` inside `Effect.gen` sets the success value `A`.
- Hover every binding. The goal of this stage is reading the `A / E / R` slots,
  not the output.

## Done when

- `bun run src/todo.ts` prints your line and (via `.then(console.log)`) the
  number.
- You can state what `E` is for your failing value, and what it becomes after
  `Effect.catchAll`.

Reference: `git diff main stage-1 -- src`
