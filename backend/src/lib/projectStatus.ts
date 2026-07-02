export function deriveProjectStatus(total: number, treated: number, inProgress: number): string {
  if (total === 0) return 'sain';
  if (treated >= total) return 'traite';
  if (treated > 0 || inProgress > 0) return 'en_cours';
  return 'a_traiter';
}
