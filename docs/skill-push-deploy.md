# Skill: 推送部署

> 一键推送代码到 GitHub，自动更新版本元数据，触发 Vercel 构建部署，并验证线上指纹。

---

## 触发条件

用户说"推"或"推送"。

---

## 完整流程

### Step 1: 检查待推送内容（双重检查）

```bash
# 检查未提交的工作区改动
git status --short

# 检查已提交但未推送的 commit（关键！避免遗漏）
git log --oneline origin/main..HEAD
```

**两条都为空时**才输出"工作区干净，无需推送"。

---

### Step 2: 统计代码行数

```bash
find src lib api modules e2e scripts server.ts -name "*.ts" -o -name "*.tsx" -o -name "*.css" | xargs wc -l | tail -1 | awk '{print $1}'
```

输出为纯数字，写入 `package.json` 的 `lineCount` 字段。

---

### Step 3: 生成构建时间戳

```bash
date +%m%d%H
```

格式为 **MMDDHH**（月日时），写入 `package.json` 的 `buildCode` 字段。

---

### Step 4: 版本号递增（十进制溢出）

从 `package.json` 读取当前 `version`，执行十进制溢出逻辑：

- patch + 1
- 若 patch >= 10，则 minor + 1，patch = 0
- 若 minor >= 10，则 major + 1，minor = 0，patch = 0

示例：
| 当前 | 递增后 |
|------|--------|
| 0.4.7 | 0.4.8 |
| 0.4.9 | 0.5.0 |
| 0.9.9 | 1.0.0 |

写入 `package.json` 的 `version` 字段。

---

### Step 5: 更新 package.json

一次性更新四个字段：`version`、`buildCode`、`lineCount`（`versionType` 保持不变，除非用户手动指定 Magic）。

---

### Step 6: Git 提交并推送

```bash
# 排除 .github/workflows/（OAuth 无 workflow 写入权限）
git add -A && git reset HEAD .github/workflows/ 2>/dev/null

# SSH 签名提交
git commit -S -m "<commit message>"

# 推送到 main
git push origin main
```

**提交信息规范**：
- `feat(scope): description` — 新功能
- `fix(scope): description` — 修复
- `polish(scope): description` — 润色优化
- `docs: description` — 文档
- `chore: description` — 杂务（版本号更新等）

**注意事项**：
- 远程仓库地址：`https://github.com/jiaqi015/KeGame-hub.git`
- `.github/workflows/` 必须排除，否则 OAuth push 会被拒绝
- 如果 push 失败（权限/网络），不要反复重试，换方案解决

---

### Step 7: 等待 Vercel 部署

```bash
sleep 70
```

Vercel 从 GitHub push 到构建完成通常需要 60-90 秒。70 秒是经验值。

---

### Step 8: 验证部署指纹

```bash
# 获取 JS bundle 文件名
JS_FILE=$(curl -s https://ai-model-sabrina.vercel.app/ | grep -oE 'assets/index-[^"]+\.js' | head -1)

# 在 bundle 中搜索四项指纹
curl -s https://ai-model-sabrina.vercel.app/$JS_FILE | grep -oE '(版本号|buildCode|commitHash|lineCount)' | sort -u
```

四项指纹：
1. **版本号**：如 `0.4.7`
2. **构建时间**：如 `060823`
3. **Commit Hash**：如 `d5770a1`（7位短hash）
4. **代码行数**：如 `296475`

四项全部匹配 → 部署成功 ✅
部分匹配或全不匹配 → 等待30秒重试一次
连接超时 → 标注"本地网络问题，推送本身已成功"

---

### Step 9: 输出结果

```
✅ 推送部署完成！

| 项目 | 值 |
|------|-----|
| 版本号 | v0.4.7 |
| 构建时间 | 060823 (6月8日 23:00) |
| 发布类型 | ◻ Square / ✨ Magic |
| Commit Hash | d5770a1 |
| 代码行数 | 296,475 行 |
| 部署地址 | ai-model-sabrina.vercel.app |
```

---

## 版本类型说明

| 类型 | 含义 | 登录页显示 |
|------|------|-----------|
| **Square** | 日常迭代推送（默认） | ◻ Square |
| **Magic** | 里程碑版本（用户手动指定） | ✨ Magic |

切换为 Magic：手动修改 `package.json` 中 `versionType` 为 `"magic"`。

---

## 关键配置文件

| 文件 | 作用 |
|------|------|
| `package.json` | version / versionType / buildCode / lineCount 元数据源 |
| `vite.config.ts` | 注入 VITE_APP_VERSION / VITE_VERSION_TYPE / VITE_BUILD_CODE / VITE_GIT_COMMIT / VITE_LINE_COUNT 到前端构建 |
| `src/components/Auth/AuthOverlay.tsx` | 登录页展示：标题下方显示代码行数，底部显示版本·类型·commit |
| `.gitignore` | 排除 `.github/workflows/`（OAuth 无 workflow scope） |

---

## 常见问题

### Q: push 被 OAuth workflow scope 拒绝
A: 确保 `.gitignore` 包含 `.github/workflows/`，并在 `git add` 后执行 `git reset HEAD .github/workflows/`。

### Q: 部署指纹验证连接超时
A: 本地网络到 Vercel CDN 可能不稳定。推送本身已成功，Vercel 会自动构建。用户可手动访问 https://ai-model-sabrina.vercel.app 确认。

### Q: 本地有 commit 但没 push
A: 这是历史遗留问题。每次推送必须检查 `git log --oneline origin/main..HEAD`，确保所有本地 commit 都已推送。

### Q: 版本号何时溢出？
A: patch 到 9 即溢出进位 minor。minor 到 9 即溢出进位 major。0.4.9 → 0.5.0，0.9.9 → 1.0.0。

---

## 流程速查

```
推 → 检查(未提交+未推送) → 统计行数 → 时间戳 → 版本溢出 → 更新pkg → commit -S → push → sleep 70 → 指纹验证 → 输出结果
```
