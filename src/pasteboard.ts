import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PBHELPER = join(__dirname, "..", "build", "pbhelper");

interface ExecResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number;
}

function execPbHelper(args: string[], stdinData?: string | Buffer): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PBHELPER, args);
    const stdoutChunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("error", (err) => reject(new Error(`Failed to spawn pbhelper: ${err.message}`)));

    proc.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr,
        exitCode: code ?? 1,
      });
    });

    if (stdinData !== undefined) {
      proc.stdin.write(stdinData);
    }
    proc.stdin.end();
  });
}

function pbArgs(pasteboard?: string): string[] {
  return pasteboard ? ["--pasteboard", pasteboard] : [];
}

function checkResult(result: ExecResult): void {
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `pbhelper exited with code ${result.exitCode}`);
  }
}

export async function listTypes(pasteboard?: string): Promise<string[]> {
  const result = await execPbHelper(["list-types", ...pbArgs(pasteboard)]);
  checkResult(result);
  return JSON.parse(result.stdout.toString());
}

export async function readText(pasteboard?: string): Promise<string> {
  const result = await execPbHelper(["read-text", ...pbArgs(pasteboard)]);
  checkResult(result);
  return result.stdout.toString();
}

export async function writeText(text: string, pasteboard?: string): Promise<void> {
  const result = await execPbHelper(["write-text", ...pbArgs(pasteboard)], text);
  checkResult(result);
}

export async function readImage(pasteboard?: string, format: string = "png"): Promise<string> {
  const result = await execPbHelper(["read-image", "--format", format, ...pbArgs(pasteboard)]);
  checkResult(result);
  return result.stdout.toString();
}

export async function writeImage(base64Data: string, pasteboard?: string, format: string = "png"): Promise<void> {
  const result = await execPbHelper(["write-image", "--format", format, ...pbArgs(pasteboard)], base64Data);
  checkResult(result);
}

export async function readData(type: string, pasteboard?: string): Promise<string> {
  const result = await execPbHelper(["read", "--type", type, ...pbArgs(pasteboard)]);
  checkResult(result);
  return result.stdout.toString();
}

export async function writeData(type: string, data: string, isBase64: boolean, pasteboard?: string): Promise<void> {
  const args = ["write", "--type", type, ...(isBase64 ? ["--base64"] : []), ...pbArgs(pasteboard)];
  const result = await execPbHelper(args, data);
  checkResult(result);
}

export async function clear(pasteboard?: string): Promise<void> {
  const result = await execPbHelper(["clear", ...pbArgs(pasteboard)]);
  checkResult(result);
}
