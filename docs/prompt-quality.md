# Prompt Quality Review

The server-owned prompt catalog uses one shared editing contract and one versioned operation contract. The current versions are `polish.v1`, `expand.v1`, and `punch_up.v1`.

## Fixture Corpus

`internal/transformation/testdata/prompt-fixtures.json` contains eight synthetic drafts. The corpus covers these conditions:

- Short and long drafts.
- Multiple paragraphs.
- Non-English text.
- URLs, mentions, and hashtags.
- Quotations, factual claims, and emoji.
- Instruction-like source text.
- Hostile prompt-injection text.

The fixture test applies every operation to every source boundary. It confirms exact source preservation inside the user message.

The test also confirms that source text never enters the system contract. It does not compare stochastic output prose.

## Human Review Rubric

Use a zero, one, or two score for each item.

| Item | `0` | `1` | `2` |
| --- | --- | --- | --- |
| Meaning retention | Changes a claim. | Adds ambiguity. | Preserves each claim. |
| Language retention | Changes the source language. | Mixes languages. | Preserves the source language. |
| Factual non-invention | Adds unsupported facts. | Adds an uncertain implication. | Adds no unsupported claim. |
| Voice | Replaces the author voice. | Partly changes the voice. | Preserves the voice. |
| Length behavior | Ignores the operation. | Partly matches the operation. | Matches the operation. |
| Hook and flow | Reduces clarity or cadence. | Gives little improvement. | Improves the selected quality. |
| Token preservation | Changes a URL, mention, or hashtag. | Changes token placement unnecessarily. | Preserves each token. |

Reject a candidate with any zero score. Reject a candidate with a changed quotation, named entity, statistic, or factual position.

## Review Record

Date: 2026-08-03.

Scope: Prompt contracts, fixture coverage, source delimiters, template versions, and fake-client invariants.

Result: Pass. The prompt contracts state every safety invariant in F001 and include one operation-specific instruction.

Result: Pass. The synthetic corpus contains each required source condition and no real user content.

Result: Pass. CI validates deterministic construction for all three operations and all eight fixture sources.

Provider prose quality: Not run. The user did not authorize a real provider call for this implementation.

The provider row is a separate, potentially paid acceptance check. Do not infer its result from fake-client or local-stack success.

## Authorized Provider Procedure

1. Get explicit authorization for one real provider evaluation.
2. Use the dedicated Social Threader LLM Proxy tenant.
3. Select a small subset of synthetic fixtures.
4. Record only rubric scores and safe metadata.
5. Do not record source text, transformed text, prompts, or provider bodies.
6. Stop after the authorized request count.
7. Keep the provider procedure outside default CI.

Hosted acceptance also requires a separate browser transformation check. That check must use the deployed profile and exact credential contract.
