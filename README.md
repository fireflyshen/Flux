# Flux

Flux 是一个只读的个人支出热力图：它从 `Bills` 的 Beancount 账本读取事实，用蓝色深浅展示每天的净支出。

## 它为什么不只是一张好看的图

- **看节律**：热力图先回答“我多久会花一次钱”，连续密集的蓝色往往比某一笔大额消费更能暴露生活节奏的变化。
- **找偏离**：颜色按你当年真实支出日的分位数计算，不用别人设定的“合理金额”评价你；最深的蓝色表示它明显偏离了你自己的日常。
- **能追溯**：点击任意一天可以看到精确净支出、退款、分类和交易，颜色只是入口，不会替代账本事实。
- **能复盘**：洞察视图按周、月、季度和年度汇总净支出、日均、无支出日、异常高支出日与分类流向。

Flux 的目标不是让“少花钱”变成另一种打卡，而是缩短 `发现异常 → 找到原因 → 调整行为` 的路径。

## 数据口径

- 只统计 `Expenses:*` 分录。
- 正数是支出，负数是退款；热力图展示退款抵扣后的净支出。
- 资产转账、信用卡还款和收入不算支出。
- 账本中的未来日期交易视为计划，不进入“已经花了多少钱”的热力图。
- CNY、USD、GBP 等币种严格分开，不使用未经账本记录的汇率强行折算。
- Flux 不修改 Bills，也不写入任何交易。

## 本地运行

```bash
pnpm install
pnpm dev
```

默认读取 `/Users/enmu/nexus/flowspace/Bills/main.bean`，调用 Bills 自己的 `tools/export_flux_snapshot.py`，并使用 Fava 的 Python 环境。迁移目录时可以覆盖：

```bash
BILLS_LEDGER=/path/to/main.bean BILLS_EXPORTER=/path/to/export_flux_snapshot.py FLUX_PYTHON=/path/to/python pnpm dev
```

验证：

```bash
pnpm test:data
pnpm lint
pnpm build
```

## 自动部署

推送到 GitHub 仓库的 `main` 分支后，GitHub Actions 会先安装锁定依赖，执行 lint、Worker 语法检查与生产构建；全部通过后再部署 `flux-money` 到 Cloudflare。失败的提交不会覆盖当前线上版本。

部署需要仓库 Actions Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Cloudflare Token 只授予发布 Worker 所需的最小权限，不写入仓库。也可以在 GitHub Actions 页面手动运行 `Deploy Flux to Cloudflare`。

## 隐私

本地与云端抽屉都可以显示交易明细；上传 R2 的快照包含商户、摘要、金额与分类，但会移除账本文件名和行号。R2 桶保持私有，`workers.dev` 入口由 Cloudflare Access 保护，只允许指定邮箱登录。

Cloudflare 与 Git push 同步的完整部署顺序见 [docs/cloudflare-sync.md](docs/cloudflare-sync.md)。
