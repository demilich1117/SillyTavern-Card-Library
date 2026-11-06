# 接口核验

核验日期：2026-11-06。仅依赖浏览器前端和宿主已有能力。

## 固定来源

- ST：1.19.0，提交 `06bde939f`，与本机正在运行的版本一致。
- TT：2.3.0，提交 `f6126b4fc9243eb3990f2c0bad86e2afcb502f22`，兼容 ST 前端 1.18.0。此版本来自工作区锁定快照，非最新版本声明。
- 官方扩展结构：[ST UI extensions](https://docs.sillytavern.app/for-contributors/writing-extensions/)。

| 功能 | ST 来源 | TT 来源 | 实现约束 |
|---|---|---|---|
| Context | [st-context.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/public/scripts/st-context.js) | [st-context.js](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/scripts/st-context.js) | `SillyTavern.getContext()`，每次重新取 context |
| 读卡 | [characters.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/src/endpoints/characters.js) | [character-routes.js](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/tauri/main/routes/character-routes.js) | `/api/characters/get`，`avatar_url`；浅卡补全不切换聊天 |
| 编辑 | 同上 | 同上 | `/api/characters/merge-attributes`，单卡 `avatar`，顶层和 `data` 同步改动字段 |
| 删除、切换、生成 | [script.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/public/script.js) | [script.js](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/script.js) | 动态导入 `deleteCharacter` / `isGenerating` / `printCharacters`；其他方法走 context |
| 聊天列表 | characters.js | character-routes.js | `/api/characters/chats`；兼容 ST 的 `{error:true}` 空目录返回 |
| 聊天正文 | [chats.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/src/endpoints/chats.js) | [chat-routes.js](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/tauri/main/routes/chat-routes.js) | `/api/chats/get`；JSONL header + 全消息数组；去掉 `.jsonl` 后缀提交 |
| 世界书 | [world-info.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/public/scripts/world-info.js) | [worldinfo-routes.js](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/tauri/main/routes/worldinfo-routes.js) | 主书 `data.extensions.world`；额外书 `world_info.charLore`；`/api/worldinfo/get` |
| 导出 | [utils.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/public/scripts/utils.js) | [utils.js](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/scripts/utils.js) | 统一使用宿主 `download`，TT 传 `throwOnFailure: true` |
| 移动安全区 | CSS `dvh` / safe-area | [Layout API](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/docs/API/Layout.md) | 等待 TT ready，再设置 `data-tt-mobile-surface="fullscreen-window"` |

内部模块引用只位于 `host.js`，使用宿主同源绝对 Web 路径，不写死磁盘路径，也不把 TT 源码前缀 `src/` 用作运行时 URL。

TT 的 `chat.open()` 是绑定身份的存储 handle，不是 UI 切换接口，本扩展没有误用它；预览走兼容只读路由。未使用 Node 后端插件、任意 Tauri command、消息 DOM 扫描或酒馆助手 API。

宿主删除函数可能部分成功，不能用其单个 boolean 判定每张卡。删除后读取 `/api/characters/all`，逐个核对文件身份再清理本扩展分组。

使用当前连接的 AI 通过 context `generateRaw({prompt, systemPrompt, responseLength, trimNames})`。额外 API 则使用独立 Custom payload，显式传 `custom_url`、`model`、`secret_id`，不加载当前生成预设或切换主连接。

0.2.0 新增接口证据（均固定至上表提交）：

| 功能 | 来源与约束 |
|---|---|
| 正则 | [ST engine.js](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/public/scripts/extensions/regex/engine.js)、[TT engine.js](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/scripts/extensions/regex/engine.js)：`SCRIPT_TYPES` 顺序为 GLOBAL → PRESET → SCOPED，AI_OUTPUT=2；`getRegexedString` 内部取当前角色，不能只传 characterOverride 就预览另一角色。本扩展分别读取全局/预设规则与目标卡已批准局部规则，复用宿主 RegexProvider 编译器，按两阶段与深度 0 判定执行；不调用可能修改聊天变量的宿主宏执行器。 |
| 渲染 | `SillyTavern.libs.showdown`、`DOMPurify`；净化 HTML 后置于空 sandbox 的 srcdoc，CSP 禁止脚本、连接、表单及嵌套资源。样式只留在该 frame；不是酒馆助手消息 iframe。 |
| 密钥 | [ST secrets endpoint](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/src/endpoints/secrets.js)、[TT settings-routes](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/tauri/main/routes/settings-routes.js)：`/api/secrets/read/write/rotate`，类型 `api_key_custom`。write 会激活新密钥，故记录旧活动 ID，写入后复核并恢复；不写空 ID、不回退借用其他密钥。首次无旧密钥时，新密钥成为宿主该类型默认项。 |
| 生成 / 模型目录 | [ST chat-completions](https://github.com/SillyTavern/SillyTavern/blob/06bde939f/src/endpoints/backends/chat-completions.js)、[TT ai-routes](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src/tauri/main/routes/ai-routes.js)、[TT config.rs](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src-tauri/crates/tt-application/src/services/chat_completion_service/config.rs)：POST `/api/backends/chat-completions/generate` 和 `/status`；Custom 来源保留 explicit secret_id；TT 生成带 type=quiet。 |
| OpenCode | [官方端点及会话](https://opencode.ai/v2/docs/console/harnesses)、[公共模型目录](https://opencode.ai/v2/docs/console/api/inference)；Go 生成基础地址 `/inference/go/openai/v1`，现代地址的模型目录基础地址 `/inference/v1`。JSON 形式的 `custom_include_headers` 在 ST 和 TT 的 YAML/JSON 附加头解析中均受支持。仅转换本扩展请求，不需要全局 fetch 补丁。 |

拉取模型可在模型名未填写时准备密钥；只保存密钥库条目，书库连接在点击保存后才切换。正常导出不包含这些连接字段、密钥引用或会话命名空间。AI 结果由适配层解析并保存，生命周期独立于 UI 弹窗。

开发时下载的上游源码只在被 Git 忽略的 `references/` 临时文件中保留，含上游许可证 `LICENSE-AGPL-3.0`；交付 ZIP 按白名单仅包含此核验文档，不含上游源码。

0.4.0 缓存失效沿用上述固定提交：`CHARACTER_EDITED` 参数为 `{detail:{id,character}}`，`CHARACTER_DELETED` 为 `{id,character}`，`CHARACTER_DUPLICATED` 为 `{oldAvatar,newAvatar}`，`CHARACTER_RENAMED` 传旧 / 新 avatar，`WORLDINFO_UPDATED` 传书名与数据，`CHARACTER_PAGE_LOADED` 提示角色列表更新。源自两端 `script.js` 与 `world-info.js`；TT 没有用 ST 版本号替代核验。按 avatar 更新缓存，未知编辑身份时保守失效全部；列表事件重新比较源卡，聊天统计变化不触发正文读取。

`previewRevision` 读取既有正则接口的全局 / 预设规则、局部规则许可、正则禁用状态和用户名，变化时仅重做开场摘录；卡片局部规则随卡内容失效。额外世界书关联由既有 `world_info.charLore` 比较。所有缓存与分批逻辑属于前端内存，不新增宿主 API；世界书请求在单个卡的任务内串行，最多 3 张卡的索引请求并行。

0.5.0 增加浏览器 / WebView IndexedDB 持久层，仍不新增后端 API。宿主设置只增加随机 `cacheNamespace`，用于隔离站点内不同酒馆配置；普通整理数据导出排除该字段。

跨页面恢复浅卡时调用 `HEAD /characters/<encodeURIComponent(avatar)>`，`cache: no-store`，只读取 ETag。ST 1.19 的真实角色资源核验返回 200、ETag 与长度头；浅投影的 `date_added` / `data_size` 不足以证明正文未变，因此没有把它们作为唯一持久校验依据。完整卡源则复用 `SillyTavern.libs.sha256` 对源内容和正则配置生成比较键；没有 sha256 时保留原比较文本，不以不可靠短 hash 替代。

TT 2.3 固定源码：[用户资源响应](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src-tauri/crates/tt-application/src/services/host_resource_service/user_data.rs) 接受 GET / HEAD / OPTIONS，HEAD 在读取完整文件体之前返回；[ETag 与响应头](https://github.com/Darkatse/TauriTavern/blob/f6126b4fc9243eb3990f2c0bad86e2afcb502f22/src-tauri/crates/tt-application/src/services/host_resource_service/response.rs) 从文件元数据生成 representation ETag。仅 Last-Modified 的秒级时间戳不用于证明未变；没有 ETag 时补读，HTTP / 网络校验失败则保留重试状态，不悄悄采用旧数据。

持久缓存只保留卡片、比较键与处理后的文本摘录，搜索字段按批重建。独立世界书在新页面首次需要时重新读取，避免其独立变更未触发旧页面事件；缓存格式编号在卡片 / 摘录语义变化时递增。真实 IndexedDB 刷新 / 浏览器重启验证通过；TT 原生存储生命周期仍待实测。
