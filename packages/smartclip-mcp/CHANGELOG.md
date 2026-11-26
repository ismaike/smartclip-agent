# Changelog

## [1.8.0](https://github.com/ismaike/smartclip-agent/compare/smartclip-mcp-v1.7.0...smartclip-mcp-v1.8.0) (2026-11-26)


### ✨ Features

* **mcp:** 保存目标对齐扩展全部 16 种并复用协议 destinationSchema ([1915854](https://github.com/ismaike/smartclip-agent/commit/1915854d4e4cc3607898d7cf68bb6e3f0dbfdd16))
* **mcp:** 引入 Local Bridge Hub 与统一 CLI ([fd858cd](https://github.com/ismaike/smartclip-agent/commit/fd858cdd029625ffd8979355712737ccecd1361a))
* **protocol:** 会员语义对齐 Pro，桥接状态兼容并归一化 pro/premium ([2b07f7e](https://github.com/ismaike/smartclip-agent/commit/2b07f7ea0ba2f09e01f4d1fa6773dae2fe315fc6))


### 🐛 Bug Fixes

* **mcp:** bump 至 1.6.1 修复 workspace:* 依赖泄漏 ([ef7681b](https://github.com/ismaike/smartclip-agent/commit/ef7681b1d2a782b28e3b30c6ebe5b5bd46ac0260))
* **protocol:** bridgeSuccessSchema 补全 clip/createdTabId，修复 clip_page 标题丢失 ([46aeedc](https://github.com/ismaike/smartclip-agent/commit/46aeedc1a67ca3c3d4cf4d9de68d8dd906e0c4dc))


### 📝 Documentation

* align documentation and config with monorepo structure ([bfdaa04](https://github.com/ismaike/smartclip-agent/commit/bfdaa044dbef5a83c29fcf2972356969fe6562ff))
* 统一 Bridge Action 契约措辞，新增 Install Topology / Bridge Action Contract 术语 ([4a132cf](https://github.com/ismaike/smartclip-agent/commit/4a132cfa71c483ccb75e504598d47d65c0435d27))


### 🔨 Code Refactoring

* **mcp:** 工具 annotations、文案精简、CLI 增强、废弃工具清理 ([089ccdc](https://github.com/ismaike/smartclip-agent/commit/089ccdce4da9b1e98f37d941f34cebf5ab4091bb))
* **mcp:** 工具迁移 send→invoke，消费契约归一化结果 ([c772735](https://github.com/ismaike/smartclip-agent/commit/c7727350477bde42ece54e6520890d245b6016df))


### 📦 Build System

* 统一依赖管理并让 release-please 同步衍生版本 ([1415dea](https://github.com/ismaike/smartclip-agent/commit/1415deaf6884241c18273f6ad636414b75abbfc7))

## Changelog
