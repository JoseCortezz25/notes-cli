// notes add <text> | notes list | notes delete <id>. Run with: node src/cli.ts <command>
import { addNote, deleteNote, formatList, loadNotes, NotesError, saveNotes } from "./notes.ts";

export interface Result {
  code: number;
  out: string;
}

const USAGE = "usage: notes add [--tag <tag>]... <text> | notes list [--tag <tag>] | notes delete <id>";

function parseTags(args: string[]): { words: string[]; tags: string[] } {
  const words: string[] = [];
  const tags: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--tag") {
      words.push(args[i]);
      continue;
    }
    if (i + 1 >= args.length) throw new NotesError("--tag needs a value");
    tags.push(args[++i]);
  }
  return { words, tags };
}

export function run(argv: string[], file: string, today: string): Result {
  const [command, ...rest] = argv;
  try {
    const notes = loadNotes(file);
    if (command === "add") {
      const { words, tags } = parseTags(rest);
      const next = addNote(notes, words.join(" "), today, tags);
      saveNotes(file, next);
      return { code: 0, out: `Added note ${next[next.length - 1].id}.` };
    }
    if (command === "list") {
      const { tags } = parseTags(rest);
      if (tags.length > 1) throw new NotesError("list accepts a single --tag");
      return { code: 0, out: formatList(notes, tags[0]) };
    }
    if (command === "delete") {
      saveNotes(file, deleteNote(notes, Number(rest[0])));
      return { code: 0, out: `Deleted note ${rest[0]}.` };
    }
    return { code: 2, out: USAGE };
  } catch (err) {
    if (err instanceof NotesError || err instanceof SyntaxError) return { code: 1, out: `error: ${err.message}` };
    throw err;
  }
}

if (import.meta.main) {
  const result = run(process.argv.slice(2), process.env.NOTES_FILE ?? "notes.json", new Date().toISOString().slice(0, 10));
  console.log(result.out);
  process.exitCode = result.code;
}
