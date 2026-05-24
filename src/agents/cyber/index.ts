import { AgentBase } from '@/agents/base';
import { runNmapScan } from './tools/network-scanner';
import { initiateBruteForce, runNetworkMonitor } from './tools/pentest-executor';
import { gatherDomainInfo } from './tools/osint';
import type { ExecutionStep } from '@/shared/types';
import { logger } from '@/shared/logger';

export class CyberAgent extends AgentBase {
  override async execute(
    step: ExecutionStep,
    _context: Record<string, unknown>,
  ): Promise<unknown> {
    logger.debug({ action: step.action, params: step.params }, 'CyberAgent.execute');

    switch (step.action) {
      case 'nmap_scan':
      case 'network_scan': {
        const target = (step.params['target'] as string) ?? '';
        const scanType = (step.params['scanType'] as 'quick' | 'full' | 'ports') ?? 'quick';
        const ports = step.params['ports'] as string | undefined;
        return runNmapScan(target, scanType, ports);
      }

      case 'run_hydra':
      case 'brute_force': {
        return initiateBruteForce({
          target: step.params['target'] as string,
          service: step.params['service'] as string,
          userList: step.params['userList'] as string,
          passList: step.params['passList'] as string,
          port: step.params['port'] as number | undefined,
        });
      }

      case 'start_bettercap':
      case 'network_monitor': {
        const iface = (step.params['interface'] as string) ?? 'eth0';
        return runNetworkMonitor(iface);
      }

      case 'gather_osint':
      case 'domain_info': {
        const domain = (step.params['domain'] as string) ?? '';
        return gatherDomainInfo(domain);
      }

      default:
        throw new Error(`CyberAgent: unknown action "${step.action}"`);
    }
  }
}
