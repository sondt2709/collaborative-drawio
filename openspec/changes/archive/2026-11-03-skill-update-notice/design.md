## Context

`setup()` in `src/commands/setup.ts` runs `copyFileSync` from `<package>/skill/SKILL.md` to `<project>/.claude/skills/dgm/SKILL.md` and prints `skill: .claude/skills/dgm/SKILL.md`. `hookRun()` reports only diagram changes. The package version is in `<package>/package.json`.

## Goals / Non-Goals

**Goals:**
- The person sees if `dgm setup` changed the skill.
- The agent learns that the project skill is not the skill of the installed `dgm`.

**Non-Goals:**
- Protect local edits to the project skill. dgm owns this file.
- Update the skill from the hook.

## Decisions

1. **Compare the full content.** The project skill is old when its bytes are different from the package skill. Alternative: a version marker in `SKILL.md`; rejected because it adds text to the skill and a person can edit the marker.
2. **The hook only reports.** The hook prints `dgm: .claude/skills/dgm/SKILL.md is not the skill of dgm <version>. Run \`dgm setup\` to update it.` A hook that changes files in the repository with no action from the person is a surprise.
3. **Only when the skill exists.** A project without `.claude/skills/dgm/SKILL.md` gets no line, because the person did not install the skill there.
4. **Skill line first.** The skill line comes before the diagram blocks. The hook still exits with code 0 for all errors.

## Risks / Trade-offs

- [The line shows on each prompt until the person runs `dgm setup`] → This is intended: the line is short, and the agent can run `dgm setup`.
- [A person who edits the skill on purpose sees the line on each prompt] → Accepted; editing the generated skill is not supported.
