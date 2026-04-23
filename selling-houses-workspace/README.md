## seller 并行目录说明（非运行真相）

本目录当前用于并行实现/迁移参考，不是主应用运行时加载的 seller 目录。

当前运行真相链路：

- `index.html` -> `src/main.tsx` -> `src/App.tsx` -> `src/workspaces/workspaceRegistry.tsx`
- seller 实际加载路径：`src/selling-houses/SellingHousesWorkspace.tsx`

后续约定：

- 改 bug、机会层、跨天产品，一律改 `src/selling-houses/*`
- 本目录仅在明确迁移任务下改动，避免出现“改了但线上/本地主入口不生效”
