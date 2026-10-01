// Hands a dropped/picked File to the planner across a route change. Kept in memory
// only (a File can't survive a reload anyway); the planner takes it once on mount.
import { prepareUpload } from './uploadPrep';

let pending = null;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const setPendingFile = (file) => { pending = file || null; };
export const takePendingFile = () => { const f = pending; pending = null; return f; };

// Picked/dropped file → a File that is safe to send (photos are converted + shrunk first)
// or null after telling the user why not. `toast(message, 'error')` is useToast's showToast.
export async function acceptFile(file, toast) {
  if (!file) return null;
  let f;
  try { f = await prepareUpload(file); }
  catch (e) { toast(e.message || 'Could not read that file.', 'error'); return null; }
  if (f.size > MAX_UPLOAD_BYTES) { toast('That file is over 10 MB.', 'error'); return null; }
  return f;
}
