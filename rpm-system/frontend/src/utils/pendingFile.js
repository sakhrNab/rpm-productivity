// Hands a dropped/picked File to the planner across a route change. Kept in memory
// only (a File can't survive a reload anyway); the planner takes it once on mount.
let pending = null;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const setPendingFile = (file) => { pending = file || null; };
export const takePendingFile = () => { const f = pending; pending = null; return f; };
