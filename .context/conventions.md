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
- **Unit (Vitest):** `packages/` — pure functions, no I/O, no containers.
- **Service (Jest + @nestjs/testing):** `apps/agent-service` — module isolation,
  mocked graph execution.
- **Integration (Vitest + testcontainers):** Real Postgres/Neo4j containers.
  No mocking of databases in integration tests.
- **E2E (Playwright):** Full stack via `docker-compose.yml`.

## Error Handling
- Validate at system boundaries with Zod. Trust internal types.
- Use NestJS exception filters for HTTP error envelopes.
- Graph nodes return `Partial<AgentState>` — never throw from within a node.

## Dependencies
- Minimize external dependencies. Prefer standard library where possible.
- All new packages must be registered in the root `package.json` workspaces array.
- Pin major versions. Use `^` for minor/patch ranges.
