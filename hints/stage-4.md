# Hint — Stage 4: the CLI shell

## Task

Wrap the repo in an `@effect/cli` app with `add <text>`, `list`, `done <id>`
subcommands. Wire it with `TodoRepoMemory` + `NodeContext.layer` and run via
`NodeRuntime.runMain`.

## Reach for

```ts
import { Args, Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect } from "effect"

Args.text({ name: "text" })        // -> string positional
Args.integer({ name: "id" })       // -> number positional

Command.make("add", { text: Args.text({ name: "text" }) }, ({ text }) =>
  Effect.gen(function* () { ... })          // handler: config record -> Effect
)
Command.make("list", {}, () => Effect.gen(function* () { ... }))

const root = Command.make("todo").pipe(
  Command.withSubcommands([add, list, done]),
)
const cli = Command.run(root, { name: "todo", version: "0.0.0" })

cli(process.argv).pipe(
  Effect.provide(TodoRepoMemory),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
)

Effect.forEach(items, (x) => Console.log(...), { discard: true })
```

## Gotchas

- The handler receives the **parsed config record** (`{ text }`, `{ id }`), not
  raw argv. `list` takes `{}` and a `() => …` handler.
- `@effect/cli` itself requires services (`Terminal`, `FileSystem`, `Path`) —
  that is why `NodeContext.layer` is provided even though your Stage 4 repo is
  in-memory. Drop it and you get an unmet-requirement type error.
- `NodeRuntime.runMain` is not `Effect.runPromise`. It is the CLI runtime:
  renders failures, sets exit code, wires SIGINT. Use it for the entrypoint.
- `cli(process.argv)` — pass the whole `process.argv`; `@effect/cli` skips the
  first two entries itself.
- Handle `TodoNotFound` inside the `done` handler with `Effect.catchTag`, or the
  command's error type is non-`never` and `runMain` will surface a raw failure.
- In-memory means every invocation starts empty. `list` after `add` in separate
  runs shows nothing. Expected — Stage 5 fixes it.

## Done when

- `bun run src/todo.ts add "buy milk"` prints `added #1`.
- `bun run src/todo.ts --help` and `... add --help` show generated usage.
- `bun run src/todo.ts done 5` prints your not-found message, exit code 0.

Reference: `git diff stage-3 stage-4 -- src`
