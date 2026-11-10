<!-- Staged curated market research for the public repo. Figures only: aggregate counts and
     charts, never the corpus or usernames. -->

# Market research

Why we targeted P4 (creators whose PayPal income is held). Figures only; the labelled text corpus
they were computed from stays private and is git-ignored in the working repo, because it contains
usernames.

Source: `experiments/exp_001_market_research` in the working repo (`run.py`, outputs in
`.results/`). Method: `src/modules/data.py` reads three local, git-ignored JSON files
(`labelled-stats.json`, `solutions.json`, `corpus.json`) and every chart runs through an automated
plotting-convention checker before being accepted.

## Files staged here

| File | Source |
|---|---|
| `00-groups-pain-unresolved-rivals.png` | `experiments/exp_001_market_research/.results/00-groups-pain-unresolved-rivals.png` (`src/modules/fig_groups.py`) |
| `01-groups-radar.png` | `experiments/exp_001_market_research/.results/01-groups-radar.png` (`src/modules/fig_radar.py`) |
| `02-p4-what-creators-report.png` | `experiments/exp_001_market_research/.results/02-p4-what-creators-report.png` (`src/modules/fig_p4.py`) |

## Headline figures

- 15 profiling groups (P1-P7, N1-N15) were scored on five equally-weighted axes: pain authors,
  independent threads, unresolved share, few hackathon rivals, few existing products.
- **P4 (creator hold) ranks first**, radar area 42%, with 227 pain authors and 166 independent
  threads, the most of any group.
- Next: N4 (gig worker) 29%, N1 (elder parent) 22%, P6 (buyer dispute) 21%.
- Unresolved share is high everywhere (71%-98% across groups), so it separates groups less than
  the other axes.
- Rival counts are a lower bound: the current hackathon's entry gallery was unpublished at the
  time of this research, so "few rivals" likely undercounts competition.
- Within P4 specifically: 268 posts were reviewed for what creators report about held funds
  (`02-p4-what-creators-report.png`); per `docs/design.md`, about 111 describe a temporary hold
  with no clear release step and 63 involve commissions, tips or donations (digital services with
  no carrier tracking number).

## What is intentionally excluded

- The labelled text corpus (`corpus.json`, `labelled-stats.json`, `solutions.json`) and any
  source thread/post text.
- Usernames, handles or any other author-identifying detail.
- Anything not already aggregated into the counts and chart images above.
