import { promises as dns } from 'node:dns';
import { logger } from '@/shared/logger';

const HOSTNAME_REGEX =
  /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})$/;

export interface DnsRecord {
  type: string;
  value: string;
  ttl?: number;
}

export interface HttpHeaders {
  server?: string;
  contentType?: string;
  poweredBy?: string;
  location?: string;
  statusCode: number;
}

export interface DomainInfo {
  domain: string;
  resolved: boolean;
  ipAddresses: string[];
  dnsRecords: DnsRecord[];
  httpHeaders: HttpHeaders | null;
  error?: string;
}

export async function gatherDomainInfo(domain: string): Promise<DomainInfo> {
  if (!HOSTNAME_REGEX.test(domain)) {
    return {
      domain,
      resolved: false,
      ipAddresses: [],
      dnsRecords: [],
      httpHeaders: null,
      error: `Invalid domain format: ${domain}`,
    };
  }

  logger.info({ domain }, 'Gathering OSINT domain info');

  const ipAddresses: string[] = [];
  const dnsRecords: DnsRecord[] = [];

  try {
    const addresses = await dns.resolve4(domain);
    ipAddresses.push(...addresses);
  } catch {
    logger.debug({ domain }, 'No IPv4 records found');
  }

  try {
    const addresses6 = await dns.resolve6(domain);
    ipAddresses.push(...addresses6);
  } catch {
    logger.debug({ domain }, 'No IPv6 records found');
  }

  const recordTypes: (keyof dns.Resolver)[] = [
    'resolveMx',
    'resolveNs',
    'resolveTxt',
    'resolveCname',
  ];

  for (const method of recordTypes) {
    try {
      const records = await (dns as any)[method](domain);
      const typeLabel = method.replace('resolve', '').toUpperCase();

      if (Array.isArray(records)) {
        for (const record of records) {
          if (typeof record === 'object' && record !== null) {
            dnsRecords.push({ type: typeLabel, value: JSON.stringify(record) });
          } else {
            dnsRecords.push({ type: typeLabel, value: String(record) });
          }
        }
      }
    } catch {
      // Record type not available, skip
    }
  }

  let httpHeaders: HttpHeaders | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
    });

    clearTimeout(timeout);

    httpHeaders = {
      statusCode: response.status,
      server: response.headers.get('server') ?? undefined,
      contentType: response.headers.get('content-type') ?? undefined,
      poweredBy: response.headers.get('x-powered-by') ?? undefined,
      location: response.headers.get('location') ?? undefined,
    };
  } catch (err) {
    logger.debug({ domain, error: (err as Error).message }, 'HTTP HEAD request failed');
  }

  logger.info(
    { domain, ipCount: ipAddresses.length, recordCount: dnsRecords.length },
    'OSINT domain info gathered',
  );

  return {
    domain,
    resolved: ipAddresses.length > 0,
    ipAddresses,
    dnsRecords,
    httpHeaders,
  };
}
