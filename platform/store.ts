import { appendFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { resolveInside } from './security.ts';

export class AlreadyExistsError extends Error {
  override name = 'AlreadyExistsError';
}

const RENAME_RETRIES = 6;

/**
 * File-based persistence for a single server process.
 * - JSON state files are replaced atomically (temp file + rename).
 * - Immutable artifacts (versions, approvals) are created with O_EXCL and never rewritten.
 * - Read-modify-write and appends go through a per-file queue so concurrent requests inside
 *   this process do not lose updates. Several server processes sharing one workspace are not supported.
 */
export class WorkspaceStore {
  readonly root: string;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  resolve(...segments: string[]): string {
    return resolveInside(this.root, ...segments);
  }

  async ensureDir(...segments: string[]): Promise<string> {
    const dir = this.resolve(...segments);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async exists(...segments: string[]): Promise<boolean> {
    try {
      await stat(this.resolve(...segments));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async readText(...segments: string[]): Promise<string | null> {
    try {
      return await readFile(this.resolve(...segments), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readJson<T>(...segments: string[]): Promise<T | null> {
    const text = await this.readText(...segments);
    return text === null ? null : (JSON.parse(text) as T);
  }

  async writeJson(segments: string[], data: unknown): Promise<void> {
    await this.serialize(this.resolve(...segments), () => this.atomicWrite(segments, `${JSON.stringify(data, null, 2)}\n`));
  }

  async update<T>(segments: string[], mutate: (current: T | null) => T | Promise<T>): Promise<T> {
    return this.serialize(this.resolve(...segments), async () => {
      const next = await mutate(await this.readJson<T>(...segments));
      await this.atomicWrite(segments, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }

  /** Creates a file that must never be overwritten. */
  async createExclusive(segments: string[], content: string | Buffer): Promise<void> {
    const file = this.resolve(...segments);
    await mkdir(path.dirname(file), { recursive: true });
    let handle;
    try {
      handle = await open(file, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new AlreadyExistsError(`${segments.join('/')} ya existe y es inmutable.`);
      throw error;
    }
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async appendJsonLine(segments: string[], entry: unknown): Promise<void> {
    const file = this.resolve(...segments);
    await this.serialize(file, async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
    });
  }

  /**
   * Reads a JSONL file written by a single writer. A truncated or corrupt line (for
   * example after a crash mid-write) is skipped and reported; valid entries are kept.
   */
  async readJsonLines<T>(...segments: string[]): Promise<{ entries: T[]; corruptLines: number[] }> {
    const text = await this.readText(...segments);
    if (text === null) return { entries: [], corruptLines: [] };
    const entries: T[] = [];
    const corruptLines: number[] = [];
    text.split('\n').forEach((line, index) => {
      if (!line.trim()) return;
      try {
        entries.push(JSON.parse(line) as T);
      } catch {
        corruptLines.push(index + 1);
      }
    });
    return { entries, corruptLines };
  }

  async listDirs(...segments: string[]): Promise<string[]> {
    try {
      const items = await readdir(this.resolve(...segments), { withFileTypes: true });
      return items.filter((item) => item.isDirectory()).map((item) => item.name).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async listFiles(...segments: string[]): Promise<string[]> {
    try {
      const items = await readdir(this.resolve(...segments), { withFileTypes: true });
      return items.filter((item) => item.isFile()).map((item) => item.name).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async remove(...segments: string[]): Promise<void> {
    await rm(this.resolve(...segments), { recursive: true, force: true });
  }

  private async atomicWrite(segments: string[], content: string): Promise<void> {
    const file = this.resolve(...segments);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temp, content, 'utf8');
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(temp, file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // Windows refuses to replace a file that another handle is reading at that instant.
        if (attempt >= RENAME_RETRIES || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) {
          await rm(temp, { force: true });
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
      }
    }
  }

  private serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch(() => undefined);
    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return next;
  }
}
