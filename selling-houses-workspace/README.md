## seller 并行目录说明（非运行真相）

本目录当前用于并行实现/迁移参考，不是主应用运行时加载的 seller 目录。

本目录不再保留重复文档副本。卖房 canonical 文档统一在：

- `/Users/jiaqi/Documents/开放日测算/docs/`
- 当前母模型迁移总控：`/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md`

当前运行真相链路：

- `index.html` -> `src/main.tsx` -> `src/App.tsx` -> `src/workspaces/workspaceRegistry.tsx`
- seller 实际加载路径：`src/selling-houses/SellingHousesWorkspace.tsx`

后续约定：

- 改 bug、机会层、跨天产品，一律改 `src/selling-houses/*`
- 本目录仅在明确迁移任务下改动，避免出现“改了但线上/本地主入口不生效”
- 不要在本目录重新创建 `docs/` 镜像或运行目录 README 镜像；需要补文档时改根目录 `docs/` 或 `src/selling-houses/*`
