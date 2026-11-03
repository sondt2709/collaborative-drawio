# agent-integration Specification

## Purpose
The Claude Code skill and the UserPromptSubmit hook: `dgm setup` installs them in a project, and `dgm hook run` gives the agent the changes that a person made.
## Requirements
### Requirement: Setup in a project
`dgm setup [<project-dir>]` SHALL install, in the project `.claude/` folder: the dgm skill as `.claude/skills/dgm/SKILL.md`, and a `UserPromptSubmit` hook entry in `.claude/settings.json` that runs `dgm hook run`.
The command SHALL keep all other settings and hooks, and SHALL NOT add a second dgm hook entry when one exists.

#### Scenario: Existing settings
- **WHEN** `.claude/settings.json` has a `permissions` key and another hook
- **THEN** after `dgm setup`, both are unchanged and one dgm hook entry exists

#### Scenario: Run two times
- **WHEN** the person runs `dgm setup` two times
- **THEN** `.claude/settings.json` contains one dgm hook entry

### Requirement: Hook output
`dgm hook run` SHALL read the hook input JSON from standard input, find tracked diagrams under its `cwd` (folders with `.dgm/`, at most 4 levels deep, without `node_modules` and `.git`), and run `dgm status --ack` for each.
When one or more diagrams changed, it SHALL print a short block for each changed diagram, with its path relative to `cwd`. When nothing changed, it SHALL print nothing.
The hook SHALL always exit with code 0 and SHALL finish in less than 2 seconds for 20 tracked diagrams.

#### Scenario: Human edit reaches the agent
- **WHEN** a person changed `docs/arch.drawio` and then sends a prompt in Claude Code
- **THEN** the agent context contains the `dgm status` lines for `docs/arch.drawio`

#### Scenario: No change, no context
- **WHEN** no tracked diagram changed
- **THEN** the hook prints nothing

### Requirement: Skill content
The skill SHALL tell the agent to: use `dgm show` to read a diagram, use `dgm create` and `dgm apply` to change it, never read or write `.drawio` XML directly, never write colors, and use the YAML format with the list of kinds, tones, variants and edge kinds. The skill SHALL be less than 6,000 characters.

#### Scenario: Skill size
- **WHEN** the package is built
- **THEN** `skill/SKILL.md` has fewer than 6,000 characters

