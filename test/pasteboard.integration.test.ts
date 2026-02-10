import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  clear,
  listTypes,
  readText,
  writeText,
  readImage,
  writeImage,
  readData,
  writeData,
} from "../src/pasteboard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PBHELPER = join(__dirname, "..", "build", "pbhelper");

// 2x2 RGB PNG, base64-encoded (compatible with macOS NSBitmapImageRep)
const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8DAAMIM////ZwAAHu8E/KPItPcAAAAASUVORK5CYII=";

// --- Helpers: independent of src/pasteboard.ts ---

function pbcopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pbcopy");
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`pbcopy exited ${code}`)),
    );
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

function pbpaste(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pbpaste");
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString());
      else reject(new Error(`pbpaste exited ${code}`));
    });
  });
}

function runPbhelper(
  args: string[],
  stdinData?: string,
): Promise<{ stdout: Buffer; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PBHELPER, args);
    const stdoutChunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
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

// --- Save / restore clipboard ---

let savedClipboard: string;

beforeAll(async () => {
  savedClipboard = await pbpaste();
});

beforeEach(async () => {
  await clear();
});

afterAll(async () => {
  await pbcopy(savedClipboard);
});

// --- Tests ---

describe("clear()", () => {
  test("clears the pasteboard", async () => {
    await pbcopy("some text");
    await clear();
    const result = await pbpaste();
    expect(result).toBe("");
  });
});

describe("listTypes()", () => {
  test("includes public.utf8-plain-text after pbcopy", async () => {
    await pbcopy("hello");
    const types = await listTypes();
    expect(types).toContain("public.utf8-plain-text");
  });

  test("returns empty array after clear", async () => {
    const types = await listTypes();
    expect(types).toEqual([]);
  });

  test("includes public.tiff after writing an image via pbhelper", async () => {
    const result = await runPbhelper(
      ["write-image", "--format", "png"],
      TEST_PNG_BASE64,
    );
    expect(result.exitCode).toBe(0);
    const types = await listTypes();
    expect(types).toContain("public.tiff");
  });
});

describe("readText()", () => {
  test("reads text set by pbcopy", async () => {
    await pbcopy("hello");
    const text = await readText();
    expect(text).toBe("hello");
  });

  test("reads Unicode text", async () => {
    const unicode = "Hello 世界 🌍 café";
    await pbcopy(unicode);
    const text = await readText();
    expect(text).toBe(unicode);
  });

  test("reads multiline text", async () => {
    const multiline = "line 1\nline 2\nline 3";
    await pbcopy(multiline);
    const text = await readText();
    expect(text).toBe(multiline);
  });

  test("throws when pasteboard is empty", async () => {
    await expect(readText()).rejects.toThrow();
  });
});

describe("writeText()", () => {
  test("writes text readable by pbpaste", async () => {
    await writeText("hello");
    const text = await pbpaste();
    expect(text).toBe("hello");
  });

  test("writes Unicode text", async () => {
    const unicode = "Hello 世界 🌍 café";
    await writeText(unicode);
    const text = await pbpaste();
    expect(text).toBe(unicode);
  });

  test("writes long text", async () => {
    const long = "x".repeat(100_000);
    await writeText(long);
    const text = await pbpaste();
    expect(text).toBe(long);
  });
});

describe("readImage()", () => {
  test("reads PNG image written by pbhelper", async () => {
    const writeResult = await runPbhelper(
      ["write-image", "--format", "png"],
      TEST_PNG_BASE64,
    );
    expect(writeResult.exitCode).toBe(0);

    const base64 = await readImage();
    const buf = Buffer.from(base64, "base64");
    // PNG magic bytes: 0x89 P N G
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  test("reads TIFF image written by pbhelper", async () => {
    const writeResult = await runPbhelper(
      ["write-image", "--format", "png"],
      TEST_PNG_BASE64,
    );
    expect(writeResult.exitCode).toBe(0);

    const base64 = await readImage(undefined, "tiff");
    const buf = Buffer.from(base64, "base64");
    // TIFF magic bytes: II (little-endian) or MM (big-endian)
    const magic = buf.subarray(0, 2).toString("ascii");
    expect(["II", "MM"]).toContain(magic);
  });

  test("throws when pasteboard is empty", async () => {
    await expect(readImage()).rejects.toThrow();
  });
});

describe("writeImage()", () => {
  test("writes image readable by pbhelper read-image", async () => {
    await writeImage(TEST_PNG_BASE64);

    const result = await runPbhelper(["read-image", "--format", "png"]);
    expect(result.exitCode).toBe(0);

    const buf = Buffer.from(result.stdout.toString(), "base64");
    // Should be a valid PNG
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  test("sets image types on pasteboard", async () => {
    await writeImage(TEST_PNG_BASE64);
    const types = await listTypes();
    expect(types).toContain("public.tiff");
  });
});

describe("readData()", () => {
  test("reads plain text data set by pbcopy", async () => {
    await pbcopy("hello");
    const data = await readData("public.utf8-plain-text");
    expect(data).toBe("hello");
  });

  test("reads custom type written by pbhelper", async () => {
    const testData = "custom data payload";
    const writeResult = await runPbhelper(
      ["write", "--type", "com.test.custom"],
      testData,
    );
    expect(writeResult.exitCode).toBe(0);

    const data = await readData("com.test.custom");
    expect(data).toBe(testData);
  });

  test("throws when pasteboard is empty", async () => {
    await expect(readData("public.utf8-plain-text")).rejects.toThrow();
  });
});

describe("writeData()", () => {
  test("writes plain text readable by pbpaste", async () => {
    await writeData("public.utf8-plain-text", "hello", false);
    const text = await pbpaste();
    expect(text).toBe("hello");
  });

  test("writes custom type readable by pbhelper", async () => {
    const testData = "custom payload";
    await writeData("com.test.custom", testData, false);

    const result = await runPbhelper(["read", "--type", "com.test.custom"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(testData);
  });

  test("writes base64 data readable by pbhelper", async () => {
    const rawData = "binary-like content";
    const b64 = Buffer.from(rawData).toString("base64");
    await writeData("com.test.b64", b64, true);

    const result = await runPbhelper(["read", "--type", "com.test.b64"]);
    expect(result.exitCode).toBe(0);
    // pbhelper read returns valid UTF-8 data as a string directly
    expect(result.stdout.toString()).toBe(rawData);
  });
});
