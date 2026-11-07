// Polyfill Blob.prototype.arrayBuffer and text for jsdom test environments
if (typeof Blob !== 'undefined') {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
      if (this.size === 0) {
        return Promise.resolve(new ArrayBuffer(0));
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
  if (!Blob.prototype.text) {
    Blob.prototype.text = function (this: Blob): Promise<string> {
      if (this.size === 0) {
        return Promise.resolve('');
      }
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
}
if (typeof File !== 'undefined') {
  if (!File.prototype.arrayBuffer && typeof Blob !== 'undefined') {
    File.prototype.arrayBuffer = Blob.prototype.arrayBuffer;
  }
  if (!File.prototype.text && typeof Blob !== 'undefined') {
    File.prototype.text = Blob.prototype.text;
  }
}

export interface MockFileEntry {
  kind: 'file';
  name: string;
  content?: string | Uint8Array;
  lastModified?: number;
}

export interface MockDirectoryEntry {
  kind: 'directory';
  name: string;
  entries: (MockFileEntry | MockDirectoryEntry)[];
}

export function createMockFileHandle(entry: MockFileEntry): FileSystemFileHandle {
  const content = entry.content;
  const blobParts: BlobPart[] =
    typeof content === 'string'
      ? [content]
      : content instanceof Uint8Array
        ? [content.buffer as ArrayBuffer]
        : [''];
  const file = new File(blobParts, entry.name, {
    lastModified: entry.lastModified ?? 1730700000000, // 2026-11-04T06:00:00Z
  });

  return {
    kind: 'file',
    name: entry.name,
    getFile: async () => file,
    isSameEntry: async (other: FileSystemHandle) =>
      other.name === entry.name && other.kind === 'file',
  } as unknown as FileSystemFileHandle;
}

export function createMockDirectoryHandle(
  name: string,
  entries: (MockFileEntry | MockDirectoryEntry)[]
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const e of entries) {
        if (e.kind === 'file') {
          yield createMockFileHandle(e);
        } else {
          yield createMockDirectoryHandle(e.name, e.entries);
        }
      }
    },
    async *entries() {
      for (const e of entries) {
        if (e.kind === 'file') {
          yield [e.name, createMockFileHandle(e)] as [string, FileSystemFileHandle];
        } else {
          yield [e.name, createMockDirectoryHandle(e.name, e.entries)] as [
            string,
            FileSystemDirectoryHandle,
          ];
        }
      }
    },
    getFileHandle: async (fileName: string) => {
      const found = entries.find((e) => e.kind === 'file' && e.name === fileName);
      if (!found || found.kind !== 'file') {
        throw new Error(`NotFoundError: File ${fileName} not found`);
      }
      return createMockFileHandle(found);
    },
    getDirectoryHandle: async (dirName: string) => {
      const found = entries.find((e) => e.kind === 'directory' && e.name === dirName);
      if (!found || found.kind !== 'directory') {
        throw new Error(`NotFoundError: Directory ${dirName} not found`);
      }
      return createMockDirectoryHandle(found.name, found.entries);
    },
    isSameEntry: async (other: FileSystemHandle) =>
      other.name === name && other.kind === 'directory',
  } as unknown as FileSystemDirectoryHandle;
}
