/**
 * Smoke test: build the Xuegen session and assert its configuration, without
 * sending any model request.
 *
 * Run with `npm run smoke`. Exits non-zero on the first failed assertion.
 */

import { createXuegenSession, listAvailableModels, readInstructions, skillsDir } from "./session.js";

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    console.error(`  FAIL ${message}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const { session, cwd, home, modelFallbackMessage } = await createXuegenSession({ continueRecent: true });

  try {
    console.log("Xuegen desktop smoke test");
    console.log(`  cwd:  ${cwd}`);
    console.log(`  home: ${home}`);

    const skillNames = session.resourceLoader
      .getSkills()
      .skills.map((skill) => skill.name)
      .sort();
    const expected = ["article", "calendar", "course", "course-board", "teach", "wiki-save"];
    console.log(`  skills (${skillsDir}): ${skillNames.join(", ")}`);
    for (const name of expected) {
      assert(skillNames.includes(name), `skill loaded: ${name}`);
    }

    // The desktop session must match the CLI, which loads only `builtin:mcp`
    // and `builtin:tool-search`: codemode must not be present.
    const extensionPaths = session.resourceLoader.getExtensions().extensions.map((entry) => entry.path);
    console.log(`  extensions: ${extensionPaths.join(", ") || "(none)"}`);
    assert(
      !extensionPaths.some((path) => path.toLowerCase().includes("codemode")),
      "no codemode extension loaded",
    );

    const firstLine = readInstructions().split("\n")[0] ?? "";
    assert(
      session.systemPrompt.includes(firstLine),
      `system prompt contains instructions.md first line: ${firstLine}`,
    );

    const { models } = await listAvailableModels(session);
    console.log(`  available models: ${models.length}`);
    if (models.length > 0) {
      console.log(`    ${models.map((model) => `${model.provider}/${model.id}`).join(", ")}`);
    } else {
      console.log("    (none: no configured credentials; run `xuegen` and /login)");
    }

    if (modelFallbackMessage) console.log(`  note: ${modelFallbackMessage}`);

    if (process.exitCode !== 1) console.log("smoke: PASS");
  } finally {
    session.dispose();
  }
}

main().catch((error: unknown) => {
  console.error("smoke: unexpected error", error);
  process.exitCode = 1;
});
