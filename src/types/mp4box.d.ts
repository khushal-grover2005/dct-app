declare module 'mp4box' {
  export interface MP4MediaInfo {
    hasMoov: boolean;
    duration: number;
    timescale: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    created: Date;
    modified: Date;
    tracks: unknown[];
  }

  export interface MP4File {
    onReady?: (info: MP4MediaInfo) => void;
    onError?: (e: string) => void;
    appendBuffer(data: ArrayBuffer): number;
    flush(): void;
    start(): void;
    stop(): void;
  }

  export function createFile(): MP4File;

  const MP4Box: {
    createFile: () => MP4File;
  };

  export default MP4Box;
}
