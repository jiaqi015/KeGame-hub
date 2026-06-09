# 推

用户说"推"时执行。

---

## 流程

**检查** → **计数** → **时间戳** → **版号** → **提交** → **推送** → **验证**

```bash
# 1. 双重检查
git status --short
git log --oneline origin/main..HEAD

# 2. 行数 + 时间戳
find src lib api modules e2e scripts server.ts -name "*.ts" -o -name "*.tsx" -o -name "*.css" | xargs wc -l | tail -1 | awk '{print $1}'
date +%m%d%H

# 3. 版本递增（十进制溢出：patch≥10则进位）
# 例: 0.4.8 → 0.4.9 → 0.5.0

# 4. 更新 package.json: version, buildCode, lineCount

# 5. 提交推送
git add -A
git reset HEAD .github/workflows/ 2>/dev/null   # 排除 workflow
git commit -S -m "..."
git push origin main

# 6. 部署验证
sleep 70
curl -s https://ai-model-sabrina.vercel.app/ \
  | grep -oE 'assets/index-[^"]+\.js' | head -1 \
  | xargs -I {} curl -s https://ai-model-sabrina.vercel.app/{} \
  | grep -oE '(版本号|buildCode|commit|行数)' | sort -u
```

---

## 关键信息

| 项 | 值 |
|----|-----|
| 远程 | `https://github.com/jiaqi015/KeGame-hub.git` |
| 部署 | `https://ai-model-sabrina.vercel.app/` |
| 版号 | 十进制溢出，patch≥10进位 minor |
| 类型 | `square`（默认）/ `magic`（里程碑） |
| 排除 | `.github/workflows/`（OAuth 无权限） |
| 签名 | `git commit -S` |

---

## 坑

- `git status --short` 为空 ≠ 无需推送，必须检查 `origin/main..HEAD`
- workflow 目录必须排除，否则 push 被拒
- Vercel 验证超时 = 本地网络问题，推送本身已成功
