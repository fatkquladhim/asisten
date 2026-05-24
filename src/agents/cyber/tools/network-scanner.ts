import { runCommand } from '../utils/exec';
import { logger } from '@/shared/logger';

const IP_CIDR_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\/(?:[12]\d|3[0-2]|[1-9]))?$/;
const HOSTNAME_REGEX =
  /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})$/;

export interface NmapPort {
  port: number;
  protocol: string;
  state: string;
  service: string;
  version?: string;
}

export interface NmapResult {
  target: string;
  scanType: string;
  command: string;
  ports: NmapPort[];
  rawOutput: string;
}

function validateTarget(target: string): void {
  if (!IP_CIDR_REGEX.test(target) && !HOSTNAME_REGEX.test(target)) {
    throw new Error(
      `Invalid target "${target}". Must be a valid IP, CIDR range, or hostname.`,
    );
  }
}

function parseNmapGreppable(stdout: string): NmapPort[] {
  const ports: NmapPort[] = [];
  const lines = stdout.split('\n');

  for (const line of lines) {
    const portMatch = line.match(
      /^(\d+)\/(tcp|udp)\/(open|filtered|closed)\/{2}([\w-]+)\/?\s*(.*)$/,
    );
    if (portMatch) {
      ports.push({
        port: parseInt(portMatch[1]!, 10),
        protocol: portMatch[2]!,
        state: portMatch[3]!,
        service: portMatch[4]!,
        version: portMatch[5]?.trim() || undefined,
      });
    }
  }

  return ports;
}

export async function runNmapScan(
  target: string,
  scanType: 'quick' | 'full' | 'ports' = 'quick',
  ports?: string,
): Promise<NmapResult> {
  validateTarget(target);

  const flagsMap: Record<string, string[]> = {
    quick: ['-T4', '-F'],
    full: ['-T4', '-p-', '-sV'],
    ports: ['-T4', '-sV'],
  };

  const flags = [...flagsMap[scanType]!];

  if (scanType === 'ports' && ports) {
    flags.push('-p', ports);
  }

  const args = [...flags, '-oG', '-', target];

  logger.info({ target, scanType, args }, 'Starting Nmap scan');

  const { stdout } = await runCommand('nmap', args, 300000);

  const ports_ = parseNmapGreppable(stdout);

  logger.info(
    { target, openPorts: ports_.filter((p) => p.state === 'open').length },
    'Nmap scan completed',
  );

  return {
    target,
    scanType,
    command: `nmap ${args.join(' ')}`,
    ports: ports_,
    rawOutput: stdout,
  };
}
