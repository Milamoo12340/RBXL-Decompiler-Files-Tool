import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export interface ParsedScript {
  instance_id: number;
  name: string;
  class: string;
  path: string;
  source?: string;
  preview?: string;
  size: number;
  is_bytecode: boolean;
}

export interface ParseResult {
  success: boolean;
  version?: number;
  num_types?: number;
  num_instances?: number;
  script_count?: number;
  scripts?: ParsedScript[];
  errors?: string[];
  error?: string;
}

const PARSER_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "scripts",
  "parse_rbxl.py"
);

export async function parseRbxl(
  filePath: string,
  full = false
): Promise<ParseResult> {
  const flag = full ? "--full" : "";
  try {
    const { stdout, stderr } = await execAsync(
      `python3 "${PARSER_PATH}" "${filePath}" ${flag}`,
      { maxBuffer: 512 * 1024 * 1024 } // 512MB buffer for large files
    );
    return JSON.parse(stdout) as ParseResult;
  } catch (err: any) {
    // exec rejects on non-zero exit; stdout may still have JSON
    try {
      const result = JSON.parse(err.stdout ?? "{}") as ParseResult;
      return result;
    } catch {
      return { success: false, error: String(err.message ?? err) };
    }
  }
}
