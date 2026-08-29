import { pgTable, uuid, text, integer, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

export const episodes = pgTable(
  'episodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    runId: uuid('run_id').notNull(),
    turnIndex: integer('turn_index').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // The episodic natural key. `reflect` writes every message in
    // `state.messages` — the client-supplied conversation history — so run 2
    // of a session re-writes turn 0. Keyed on `run_id` instead, `findBySession`
    // would return turn 0 once per run, which is not the "full turn history"
    // the tier is specified to hold. `run_id` stays as a column recording
    // which run first persisted the turn.
    unique('episodes_session_turn_key').on(table.sessionId, table.turnIndex),
  ],
);
