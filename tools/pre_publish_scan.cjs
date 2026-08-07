// AI 文本助手 - 发布前敏感扫描（pre_publish_scan.cjs）
// 运行：node tools/pre_publish_scan.cjs [--selftest]
// 用途：公开仓库 push 前必跑（蒸馏盲区 #39 固化，对齐 L-034/L-036 适用对象升级为公开仓库）
//   ① git ls-files 敏感路径检查（.env/.pem/.key/私钥/凭据文件）
//   ② tracked 文件内容真实密钥模式扫描（sk- 长串 / GitHub PAT / AWS / 私钥块 / 通用 api_key= 赋值）
//   ③ 未追踪文件中的敏感文件检查（防 .env 躺在仓库目录被误 add）
// 发现任何违规 → 打印文件:行 + 打码上下文 → exit 1（阻断发布）；全部通过 → exit 0
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ① 敏感路径模式（git ls-files 输出逐行匹配；大小写不敏感）
const SENSITIVE_PATH_RE = /\.(env|pem|key|p12|pfx|p8)$|(^|\/)id_rsa$|(^|\/)credentials\.(json|txt)$|(^|\/)secrets?\.[a-z0-9]+$/i;

// ② 内容真实密钥模式（特征 = 高熵长串或明确私钥块；占位符自动豁免）
const SECRET_PATTERNS = [
  // SiliconFlow / DeepSeek / OpenAI 风格（sk- 后跟 16+ 字符；sk-*** 打码豁免由豁免逻辑处理）
  { re: /sk-[A-Za-z0-9]{16,}/g, name: "sk- API key" },
  // GitHub Personal Access Token
  { re: /gh[pousr]_[A-Za-z0-9]{20,}/g, name: "GitHub PAT" },
  // AWS Access Key
  { re: /\bAKIA[0-9A-Z]{16}\b/g, name: "AWS access key" },
  // Slack token
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, name: "Slack token" },
  // Stripe
  { re: /(sk|pk)_live_[A-Za-z0-9]{20,}/g, name: "Stripe key" },
  // Google API key
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, name: "Google API key" },
  // 私钥块（RSA/EC/OpenSSH/通用）
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/g, name: "private key block" },
  // 通用 api_key= / apiKey: / api-key 赋值（值长度 ≥16，占位符豁免）
  { re: /api[_-]?key\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})["']?/gi, name: "api_key assignment" },
];

// 占位符/示例值豁免（大小写不敏感）：YOUR_* / your-* / xxx / example / <...> / sk-*** 打码 / "null" / "undefined"
function isPlaceholder(value) {
  const v = String(value);
  if (!v || v.length < 6) return true;
  if (v.includes("<") && v.includes(">")) return true;
  const s = v.toLowerCase();
  if (s.includes("your")) return true;
  if (s.includes("example")) return true;
  if (s.replace(/_/g, "").replace(/-/g, "") === "xxx") return true;
  if (/^sk-\*{3,}$/.test(s)) return true; // 打码
  if (s === "null" || s === "undefined" || s === "none" || s === "n/a" || s === "api_key" || s === "apikey") return true;
  return false;
}

// ③ 未追踪敏感文件路径模式（相对仓库根）
const UNTRACKED_SENSITIVE_RE = SENSITIVE_PATH_RE;

function git(cmd) {
  return execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function maskContext(line) {
  return line.length > 120 ? line.slice(0, 120) + "…" : line;
}

function scanTrackedPaths(tracked) {
  const hits = [];
  for (const f of tracked) {
    if (SENSITIVE_PATH_RE.test(f)) hits.push(`  [路径] ${f}`);
  }
  return hits;
}

function scanFileContent(file, content) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const { re, name } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        // api_key 赋值模式：验证捕获组值不是占位符
        if (name === "api_key assignment" && isPlaceholder(m[1])) continue;
        hits.push(`  [${name}] ${file}:${idx + 1}  ${maskContext(line)}`);
      }
    }
  });
  return hits;
}

function scanUntracked(untracked) {
  const hits = [];
  for (const f of untracked) {
    if (UNTRACKED_SENSITIVE_RE.test(f)) hits.push(`  [未追踪敏感文件] ${f}`);
  }
  return hits;
}

// ---- 自测（--selftest）：纯逻辑阳性/阴性对照，不触碰仓库 ----
function selftest() {
  let pass = 0, fail = 0;
  const t = (name, cond) => { cond ? pass++ : (fail++, console.log(`  ❌ ${name}`)); };

  const pos = [
    'const key = "' + "sk-" + "abcdefghijklmnopqrstuvwxyz123456" + '";',   // sk- 长串
    "apiKey: " + "ghp_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef", // GitHub PAT
    "export const AWS_KEY=" + '"' + "AKIA" + "IOSFODNN7EXAMPLE" + '"',   // AWS（16 位样例也报）
    "-----BEGIN " + "PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFA",   // 私钥块
    "DASHSCOPE_" + "API_KEY=" + "sk-" + "0123456789abcdef0123456789abcdef", // 环境变量风格
  ];
  const neg = [
    'apiKey: "YOUR_API_KEY_HERE"',      // 占位符
    "// sk-*** 打码示例（文档演示）",     // 打码
    "const apiKey = \"\";",              // 空
    'apiKey: "example-key-for-docs"',   // example 占位
    "git commit 9f2c4d8e7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1", // 40 hex 不误报
  ];
  for (const line of pos) t("阳性命中: " + line.slice(0, 30), scanFileContent("t.js", line).length > 0);
  for (const line of neg) t("阴性豁免: " + line.slice(0, 30), scanFileContent("t.js", line).length === 0);
  t("敏感路径检测 .env", scanTrackedPaths([".env"]).length === 1);
  t("敏感路径检测 keys/ssh.pem", scanTrackedPaths(["keys/ssh.pem"]).length === 1);
  t("普通文件不误报", scanTrackedPaths(["background.js", "README.md"]).length === 0);
  t("未追踪 .env 检测", scanUntracked([".env", "demo.txt"]).length === 1);
  t("未追踪普通文件不误报", scanUntracked(["demo.txt", "notes.md"]).length === 0);

  console.log(`selftest: ${pass} 通过 / ${fail} 失败`);
  return fail === 0;
}

function main() {
  if (process.argv.includes("--selftest")) {
    process.exit(selftest() ? 0 : 1);
  }

  const root = path.resolve(__dirname, "..");
  process.chdir(root);

  let tracked = [];
  try { tracked = git("git ls-files").split("\n").filter(Boolean); }
  catch (e) { console.error("⚠️ 无法读取 git ls-files（本仓库未初始化 git？）"); process.exit(1); }

  const failures = [];
  failures.push(...scanTrackedPaths(tracked));

  for (const f of tracked) {
    // 跳过二进制/视频/图片（不会含文本密钥）
    if (/\.(webm|mp4|png|jpg|jpeg|gif|ico|zip)$/i.test(f)) continue;
    let content;
    try { content = fs.readFileSync(path.join(root, f), "utf-8"); }
    catch (e) { continue; } // 文件缺失等，跳过（git ls-files 与磁盘不一致时）
    failures.push(...scanFileContent(f, content));
  }

  // 未追踪敏感文件（防误 add）
  let untracked = [];
  try { untracked = git("git ls-files --others --exclude-standard").split("\n").filter(Boolean); }
  catch (e) { /* 忽略 */ }
  failures.push(...scanUntracked(untracked));

  console.log(`扫描 ${tracked.length} 个追踪文件 + ${untracked.length} 个未追踪文件`);
  if (failures.length === 0) {
    console.log("✅ 发布前敏感扫描通过：未发现密钥/敏感文件");
    process.exit(0);
  }
  console.log(`❌ 发现 ${failures.length} 处敏感内容，禁止 push：`);
  for (const f of failures) console.log(f);
  console.log("\n处置：删除真实密钥 → 改用占位符/打码 → 重新扫描通过后再 push");
  process.exit(1);
}

main();
