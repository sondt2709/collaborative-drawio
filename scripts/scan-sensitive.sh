#!/usr/bin/env bash
# Scan files for personal or sensitive data before they leave this machine.
#
# Usage:
#   scripts/scan-sensitive.sh                 scan tracked, staged and untracked (not ignored) files
#   scripts/scan-sensitive.sh <base> <head>   scan files changed between two commits, at <head>
#   (the pre-push hook in .githooks/ calls the second form for each pushed ref)
#
# Checks:
#   1. Absolute home paths (/Users/<name>, /home/<name>, C:\Users\<name>).
#   2. Email addresses, except noreply and example.com addresses.
#   3. Secrets: cloud keys, tokens, private keys.
#   4. draw.io files that carry a browser user agent or a non-generic host.
#   5. Words from the local denylists (company, client and project names):
#        tmp/sensitive-denylist.txt
#        ~/.config/dgm/sensitive-denylist.txt
#
# Exit code 1 when it finds something. The scan does not replace a human read of
# non-code files (Markdown, YAML, .drawio): read their full diff before a push.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
EMPTY_TREE="$(git hash-object -t tree /dev/null)"

BASE="${1:-}"
HEAD_REF="${2:-}"

list_files() {
  if [[ -n "$HEAD_REF" ]]; then
    local base="$BASE"
    if [[ -z "$base" || "$base" =~ ^0+$ ]]; then base="$EMPTY_TREE"; fi
    git diff --name-only --diff-filter=ACMR "$base" "$HEAD_REF"
  else
    { git ls-files; git ls-files --others --exclude-standard; git diff --cached --name-only --diff-filter=ACMR; } | sort -u
  fi
}

read_file() {
  if [[ -n "$HEAD_REF" ]]; then git show "$HEAD_REF:$1" 2>/dev/null || true; else cat "$1" 2>/dev/null || true; fi
}

DENY=""
for f in "$ROOT/tmp/sensitive-denylist.txt" "$HOME/.config/dgm/sensitive-denylist.txt"; do
  if [[ -f "$f" ]]; then
    words="$(grep -vE '^\s*(#|$)' "$f" | sed 's/[][\.*^$/]/\\&/g' | paste -sd'|' - || true)"
    if [[ -n "$words" ]]; then DENY="${DENY:+$DENY|}$words"; fi
  fi
done

PATH_RE='(/Users/|/home/)[A-Za-z0-9._-]+|[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+'
PATH_OK='(/Users/|/home/)(you|me|user|username|runner|name|example|<[^>]*>)([^A-Za-z0-9._-]|$)'
EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
EMAIL_OK='noreply@|no-reply@|@example\.(com|org)|@users\.noreply\.github\.com'
SECRET_RE='AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
DRAWIO_RE='agent="[^"]*(Mozilla|Electron|Macintosh|Windows NT)|host="(Electron|app\.diagrams\.net|embed\.diagrams\.net)"'

found=0
report() { echo "  $1:$2: $3"; found=1; }

SELF="scripts/scan-sensitive.sh"
while IFS= read -r file; do
  [[ -z "$file" || "$file" == "$SELF" ]] && continue
  # Skip binary files: grep -I treats them as not matching.
  read_file "$file" | grep -Iq . || continue
  content="$(read_file "$file")"

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    n="${hit%%:*}"; line="${hit#*:}"
    if [[ "$line" =~ $PATH_RE ]] && ! printf '%s' "$line" | grep -qE "$PATH_OK"; then
      report "$file" "$n" "home path: ${BASH_REMATCH[0]}"
    fi
  done < <(printf '%s\n' "$content" | grep -nE "$PATH_RE" || true)

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    n="${hit%%:*}"
    for m in $(printf '%s\n' "${hit#*:}" | grep -oE "$EMAIL_RE"); do
      printf '%s' "$m" | grep -qE "$EMAIL_OK" || report "$file" "$n" "email: $m"
    done
  done < <(printf '%s\n' "$content" | grep -nE "$EMAIL_RE" || true)

  while IFS= read -r hit; do
    [[ -n "$hit" ]] && report "$file" "${hit%%:*}" "possible secret"
  done < <(printf '%s\n' "$content" | grep -nE "$SECRET_RE" || true)

  if [[ "$file" == *.drawio || "$file" == *.drawio.svg || "$file" == *.xml ]]; then
    while IFS= read -r hit; do
      [[ -n "$hit" ]] && report "$file" "${hit%%:*}" "draw.io file carries app or browser metadata (host/agent)"
    done < <(printf '%s\n' "$content" | grep -noE "$DRAWIO_RE" || true)
  fi

  if [[ -n "$DENY" ]]; then
    while IFS= read -r hit; do
      [[ -z "$hit" ]] && continue
      word="$(printf '%s\n' "${hit#*:}" | grep -ioE "$DENY" | head -1)"
      report "$file" "${hit%%:*}" "denylisted word: $word"
    done < <(printf '%s\n' "$content" | grep -niE "$DENY" || true)
  fi
done < <(list_files)

if [[ "$found" == 1 ]]; then
  echo "scan-sensitive: FAILED. Remove the items above, or replace them with generic examples."
  exit 1
fi
if [[ -z "$DENY" ]]; then
  echo "scan-sensitive: passed (warning: no denylist found; company and project names were not checked)"
else
  echo "scan-sensitive: passed"
fi
