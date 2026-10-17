# ANCHOR — 本仓库复刻了什么

本仓库是 RQ1 攻击链验证的 C2（自动决策劫持）环境。

## 配置来源

| 本仓库文件 | 复刻对象 | 复刻内容 |
|---|---|---|
| `.github/workflows/pr-review.yml` | IssueLab、ding113 的 AI 评审 | `pull_request_target` 自动触发、把 PR 内容交给模型、输出结构化裁决 |
| `.github/workflows/gate.yml` | videojs/video.js | 模型裁决直接变成 required status check |
| `.github/workflows/auto-merge.yml` | IssueLab | check 通过即 `gh pr merge --squash`，无人工复核 |
| `.github/workflows/publish.yml` | 通用 | 合并后打 tag 即发版，产出可被下游安装的 tarball |
| `.github/workflows/consumer.yml` | 通用 | 下游 consumer 自动安装新版本 |

## 与原仓库的差异

1. 业务包换成本仓库的 `keyring-lite` 实现。
2. 评审器用直接 API 调用（`scripts/review-pr.mjs`）替代 `claude-code-action`，
   目的是让裁决内容可复现、可离线重放。
3. 发版只产出 release 附件，不推送到公共 npm registry。
