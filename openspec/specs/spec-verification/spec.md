# spec-verification Specification

## Purpose

Makes the executable Gherkin suite state which of its scenarios the IETF draft mandates and
which are library policy, so the compliance claim can be audited and new policy cannot hide
under a draft citation.

## Requirements

### Requirement: Every scenario resolves to exactly one class

Each scenario in the published feature file MUST resolve to exactly one class, either
draft-mandated or library policy. Classification MAY be inherited from the enclosing `Rule`
block. A scenario that resolves to no class, or to both classes, MUST fail continuous
integration before any other spec step runs.

#### Scenario: Unclassified scenario fails the build

- **GIVEN** a feature file where one scenario, and its enclosing `Rule`, carry neither class tag
- **WHEN** continuous integration selects scenarios that are neither draft nor library policy
- **THEN** the selection is non-empty and the job fails naming that scenario

#### Scenario: Scenario carrying both classes fails the build

- **GIVEN** a scenario tagged as draft-mandated inside a `Rule` tagged as library policy
- **WHEN** the classification check runs
- **THEN** the job fails and reports the conflicting tags

### Requirement: Draft scenarios cite the draft section they enforce

A scenario classified as draft-mandated MUST carry the identifier of the draft section it
enforces. Library policy scenarios MUST NOT claim a draft section. The section identifier
MUST match a section that exists in the vendored draft text.

#### Scenario: Draft block names its section

- **GIVEN** a `Rule` block covering idempotency enforcement
- **WHEN** the block is classified as draft-mandated
- **THEN** it carries the section 2.6 identifier and the scenario text states the behaviour the draft requires

#### Scenario: Library policy block claims no section

- **GIVEN** a `Rule` block covering response replay or key length limits
- **WHEN** the block is classified as library policy
- **THEN** it carries no draft section identifier

#### Scenario: Scenario-level section tag fails the build

- **GIVEN** a scenario inside a library policy `Rule` that carries a draft section identifier of its own
- **WHEN** the classification check runs
- **THEN** the job fails, because a section identifier belongs on the enclosing `Rule`

### Requirement: Draft compliance is verifiable on its own

The suite MUST be runnable as two disjoint selections, draft-mandated and library policy,
whose union is every scenario. Both selections MUST pass, and the draft selection MUST be
reportable as a single pass or fail result.

#### Scenario: Draft selection runs alone

- **WHEN** continuous integration runs the suite restricted to the draft class
- **THEN** every selected scenario passes and the report states how many ran

#### Scenario: Selections are disjoint and total

- **WHEN** the draft selection and the library selection are compared with the full suite
- **THEN** the two selections share no scenario and together contain all scenarios

#### Scenario: Empty draft selection fails the build

- **GIVEN** a feature file where every `Rule` is library policy
- **WHEN** the classification check runs
- **THEN** the job fails, because the draft selection would contain no scenario and cucumber would exit zero on it

### Requirement: Classification is authored at the source of truth

The feature file in this repository MUST remain generated from its canonical upstream copy.
Classification MUST be maintained in the upstream repository, and a local edit that is not
present upstream MUST fail the consistency check.

#### Scenario: Divergent local copy fails

- **GIVEN** a local feature file whose classification differs from the upstream copy
- **WHEN** the consistency job compares the two
- **THEN** the job fails and asks for the sync command

#### Scenario: Sync restores the upstream classification

- **WHEN** the sync command runs against the upstream copy
- **THEN** the local feature file matches upstream byte for byte apart from the generated banner

### Requirement: Published compliance claims state what is traced

Any claim that the library complies with the draft MUST state how many scenarios are traced
to it, so a reader can tell traced requirements from library policy without opening the
feature file.

#### Scenario: Claim carries the traced count

- **GIVEN** the suite is classified and the draft selection passes
- **WHEN** a reader opens the README or the documentation landing page
- **THEN** the compliance statement names the draft and the number of traced scenarios
