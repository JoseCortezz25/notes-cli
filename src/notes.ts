// Notes kept in a JSON file. Pure functions take and return note lists; only load/save touch disk.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface Note {
  id: number;
  text: string;
  created: string; // ISO date, YYYY-MM-DD
  tags?: string[];
}

export class NotesError extends Error {}

export function loadNotes(file: string): Note[] {
  if (!existsSync(file)) return [];
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(data)) throw new NotesError(`${file} does not hold a list of notes`);
  return data as Note[];
}

export function saveNotes(file: string, notes: Note[]): void {
  writeFileSync(file, JSON.stringify(notes, null, 2) + "\n");
}

export function normalizeTag(tag: string): string {
  const clean = tag.trim().toLowerCase();
  if (!clean) throw new NotesError("a tag cannot be empty");
  if (/[\s,]/.test(clean)) throw new NotesError(`invalid tag "${clean}": no spaces or commas`);
  return clean;
}

function tagsOf(note: Note): string[] {
  return Array.isArray(note.tags) ? note.tags : [];
}

export function addNote(notes: Note[], text: string, today: string, tags: string[] = []): Note[] {
  const clean = text.trim();
  if (!clean) throw new NotesError("a note needs some text");
  const id = notes.reduce((max, n) => Math.max(max, n.id), 0) + 1;
  const note: Note = { id, text: clean, created: today };
  if (tags.length > 0) note.tags = [...new Set(tags.map(normalizeTag))];
  return [...notes, note];
}

export function filterByTag(notes: Note[], tag: string): Note[] {
  const wanted = normalizeTag(tag);
  return notes.filter((n) => tagsOf(n).includes(wanted));
}

export function deleteNote(notes: Note[], id: number): Note[] {
  if (!notes.some((n) => n.id === id)) throw new NotesError(`no note with id ${id}`);
  return notes.filter((n) => n.id !== id);
}

function formatNote(n: Note): string {
  const tags = tagsOf(n);
  const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  return `${n.id}. ${n.text} (${n.created})${suffix}`;
}

export function formatList(notes: Note[], tag?: string): string {
  const wanted = tag === undefined ? undefined : normalizeTag(tag);
  if (notes.length === 0) return "No notes yet.";
  if (wanted === undefined) return notes.map(formatNote).join("\n");
  const shown = filterByTag(notes, wanted);
  if (shown.length === 0) return `No notes with tag ${wanted}.`;
  return shown.map(formatNote).join("\n");
}
