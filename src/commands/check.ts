import { checkDoc, formatCheck, layoutHints } from '../check.js';
import { EXIT } from '../errors.js';
import { loadDiagram, type IO } from './common.js';

export function check(io: IO, file: string): number {
  const { doc, theme } = loadDiagram(io, file);
  const problems = checkDoc(doc, theme);
  for (const l of formatCheck(problems, layoutHints(doc, theme))) io.out(l);
  return problems.length ? EXIT.problems : EXIT.ok;
}
