import snmp from 'net-snmp';

export interface SnmpResult {
  ip_address: string;
  hostname: string;
  sys_descr: string;
  sys_object_id: string;
}

const OID_SYS_DESCR = '1.3.6.1.2.1.1.1.0';
const OID_SYS_NAME = '1.3.6.1.2.1.1.5.0';
const OID_SYS_OBJECT_ID = '1.3.6.1.2.1.1.2.0';

function trySnmpGet(ip: string, community: string, version: any, timeout: number): Promise<SnmpResult | null> {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, { version, timeout, retries: 0 });
    session.on('error', () => resolve(null));
    session.get([OID_SYS_DESCR, OID_SYS_NAME, OID_SYS_OBJECT_ID], (error: any, varbinds?: any[]) => {
      session.close();
      if (error || !varbinds) return resolve(null);
      const values: Record<string, string> = {};
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue;
        values[vb.oid] = vb.value?.toString?.() ?? String(vb.value);
      }
      if (!values[OID_SYS_DESCR] && !values[OID_SYS_NAME]) return resolve(null);
      resolve({
        ip_address: ip,
        hostname: values[OID_SYS_NAME] || '',
        sys_descr: values[OID_SYS_DESCR] || '',
        sys_object_id: values[OID_SYS_OBJECT_ID] || '',
      });
    });
  });
}

/** Interroge un hôte en SNMPv2c, avec repli SNMPv1 si le premier échoue (matériel OT ancien). */
export async function snmpProbe(ip: string, community: string, timeout: number): Promise<SnmpResult | null> {
  const v2c = await trySnmpGet(ip, community, snmp.Version2c, timeout);
  if (v2c) return v2c;
  return trySnmpGet(ip, community, snmp.Version1, timeout);
}
