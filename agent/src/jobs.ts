import { randomUUID } from 'node:crypto';

export interface ScanJob {
  id: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  range: string;
  total: number;
  scanned: number;
  found: number;
  error?: string;
  scanId?: number;
  createdAt: number;
  cancelRequested?: boolean;
}

const jobs = new Map<string, ScanJob>();

// Purge les jobs terminés depuis plus de 30 min pour éviter une fuite mémoire sur un agent laissé en tâche de fond.
const MAX_AGE_MS = 30 * 60 * 1000;
function purgeOld() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.createdAt > MAX_AGE_MS) jobs.delete(id);
  }
}

export function createJob(range: string): ScanJob {
  purgeOld();
  const job: ScanJob = { id: randomUUID(), status: 'running', range, total: 0, scanned: 0, found: 0, createdAt: Date.now() };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): ScanJob | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<ScanJob>) {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}

export function cancelJob(id: string) {
  const job = jobs.get(id);
  if (job && job.status === 'running') job.cancelRequested = true;
}

export function isCancelRequested(id: string): boolean {
  return jobs.get(id)?.cancelRequested === true;
}
