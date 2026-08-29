# 0003 · Payer domain in scope, with licensed content and PHI as the boundary

**Status:** accepted
**Date:** 2026-08-29

## Context

`.agents/reviewer.md` rule 10 read: "No references to proprietary names, medical/clinical
terms, or real API keys." It was written when this repository was a sanitized extraction
from a private codebase, and in that context banning the vocabulary was a cheap, safe
proxy — nobody needed clinical terms, so forbidding them cost nothing and removed a whole
class of mistake.

That proxy stopped being free. Tier 3 of the backlog (P3-A through P3-D) is a payer-domain
vertical: prior authorization, coverage determination, and the audit trail a denial has to
carry. The whole point of that tier is that a memory architecture is only interesting when
it is holding something a reader recognizes as real work. Rule 10, read literally, forbids
it — not the risky part of it, the entire subject.

The rule also mistakes the boundary. Nothing about the word "prior authorization" is
proprietary; the term appears in federal rulemaking, in every payer's public member
handbook, and in the name of a Da Vinci implementation guide. What is actually encumbered
is narrower and sharper: real patient data, real member and claim records, a specific
licensed code set, and a payer's own plan documents. Those are the things that create legal
exposure, and a vocabulary ban catches none of them — a file can contain real PHI without
using a single clinical term, and can discuss prior authorization at length while
containing nothing but public material.

Two constraints are worth naming precisely, because they are the ones easy to get wrong:

- **CPT is licensed by the AMA and must never enter this repository.** HCPCS Level I _is_
  CPT, so "we only used HCPCS" is not a defence. ICD-10-CM and HCPCS Level II are freely
  redistributable and are sufficient for everything Tier 3 needs to demonstrate.
- **Synthetic is not a synonym for safe, but Synthea is safe.** Synthea's generated records
  are Apache-2.0 and contain no real person. Hand-written "realistic" examples drawn from
  memory of actual cases are not synthetic in the sense that matters.

## Decision

The payer-domain vertical is in scope. Rule 10 is replaced: the boundary is **licensed
content, real data, and implied clinical authority** — not terminology.

Specifically, this repository may discuss and model payer workflows, and may not contain:

1. **Real PHI or PII**, including member, claim, provider, and encounter records. Synthea
   output (Apache-2.0) and clearly-labelled fabricated fixtures are the substitute.
2. **CPT / HCPCS Level I codes**, in any file, including fixtures, tests and prose. ICD-10-CM
   and HCPCS Level II are permitted.
3. **Proprietary payer content** — plan documents, medical policy text, contracted rates, or
   internal system names carried over from prior work.
4. **Real credentials**, which was always right and is unchanged.

And one behavioural constraint, which is the part a vocabulary ban was never going to
express: the agent must not present itself as **making** a medical-necessity determination.
CA SB 1120 requires a licensed clinician to make the denial decision, and the CMS-0057-F
timelines assume a human decision-maker behind the API. Tier 3 models the _gate_ — it
assembles evidence, cites policy, and routes to a clinician — and any demo output that reads
as an autonomous denial is a defect, not a feature.

## Consequences

- Tier 3 is unblocked. P3-A through P3-D can be drafted against a real domain.
- The reviewer gains a check it could not previously perform. "Does this file contain a CPT
  code?" is a grep; "does this file use clinical terminology?" was a judgement call that
  produced false positives on every honest use.
- The domain becomes a claim this repository has to keep honest, the same way
  `docs/STATUS.md` keeps capability claims honest. A payer workflow modelled wrongly is
  worse than one not modelled at all, because a reader who knows the domain will spot it and
  will then distrust the parts they cannot check. Citations to CMS-0057-F, the Da Vinci
  guides and SB 1120 belong in the Tier 3 PRDs, not in prose written from memory.
- The constraint list above is enforceable and should eventually be enforced. A CPT-code
  pattern in `scripts/lint-docs.mjs`, or a sibling script, is the natural home; until then it
  lives in `.agents/reviewer.md` as a rule a reviewer applies by hand.
- This record does not license medical advice, and does not change the disclaimer posture of
  anything user-facing. It is a decision about what a portfolio repository may contain.
