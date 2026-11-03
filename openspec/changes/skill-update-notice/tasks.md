## 1. Setup

- [x] 1.1 Test: `dgm setup` prints `(created)`, then `(unchanged)`, then `(updated)` after the skill file changes; fails on the base
- [x] 1.2 Compare the project skill with the package skill in `setup()`; write and print the state

## 2. Hook

- [x] 2.1 Test: `dgm hook run` prints the skill line for an old skill, keeps the file, and prints nothing for a current or absent skill; fails on the base
- [x] 2.2 Print the skill line in `hookRun()` before the diagram blocks

## 3. Verification

- [x] 3.1 `npm run typecheck`, `npm run build` and `npm test` pass
- [x] 3.2 The built CLI in a temporary project shows `created`, `unchanged`, `updated` and the hook line
- [ ] 3.3 `scripts/scan-sensitive.sh` passes; CI passes on the pull request
