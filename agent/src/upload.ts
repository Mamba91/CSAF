export interface DiscoveredDeviceUpload {
  ip_address: string;
  mac_address?: string;
  hostname?: string;
  sys_descr?: string;
  sys_object_id?: string;
  vendor_guess?: string;
}

async function apiFetch(apiUrl: string, path: string, options: RequestInit = {}) {
  const res = await fetch(apiUrl.replace(/\/+$/, '') + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status} sur ${path}`);
  return data;
}

/** Authentifie l'agent auprès du backend (même endpoint que la connexion utilisateur) et retourne le JWT. */
export async function login(apiUrl: string, username: string, password: string): Promise<string> {
  const data = await apiFetch(apiUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!data?.token) throw new Error('réponse de connexion invalide (pas de token)');
  return data.token as string;
}

/** Envoie les résultats d'un scan au backend. Retourne le scan créé (avec son id). */
export async function uploadScan(
  apiUrl: string,
  token: string,
  ipRange: string,
  label: string,
  devices: DiscoveredDeviceUpload[]
) {
  return apiFetch(apiUrl, '/network-discovery/scans', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ label, ip_range: ipRange, devices }),
  });
}
