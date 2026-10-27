# Resource reduction worklog

This is the single ongoing narrative log. `HANDOFF.md` is historical and will
not be updated further. Raw measurements, profiles and temporary probes remain
under `obj/`; implementation and regression tests belong in the repositories.

## Accepted baseline

- Platform `13022a6f1c`, app `d990a3b`: authored-variable cache lifetime,
  collision handling and complete unique-data accounting. Optimized build,
  six native storage tests, 1088 browser assertions and smoke passed.
- Platform `b515c08437`, app `b1ee407`: release idle spare software paint buffers
  on tiers 0/1. GitHub textures 20.65 -> 10.33 MiB in same-binary cold/warm
  pairs; WS down 9.6-18.1 MiB, private commit down 17.2-18.2 MiB. Fifteen
  rendering states matched; controlled animation timings were within 0.2%.
  Raw captures and historical details: `obj/resource-next`.

## Memory-weighted retained documents — platform `64ebe16054`

The latest real-page reports contradict the old BFCache eligibility pilot:
after GitHub -> Wikipedia, GitHub is present under `/cached/`, retaining
9.53 MiB of sheets, 3.07 MiB of cascade sets, plus DOM/layout, computed variables
and JavaScript. The old zero-viewer result is not a valid ceiling for this
workload. Existing eviction assumes an average 4 MiB per viewer and limits
counts rather than the size of the retained documents.

Implement a global low-tier charge budget for cached document DOM/layout/style
memory while keeping smaller presentations cached and preserving ordinary
history restoration/reload for evicted documents. Continue to enforce the
existing count/distance rules. Tier 3 remains unlimited by bytes unless
explicitly overridden. A negative budget selects the tier policy; zero evicts
all cached presentations; a positive budget is in KiB. The charge excludes JS,
images and globally reported shared-variable blocks, so it is a retention-policy
metric, not a claim of total process or precisely reclaimable bytes.

Acceptance requirements: same-binary cold/warm real-page navigation comparisons,
attributed cached-window bytes and actual process counters, ordinary versus
cached history navigation, form/scroll restoration, hash/pushState aliasing,
subframes, live preference changes and default tier policy. No broad memory
pressure or allocator changes. If cached-window removal is not repeatable or
functional/performance gates fail, abandon the arm and preserve the baseline.

Fresh eligibility capture confirmed 20.45 MiB under cached GitHub window
entries. The first arm removed that presentation and cut script data 8.90 ->
4.71 MiB and global computed-variable storage 6.10 -> 0.06 MiB; live Wikipedia
responses differed, so those process deltas are not an acceptance comparison.

The controlled comparison instead loads real GitHub, then a fixed local
destination with identical DOM/text/script counts. Both checkpoints are 45 s
after navigation. Cold control/arm: WS 196.11 -> 160.23 MiB, private commit
232.86 -> 193.72 MiB, application heap 83.85 -> 46.01 MiB; cached window bytes
20.40 -> 0.10 MiB. A warm reverse pair is required before acceptance.

Functional coverage includes forms/scroll after reload, cached global identity,
pushState aliases, recursive frame charge, tier-0 versus tier-1 defaults and
global eviction across tabs. A measured 12.6 MiB fixture lies between the
8/24 MiB tier budgets. The global byte-budget ordering prefers nearer viewers,
then recent use; ordinary count-only tier-3 ordering is preserved. Recency must
also record newly added entries: the historical touch counter covered only
Back/Forward loads and otherwise left new documents tied at zero.

Performance check: reverse-order control/arm sequences on a fixed 4000-rule/DOM
fixture, timing navigation away after parsing is finished. Reject a repeatable
added median above 15 ms or a >50 ms added outlier; record the actual values.
Instant Back for over-budget pages is an explicit functionality tradeoff of the
low tier, and reload/form/scroll behavior must pass. Small pages must still use
instant cached restoration. No general JS throughput improvement is claimed.

### Final implementation and acceptance

The policy is `browser.memory.historyBudgetKB`: negative/missing selects 8 MiB
of DOM/layout/style charge on tier 0, 24 MiB on tier 1, and no byte cap on the
other tiers; zero evicts all cached presentations; positive values override
the tier budget. Existing viewer-count limits continue to apply. Pref/tier
changes immediately enforce the policy. This is a charge budget, not a total
JS+DOM+image byte limit. Tier 3's existing path remains in use with no override.

Implementation: `docshell/shistory/nsSHistory.cpp`. Enumerate and deduplicate
actual cached viewers (including same-document aliases), charge documents and
subdocuments, reject individually oversized viewers, then evict by distance
and recency until both global count and charge limits hold. Preserve history
entries and the established presentation-destruction/state-restoration path.
The count-only comparator is unchanged. Regression source is
`docshell/test/browser/browser_history_budget.js` with its HTML fixture.

The fixed destination is a small local page, after loading **live GitHub**.
It removes destination-content/network variability while retaining the real
departing page. GitHub source-page DOM/text/image/script counts matched across
the controlled runs (1835 / 136376 / 25 / 16); destination counts also matched
(10 DOM nodes, 800 text characters, one script). The preceding real Wikipedia
sequence is eligibility/attribution evidence only, not a process acceptance
pair, because its live responses differed.

Same optimized binary, tier 0, Basic compositor, fixed allocator environment,
1280x900 viewport, no about:memory tab or forced GC. Cold order control then arm;
warm reverse order arm then control, reusing the corresponding profiles. Control
sets a 256 MiB charge budget; arm uses the default tier-0 budget with **no
override**. Process sampling precedes memory-report collection in both arms.
The first measurement after leaving GitHub is 45 s after navigation (process
age ~91.6 s). The warm follow-up is 135 s after navigation (process age ~181.7 s).

| Checkpoint | Control WS / private MiB | Arm WS / private MiB | Control / arm application heap MiB |
|---|---:|---:|---:|
| Cold, 45 s after leaving GitHub | 196.105 / 232.863 | 160.234 / 193.723 | 83.851 / 46.013 |
| Warm, 45 s after leaving GitHub | 193.398 / 216.512 | 159.250 / 181.371 | 84.641 / 46.559 |
| Warm, 135 s after leaving GitHub | 187.891 / 210.742 | 146.750 / 168.824 | 80.478 / 36.367 |

Cached-window attribution stays 20.40-20.42 -> 0.098 MiB. Script data falls
8.23-8.39 -> 4.01-4.09 MiB, computed variables 6.076 -> 0.008 MiB. Private
resident falls by 34.1-41.1 MiB across these checkpoints. The application-heap
and attributed-owner changes support the process reduction; this is not
allocator tuning or only a working-set trim. The source page while active
does not gain this reduction. No 360 s trajectory or instantaneous post-eviction
reclamation guarantee is claimed; natural collection is part of the measured
45/135 s results.

Validation on the final compiled policy:

- Optimized `obj/basilisk` build passes, `build-final-policy.log` under
  `obj/history-budget`; no additional build directory was created.
- 32 history assertions pass repeatedly: cached global identity, reload after
  eviction, form/scroll restoration, pushState/hash aliases, root+subdocument
  charge, valid tier transitions, explicit/zero override, total budget and
  recency across tabs. Active parent identity survives frame navigation and
  enforcement. The frame-only sequence did not demonstrate a retained child
  viewer in its control, so it is not positive coverage of child-viewer eviction.
- The existing shipping config disables tests. The actual browser test source
  runs through a minimal generator-task/chrome adapter in the shipping browser;
  this is not a full `mach mochitest` run, sanitizer or fault-injection test.
- Navigation timing compares the **legacy unbudgeted tier-3 path** with the
  8 MiB policy in control/arm/arm/control order on a fixed 4000-rule/DOM page.
  First repeat block medians: 46/56/61/60 ms; maxima 50/66/76/90 ms. Independent
  repeat: medians 50/57/67/71 ms; maxima 70/76/126/84 ms. A preliminary 194 ms
  arm sample was not reproduced. Added median is at most 10 ms in these paired
  blocks; repeat outlier differences remain below the 50 ms gate. These test
  navigation overhead, not live-network Back latency or general JS throughput.
- CSS browser regressions: 1088 assertions, zero failures; general smoke:
  xpcshell 16/16, browser 10/10 + DONE. Tier 0/1/3 smoke passes (12 log entries
  each, zero failures, WebGL available). Modern web features remain enabled.
- Final integration review replaced the reporter macro size function with the
  raw `moz_malloc_size_of` query. The policy must not mark allocations as
  reported to DMD outside actual memory-report collection. The queried byte
  counts are identical in the optimized non-DMD build. `build-final.log`
  records this final rebuild; final history/smoke runs verify the final binary.

Final binary: build passed; all 32 assertions passed; navigation timing block
medians 47/58/68/69 ms, maxima 58/62/82/72 ms; xpcshell 16/16 and browser
10/10 + DONE passed. No test browser remains running. The policy is accepted
for the low tiers on the measured evidence above. It reduces retained inactive
documents; it does not make an active GitHub document 40 MiB smaller.

Raw logs/reports/profiles, adapter and `summary.csv`: `obj/history-budget`.
Only this worklog is maintained as narrative documentation. The cost is explicit:
an evicted large page reloads on Back/Forward, rather than preserving its live
JS global; retained smaller pages keep instant restoration. Do not describe
this as reducing the active page's JS heap or saving memory without a reload
tradeoff. The earlier BFCache direction was closed for lack of eligible viewers;
the current positive population is the evidence for reopening it.
