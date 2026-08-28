# Conventions

## TypeScript

- **Strict mode everywhere.** No `any`. Use `unknown` + Zod parse at system boundaries.
- Zod schemas are the **source of truth** for types. Infer types from schemas via
  `z.infer<typeof Schema>` — never duplicate type definitions manually.
- Target: ES2022. Module: NodeNext (packages/apps), ESNext (React console).

## File Naming

- `kebab-case.ts` for all source files (e.g., `retrieval-facade.ts`).
- `PascalCase.tsx` for React components (e.g., `RunForm.tsx`).
- Test files: `*.test.ts` co-located with source for unit tests; separate `test/`
  directory for integration tests.

## Package Structure

- All packages export through a root `src/index.ts` barrel file.
- Internal imports within a package use relative paths.
- Cross-package imports use the `@repo/<name>` workspace alias.

## Commits

- **Conventional Commits:** `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `ci:`.
- Imperative mood, lowercase first word after prefix.
- Body optional but encouraged for non-trivial changes.

## Logging

- **No `console.log`.** Use the structured logger from `@repo/telemetry`.
- All log lines include `correlationId` from AsyncLocalStorage context.
- Log levels: `debug`, `info`, `warn`, `error`.

## Testing

Each tier has one command. All of them run in CI except `test:eval`, which is nightly.

| Tier        | Runner                 | Command                       | Scope                                           |
| ----------- | ---------------------- | ----------------------------- | ----------------------------------------------- |
| Unit        | Vitest                 | `yarn turbo test:unit`        | `packages/` and pure logic in apps — no I/O     |
| Service     | Jest + @nestjs/testing | `yarn turbo test:service`     | `apps/agent-service` over HTTP, stub graph deps |
| Integration | Vitest                 | `yarn turbo test:integration` | Real Postgres/Neo4j — never mock a database     |
| E2E         | Playwright             | `yarn turbo test:e2e`         | Browser against the full `docker compose` stack |

- **Service tests need `--experimental-vm-modules`**, which the `test:service` script
  already carries. Jest's ESM support requires it, and without it every import in a spec
  fails with "Cannot use import statement outside a module". For the same reason the Jest
  config is `jest.config.mjs` and not `.ts` — a TypeScript config makes Jest require
  `ts-node`, which is not a dependency.
- **Service tests must not depend on ambient environment.** `RunsService` picks live Gemini
  dependencies over stubs whenever `GOOGLE_API_KEY` is set, so a spec that does not clear
  it passes or fails according to the developer's shell.
- **E2E runs against the compose stack, not the dev server.** Bring it up with
  `docker compose --profile full up -d --build --wait`, then run the suite with
  `E2E_BASE_URL=http://localhost:8080`. Without that variable Playwright boots the Vite dev
  server instead, which serves the UI with no backend behind it — assertions pass without
  proving anything.

## Documentation

- **Planned work goes in `docs/prd/`**, one file per PRD, indexed by `docs/prd/README.md`.
- **Decisions go in `docs/adr/`.** A record is not edited after it reaches `accepted` —
  supersede it with a new one instead.
- `yarn lint:docs` checks the structure: frontmatter completeness, that every id resolves,
  that `depends_on` and `blocks` are mutual, that the index agrees with the files, and that
  a `shipped` PRD's unmet criteria each name the PRD that now owns them. It runs on every
  pull request.
- **A capability claim in `README.md` or `.context/` must be true of the code at HEAD.**
  If it is aspirational, it belongs in `docs/prd/` or in the status matrix, not in the
  present tense.
- **`docs/STATUS.md` is that status matrix**, one row per documented capability with what
  is actually behind it and which PRD owns the rest. A change that moves a row — wiring an
  adapter, deleting a claim — updates the row in the same pull request.

## Error Handling

- Validate at system boundaries with Zod. Trust internal types.
- Use NestJS exception filters for HTTP error envelopes. A filter must preserve the payload
  a 4xx `HttpException` carries — `ZodValidationPipe` attaches `error: 'Validation Error'`
  and the Zod `issues`, and rebuilding the body from scratch throws away the only part a
  client can act on. 5xx payloads are never forwarded.
- **Inject Nest dependencies by explicit token: `@Inject(Foo) private readonly foo: Foo`.**
  `yarn dev` runs through tsx, and esbuild does not implement `emitDecoratorMetadata`, so
  Nest has no `design:paramtypes` to resolve an implicit constructor parameter and injects
  `undefined`. It only breaks on the dev path — `tsc` emits the metadata — so the compiled
  build and the service tests will not catch it.
- Graph nodes return `Partial<AgentState>`. Containing failure inside the node is the
  intent, and the code does not do it yet: `ingress.node.ts` throws on a Zod parse failure,
  and `retrieve` and `reflect` propagate I/O errors to the caller. Do not add a new node
  that widens that gap.

## Dependencies

- Minimize external dependencies. Prefer standard library where possible.
- All new packages must be registered in the root `package.json` workspaces array.
- Pin major versions. Use `^` for minor/patch ranges.
