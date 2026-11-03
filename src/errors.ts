/** Exit codes of the dgm command line tool. */
export const EXIT = {
  ok: 0,
  problems: 1,
  invalid: 2,
  drawio: 3,
} as const;

/** An error that the CLI prints and turns into an exit code. */
export class DgmError extends Error {
  constructor(
    message: string,
    public readonly code: number = EXIT.invalid,
  ) {
    super(message);
  }
}

/** Invalid input. Each line names the YAML path of one problem. */
export class ValidationError extends DgmError {
  constructor(public readonly problems: string[]) {
    super(problems.join('\n'), EXIT.invalid);
  }
}
