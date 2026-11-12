# Tasks

## 1. Classify the suite

Scenario-level overrides turned out to be impossible: cucumber-js accumulates tags down the tree,
so an override adds a class instead of replacing one. The suite is therefore grouped into pure
`Rule`s, which moves about a dozen scenarios. See design.md for the measurement.

- [x] 1.1 Rewrite the feature as pure `Rule`s: three `@draft` `Rule`s (section 2.1 with 1 scenario,
      2.6 with 5, 2.7 with 7) followed by six `@library` `Rule`s by theme (12, 5, 6, 5, 3, 5).
      Verified by cucumber selecting 13 draft scenarios and the file holding 49 in total.
- [x] 1.2 Replace the section comments with `Rule` headings and add the file-level note that class
      tags are inherited and scenarios carry none. Verified by cucumber selecting zero
      unclassified and zero doubly classified scenarios.
- [x] 1.3 Verify no scenario body changed: all 266 step lines and all 49 scenario names match the
      previous copy as multisets.
- [x] 1.4 Verify the full suite still passes: 49 scenarios and 362 steps, all green.
- [x] 1.5 Port the classified file to `idempot-dev/website` at `docs/specs/idempotency.feature`,
      open the upstream pull request, and verify the upstream copy matches this one apart from the
      generated banner. Done: idempot-dev/website#75, and the branch copy is byte-identical to
      `tail -n +5` of the file here.

## 2. Sync and enforcement in this repository

- [x] 2.1 Run `pnpm spec:sync` after the upstream pull request merges and verify the local file
      diff is empty apart from the banner. Done: the sync produced no diff.
- [x] 2.2 Add `scripts/check-spec-classification.js` with `test:spec:draft` and
      `check:spec-classification` scripts. Verify the checker passes on the current file and fails
      when a class tag is removed from a `Rule` and when a `@section` value names no section in
      `SPEC.md`.
- [x] 2.3 Add both commands to the `spec-compliance` job, checker first, and verify the workflow
      file parses by running the same commands locally and comparing their results with the job
      steps.
- [x] 2.4 Record the draft count from 2.2 and verify it matches the number the checker prints.

## 3. Published claims

- [x] 3.1 Update the compliance statements in `README.md` and `docs/index.md` to name the draft
      and the traced count from 2.4, and verify the number matches the acceptance output of
      `pnpm test:spec:draft`.
- [x] 3.2 Document the classification in `docs/testing.md`: both classes, the three CI selections,
      and where the canonical file lives. Verify `pnpm docs:build` succeeds.

## 4. Integration checks

- [ ] 4.1 Run the full, draft, unclassified and conflicts selections in sequence and verify all
      four pass with the expected counts, and that the tap suite is unaffected.
- [ ] 4.2 Verify the local feature file still matches upstream by running the `spec-consistency`
      comparison locally.

## Workflow follow-up

- Archive the change once the upstream pull request and this repository's pull request have both
  merged and the `spec-compliance` job is green.
