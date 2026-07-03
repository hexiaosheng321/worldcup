# World Cup V4 Base Flow for Every League

The World Cup model is currently V4. Every league and cup model must use this V4 decision flow as its base.

Other leagues start their own model history from V1, but League V1 is not an odds-only model. It is the World Cup V4 decision chain adapted to that league's rules, tempo, team context, and sample base.

Future leagues should also start from V1, then evolve independently as their own samples and reviews accumulate.

## Shared Decision Steps

1. Build the internal probability baseline.
2. Read the competition rules and motivation.
3. Check both teams' recent state.
4. Classify style and tactical matchup.
5. Build the internal institution line, then compare it with the Sporttery line and historical samples.
6. Read odds movement as a defensive signal, not as the answer.
7. Build the normal match script.
8. Test state transfer: half-time, 0-0 at 60 minutes, first goal, and post-lead behavior.
9. Resolve decision conflicts before any final recommendation.
10. Validate score and total-goals range.
11. Decide handicap independently from win/draw/loss.
12. Name the likely failure mode.
13. Apply the value filter.
14. After manual confirmation, lock the final package: win/draw/loss, handicap, total goals, two scores, match type, confidence, and action.

## Competition Rules Layer

- World Cup group stage: group points, goal difference, acceptable result, third-place pressure, and simultaneous-match behavior.
- World Cup knockout stage: 90-minute objective, extra-time and penalty acceptance, first-goal risk, and whether the favorite must solve the match before extra time.
- League matches: league table position, title or continental-race pressure, relegation pressure, home/away split, schedule density, rotation, and round-to-round motivation.
- Cup matches: one-leg or two-leg format, aggregate score, away-goal or no-away-goal rule if relevant, extra-time incentives, rotation, and manager priority.

## League Requirement

League models must not rely on odds alone. A league V1 prediction is incomplete until it records:

- team state from recent meaningful matches
- style and tactical matchup
- half/full or 60-minute state-transfer branch
- event-specific motivation from the league or cup rules
- market expectation versus match script
- historical sample comparison for draw rate, score shape, total-goals range, and similar handicap patterns
- final failure mode
- value-filter result

Automatic league rows are only V1 prefilters until those fields are filled with real analysis.

## External History Reference

For new leagues or leagues without enough internal locks, pull free/API historical results into `external-history / EXTERNAL_HISTORY` samples first.

External history may support:

- same-league result distribution
- draw rate and upset shape
- score and total-goals range
- rough tempo comparison before the league model has its own Case Base

External history must not be treated as a locked prediction. It cannot become Case Base until the project has produced its own `FINAL_LOCK`, result backfill, and review diagnosis for that match.

## League Lock Rule

League models must be completed as `PRE_LOCK` first. Do not write a league `FINAL_LOCK` in the same step as model creation.

A league `FINAL_LOCK` requires manual confirmation after the model has filled the league rule layer, team state, style matchup, market comparison, similar-case check, half/full branch, score/total-goals validation, handicap gate, failure mode, and value filter.

For non-World-Cup leagues, the cloud API rejects `FINAL_LOCK` unless the request explicitly includes `finalApproval=true`.
