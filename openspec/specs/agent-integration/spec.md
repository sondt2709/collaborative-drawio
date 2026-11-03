# agent-integration Specification

## Purpose
The Claude Code skill, the `dgm help` reference and the UserPromptSubmit hook: `dgm setup` installs the skill and the hook in a project, and `dgm hook run` gives the agent the changes that a person made.
## Requirements
### Requirement: Setup in a project
`dgm setup [<project-dir>]` SHALL install, in the project `.claude/` folder: the dgm skill as `.claude/skills/dgm/SKILL.md`, and a `UserPromptSubmit` hook entry in `.claude/settings.json` that runs `dgm hook run`.
The command SHALL keep all other settings and hooks, and SHALL NOT add a second dgm hook entry when one exists.
The command SHALL print the skill state: `created` when the file did not exist, `updated` when its content was different from the package skill, and `unchanged` when it was the same. It SHALL NOT write the skill file when the state is `unchanged`.

#### Scenario: Existing settings
- **WHEN** `.claude/settings.json` has a `permissions` key and another hook
- **THEN** after `dgm setup`, both are unchanged and one dgm hook entry exists

#### Scenario: Run two times
- **WHEN** the person runs `dgm setup` two times
- **THEN** `.claude/settings.json` contains one dgm hook entry, the first run prints `skill: .claude/skills/dgm/SKILL.md (created)` and the second run prints `skill: .claude/skills/dgm/SKILL.md (unchanged)`

#### Scenario: Old skill
- **WHEN** the project skill is different from the skill of the installed `dgm`
- **THEN** `dgm setup` replaces it with the package skill and prints `skill: .claude/skills/dgm/SKILL.md (updated)`

### Requirement: Hook output
`dgm hook run` SHALL read the hook input JSON from standard input, find tracked diagrams under its `cwd` (folders with `.dgm/`, at most 4 levels deep, without `node_modules` and `.git`), and run `dgm status --ack` for each.
When one or more diagrams changed, it SHALL print a short block for each changed diagram, with its path relative to `cwd`.
When `<cwd>/.claude/skills/dgm/SKILL.md` exists and its content is different from the skill of the installed `dgm`, it SHALL print one line before the diagram blocks: `dgm: .claude/skills/dgm/SKILL.md is not the skill of dgm <version>. Run \`dgm setup\` to update it.` It SHALL NOT change the skill file.
When nothing changed and the skill is current or absent, it SHALL print nothing.
The hook SHALL always exit with code 0 and SHALL finish in less than 2 seconds for 20 tracked diagrams.

#### Scenario: Human edit reaches the agent
- **WHEN** a person changed `docs/arch.drawio` and then sends a prompt in Claude Code
- **THEN** the agent context contains the `dgm status` lines for `docs/arch.drawio`

#### Scenario: No change, no context
- **WHEN** no tracked diagram changed and the project skill is current
- **THEN** the hook prints nothing

#### Scenario: Old skill reaches the agent
- **WHEN** the project skill is different from the skill of the installed `dgm`
- **THEN** the hook prints the skill line with the installed version, and the skill file is unchanged

#### Scenario: No skill installed
- **WHEN** the project has no `.claude/skills/dgm/SKILL.md`
- **THEN** the hook prints no skill line

### Requirement: Skill content
The skill SHALL tell the agent to: use `dgm show` to read a diagram, use `dgm create` and `dgm apply` to change it, never read or write `.drawio` XML directly, never write colors, keep edge labels short, use `dgm export` to give the person a PNG, and use `dgm help <topic>` for the full YAML reference. The skill SHALL use the ASD-STE100 writing rules and SHALL be less than 4,500 characters.

#### Scenario: Skill size
- **WHEN** the package is built
- **THEN** `skill/SKILL.md` has fewer than 4,500 characters

### Requirement: Help topics
`dgm help <topic>` SHALL print the reference for the topics `yaml` (nodes, kinds, tones, variants, icons, style, rows), `edges` (ports, via, route, edge kinds, labels) and `apply` (operations and their order). An unknown topic SHALL list the topics and give exit code 2.

#### Scenario: Edge reference
- **WHEN** the agent runs `dgm help edges`
- **THEN** the output lists the ports `t r b l`, the via items, the routes and the edge kinds

