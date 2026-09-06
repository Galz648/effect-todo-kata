// Stage 1 — an Effect is a description, not a running thing.
//
// Effect<A, E, R>:  A = success value, E = error value, R = required services.
// Nothing runs until a runtime executes the description.

import { Console, Effect } from "effect"

// A program: logs a line, then produces 42.
//   hover: Effect<number, never, never>
const program = Effect.gen(function* () {
  yield* Console.log("hello from an Effect")
  return 42
})

// A failing value.
//   hover: Effect<never, string, never>   <- the error type is "string"
const boom = Effect.fail("nope")

// Recovering flips the error slot to `never`.
//   hover: Effect<void, never, never>
const recovered = boom.pipe(
  Effect.catchAll((e) => Console.log(`caught: ${e}`)),
)

// Descriptions above did nothing. Execution happens here:
Effect.runPromise(program).then((n) => console.log("program returned", n))
Effect.runPromise(recovered)

// Try it: uncomment the next line and watch the promise reject.
// Effect.runPromise(boom)
