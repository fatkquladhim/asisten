import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '@/shared/logger';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function escapeShellArg(arg: string): string {
  if (/^[a-zA-Z0-9_./@:-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs = 120000,
): Promise<ExecResult> {
  const escapedArgs = args.map(escapeShellArg);

  logger.info(
    { command, argCount: args.length, timeoutMs },
    'Executing command',
  );

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr) {
      logger.warn({ command, stderr: stderr.slice(0, 500) }, 'Command stderr output');
    }

    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    const exitCode = error.code ?? null;
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';

    if (exitCode === null) {
      logger.error(
        { command, error: error.message },
        'Command failed to execute',
      );
      throw new Error(`Command execution failed: ${error.message}`);
    }

    logger.warn(
      { command, exitCode, stderr: stderr.slice(0, 500) },
      'Command completed with non-zero exit code',
    );

    return { stdout, stderr, exitCode };
  }
}
