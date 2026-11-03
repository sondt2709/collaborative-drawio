## Why

`dgm setup` always copies the package skill to `.claude/skills/dgm/SKILL.md`, but its output is the same line each time. The person cannot see if the skill changed. After `npm update -g collaborative-drawio`, nothing tells the person or the agent that the project skill is old, so the agent can use old rules.

## What Changes

- `dgm setup` prints the skill state: `created`, `updated` or `unchanged`. It writes the file only when the content is different.
- `dgm hook run` compares the project skill with the skill of the installed `dgm`. When they are different, it prints one line that tells the agent to run `dgm setup`. It does not change the file.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `agent-integration`: `dgm setup` reports the skill state; `dgm hook run` reports an old project skill.

## Impact

- `src/commands/setup.ts`, `tests/setup-hook.test.ts`.
- No new dependency. The hook reads two more small files.
