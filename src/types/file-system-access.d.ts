export {};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
      id?: string;
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}
