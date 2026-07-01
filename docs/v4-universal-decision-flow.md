# World Cup V4 Experience and League V1 Flow

The World Cup model is currently V4. Other leagues start their own model history from V1. League V1 is not an odds-only model: it applies the lessons learned from the World Cup V4 workflow, while keeping league version history separate.

Future leagues should also start from V1, then evolve independently as their own samples and reviews accumulate.

## Shared Decision Steps

1. Build the internal probability baseline.
2. Read the competition rules and motivation.
3. Check both teams' recent state.
4. Classify style and tactical matchup.
5. Build the internal institution line, then compare it with the Sporttery line and historical samples.
6. Test state transfer: half-time, 0-0 at 60 minutes, first goal, and post-lead behavior.
7. Validate score and total-goals range.
8. Decide handicap independently from win/draw/loss.
9. Name the likely failure mode and apply the value filter.
10. Lock the final package: win/draw/loss, handicap, total goals, two scores, match type, confidence, and action.

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

Automatic league rows are only V1 prefilters until those fields are filled with real analysis.
