#!/usr/bin/env node
import { constants, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (args[0] === "--help" || args[0] === "-h") {
  console.log(`Xuegen ${version} | 学根

用推导、练习和反馈，建立可以独立运用的理解。

用法：
  xuegen                         开始学习
  xuegen "我想理解概率中的条件独立"  带着目标开始
  xuegen -c                      继续当前目录的最近会话
  xuegen -r                      选择历史会话
  xuegen -p "解释这个概念"         非交互输出
  xuegen --runtime-help          查看底层运行时的完整选项

会话内：/login 登录，/model 选择模型，/new 新主题，/quit 退出。
个人配置与会话：~/.xuegen/，可用 XUEGEN_HOME 指定另一目录。
项目更新：在源码目录运行 git pull --ff-only，再运行 npm ci --ignore-scripts。
底层运行时：@earendil-works/pi-coding-agent。`);
} else if (args[0] === "--version" || args[0] === "-v") {
  console.log(`xuegen ${version}`);
} else if (args[0] === "update") {
  console.error("请在 Xuegen 源码目录运行 git pull --ff-only && npm ci --ignore-scripts，保持运行时与锁文件一致。");
  process.exitCode = 2;
} else {
  const stateDir = resolve(process.env.XUEGEN_HOME || join(homedir(), ".xuegen"));
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  try {
    copyFileSync(join(root, "defaults/settings.json"), join(stateDir, "settings.json"), constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }

  // Set isolation before importing the runtime: it captures paths at module load.
  process.env.PI_CODING_AGENT_DIR = stateDir;
  delete process.env.PI_CODING_AGENT_SESSION_DIR;
  delete process.env.PI_PACKAGE_DIR;
  process.env.PI_CODING_AGENT = "true";
  process.env.AI_AGENT = "xuegen";
  process.title = "xuegen";

  const { main } = await import("@earendil-works/pi-coding-agent");
  const subcommands = new Set(["install", "remove", "uninstall", "list", "config", "auth"]);
  const sessionArgs = [
    "--no-approve",
    "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files",
    "--skill", join(root, "skills"),
    "--append-system-prompt", join(root, "instructions.md"),
    ...args,
  ];
  const runtimeArgs = args[0] === "--runtime-help" ? ["--help"] : subcommands.has(args[0]) ? args : sessionArgs;
  await main(runtimeArgs, {
    extensionFactories: [{
      name: "xuegen",
      factory(agent) {
        agent.on("session_start", (_event, ctx) => {
          if (ctx.mode !== "tui") return;
          ctx.ui.setTitle("Xuegen | 学根");
          ctx.ui.setHeader(() => ({
            render: (width) => ["Xuegen | Learn through understanding".slice(0, width)],
            invalidate() {},
          }));
        });
      },
    }],
  });
}
