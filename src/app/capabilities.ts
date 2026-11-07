/**
 * Detects whether the browser environment supports the File System Access API
 * (specifically window.showDirectoryPicker for local directory selection).
 *
 * Safely guards against non-browser (SSR/Node) environments, missing properties,
 * and throwing property accessors (e.g. SecurityError in restricted iframes,
 * enterprise browser policies, or throwing property descriptors).
 */
export function isFileSystemAccessSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return (
      'showDirectoryPicker' in window &&
      typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
    );
  } catch {
    // Treat any property access or security exception as unsupported
    return false;
  }
}
