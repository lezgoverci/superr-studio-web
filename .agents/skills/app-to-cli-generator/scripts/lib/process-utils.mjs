import { spawn } from "node:child_process";

export async function runProcess(
  command,
  args,
  { cwd = process.cwd(), env = process.env, input, allowFailure = false } = {}
) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to start "${command}": ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
    });

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("close", (exitCode) => {
      const result = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 1,
      };

      if (!allowFailure && result.exitCode !== 0) {
        reject(
          new Error(
            result.stderr ||
              result.stdout ||
              `"${command}" exited with code ${result.exitCode}.`
          )
        );
        return;
      }

      resolve(result);
    });

    if (child.stdin) {
      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    }
  });
}

export async function commandExists(command) {
  try {
    await runProcess("sh", ["-lc", `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}
