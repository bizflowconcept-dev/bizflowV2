export type ScannedRoute = { path: string; area: 'public' | 'auth' | 'workspace-entry' | 'company' | 'platform'; perm?: string; guarded: boolean; needsGuard: boolean; redirect?: string; pageFile?: string; pageExport?: string; index: boolean }
export type ScannedStorage = { key: string; files: string[]; kind: 'localStorage' | 'sessionStorage' }
export type SourceIndex = { generatedAt: string; sourceHash: string; files: string[]; fileCount: number; lineCount: number; routes: ScannedRoute[]; storage: ScannedStorage[] }
export function scanRoutes(root?: string): ScannedRoute[]
export function scanStorage(root?: string): ScannedStorage[]
export function scanSource(root?: string): SourceIndex
