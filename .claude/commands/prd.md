---
description: Implement a PRD from docs/prd, or draft it for review if it does not exist yet
argument-hint: '[PRD id, e.g. P0-A]'
disable-model-invocation: true
---

Work on PRD `$ARGUMENTS`.

## First, resolve the id

- **No id given** — read the "Where things stand" section of `docs/prd/README.md`, say what
  you think the next PRD should be and why, and stop. Do not start work.
- **No file, but the id has a row in the index table** — Draft mode.
- **Neither** — the id is not in the backlog. Say so and ask whether to add it, rather than
  inventing a PRD for an id nobody has agreed to.
- **The file exists** — route on its `status`, not on the fact that it exists:
  - `accepted` or `in-progress` — Implement mode.
  - `draft` — **the spec has not been signed off.** Review mode. Do not implement it. If I
    tell you to proceed anyway, say in your summary that you implemented a draft, so the
    record shows the review was skipped.
  - `shipped` — say so and ask what is intended: a follow-up belongs in a new PRD, and a
    correction to a shipped record usually means superseding it.
  - `superseded` — point at `superseded_by` and stop.

---

## Draft mode

Write the PRD. Do not implement it.

1. Read `docs/prd/_TEMPLATE.md` for section order, `.agents/prd-author.md` for the rules,
   and one accepted PRD — `P0-A-make-it-run.md` or `P1-A-eval-harness.md` — for register.
2. Read `docs/adr/` so the design does not silently contradict a decision.
3. Verify every claim you make about this repo against the source before writing it. A PRD
   whose Problem section is wrong is worse than no PRD, because it will be trusted.
4. Write `docs/prd/<id>-<slug>.md` and update its row in the index. `size` and `status` must
   match the frontmatter in both places.
5. Run `yarn lint:docs`.
6. **Commit the draft**, then stop and hand it to me for review. Leave `status: draft`.
   An uncommitted draft cannot be diffed, cannot be reviewed as a change, and is one stray
   `git checkout` from gone.

Tell me explicitly what you were unsure about — a PRD I approve without knowing where it was
guessing is worse than one that flags its own soft spots.

---

## Review mode

The PRD exists and is `draft`. **Say so in your first line** — `/prd <id>` is the same
command for both, and someone who expected code needs to know why they are reading a review.

1. **Re-verify the PRD's factual claims at HEAD before forming an opinion on them.** Every
   file:line reference, every dependency claim, every count. A draft's claims were true when
   written and are the part most likely to have rotted; they are also the part the
   implementer will trust without checking.
2. Read `docs/adr/` and `.context/conventions.md`. A PRD that contradicts a written
   convention is not a PRD problem to note in passing — one of the two has to move, and
   saying which is part of the review.
3. **Apply your corrections to the file and commit them.** Do not hand me a list of defects
   and a question. A review that ends in "shall I apply these?" costs a round trip and
   leaves the corrections in a transcript instead of in the repo. Leave `status: draft`.
4. Where a correction is a judgement call rather than a fact, make the call, apply it, and
   say in your summary what you decided and what the alternative was. I can reverse a
   decision I can see; I cannot act on one you left open.
5. Run `yarn lint:docs`.
6. Report: what you verified, what you changed and why, and anything you could not settle
   from inside the repo — a claim needing a live API key, a decision that is mine. Then say
   plainly that accepting it means setting `status: accepted` in the frontmatter and the
   index row, after which `/prd <id>` implements.

---

## Implement mode

1. **Read the PRD first, then push back before writing code.** Tell me anything in it that
   is wrong, underspecified, or that you would do differently. This is the cheapest moment
   to catch a bad spec.
2. **Acceptance criteria are the contract.** Everything in them, nothing outside them. If
   you find a real problem that is out of scope, name the PRD that owns it and note it in
   that PRD's risks — do not fix it here and do not silently drop it.
3. **Re-verify before acting on the PRD's factual claims.** They were true when written;
   another PRD may have closed some since.
4. Work in small commits with real messages, following `.context/conventions.md`.
5. Run `yarn turbo typecheck`, `yarn turbo lint`, `yarn lint:docs`, and `yarn format:check`
   before calling it done.
6. Walk the acceptance criteria one by one and say which are met. If one is not, say so
   plainly rather than reporting the task complete.

---

## Both modes: close the loop

Before you finish, update:

- the PRD's `status` in frontmatter,
- its row in the `docs/prd/README.md` index (the lint enforces that these agree),
- the **"Where things stand"** section at the top of that index, including its date.

And tell me: **what did you have to work out that `docs/prd/`, `docs/adr/`, `.context/`, or
`CLAUDE.md` should have told you?** Anything on that list is a gap in the scaffolding, and
closing it is part of the task, not an afterthought.
