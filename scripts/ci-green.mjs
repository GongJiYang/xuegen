#!/usr/bin/env node
// 发版关卡：等某个提交在 GitHub Actions 上的 CI 跑完，全部成功才退出 0。
// v0.12.x、v0.14.0–v0.16.0 都是 CI 红着发的（本地中文环境绿、CI 英文环境红），没人看见。
// 用法：node scripts/ci-green.mjs [提交，默认 HEAD] [--timeout 分钟，默认 20]
import { execFileSync } from "node:child_process";

const REPO = "GongJiYang/xuegen";
const args = process.argv.slice(2);
const timeoutAt = args.indexOf("--timeout");
const minutes = timeoutAt >= 0 ? Number(args.splice(timeoutAt, 2)[1]) : 20;
const ref = args[0] ?? "HEAD";
const sha = execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim();

function runs() {
  const out = execFileSync(
    "gh",
    ["run", "list", "--repo", REPO, "--commit", sha, "--json", "databaseId,name,headBranch,status,conclusion,url"],
    { encoding: "utf8" },
  );
  return JSON.parse(out);
}

const deadline = Date.now() + minutes * 60_000;
for (;;) {
  const list = runs();
  const pending = list.filter((run) => run.status !== "completed");
  if (list.length > 0 && pending.length === 0) {
    const bad = list.filter((run) => run.conclusion !== "success");
    for (const run of list) console.log(`${run.conclusion === "success" ? "✓" : "✗"} ${run.name} (${run.headBranch}) ${run.url}`);
    if (bad.length > 0) {
      console.error(`CI 没过（${sha.slice(0, 7)}）：先修好再发版。看日志：gh run view ${bad[0].databaseId} --repo ${REPO} --log-failed`);
      process.exit(1);
    }
    console.log(`CI 全绿（${sha.slice(0, 7)}）。`);
    process.exit(0);
  }
  if (Date.now() > deadline) {
    console.error(`等了 ${minutes} 分钟 CI 还没跑完（${sha.slice(0, 7)}，${list.length} 个运行）。`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
