import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function prepareBotSandboxes(manifests, { enabled = true } = {}) {
  if (!enabled) {
    return {
      manifests,
      cleanup: async () => {}
    };
  }

  const roots = [];
  const isolated = [];
  try {
    for (const [index, manifest] of manifests.entries()) {
      const root = await mkdtemp(path.join(tmpdir(), `war-bot-${index}-`));
      roots.push(root);
      const sourceDir = path.resolve(manifest.sourceDir ?? manifest.cwd);
      const copyDir = path.join(root, "bot");
      await cp(sourceDir, copyDir, {
        recursive: true,
        errorOnExist: false,
        force: true
      });
      isolated.push({
        ...manifest,
        originalCwd: manifest.cwd,
        sourceDir: copyDir,
        cwd: path.resolve(copyDir, manifest.workingDirectory ?? ".")
      });
    }
  } catch (error) {
    await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })));
    throw error;
  }

  return {
    manifests: isolated,
    cleanup: async () => {
      await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })));
    }
  };
}
