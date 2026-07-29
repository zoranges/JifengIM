# 极速通 (JifengIM)

面向中小企业的即时通讯平台，基于 [WuKongIM](https://github.com/WuKongIM/WuKongIM) 构建。支持单聊、群聊、企业通讯录、分级权限管控、离职人员处理、文件管理、消息搜索等功能。

## 功能特性

### 即时通讯
- **单聊 & 群聊** — 一对一私聊和多人群组聊天，支持文字、图片、文件、语音、视频等消息类型
- **消息状态追踪** — 发送中 / 已送达 / 发送失败，实时反馈
- **消息撤回** — 支持消息撤回，群聊中任何人可撤回自己发送的消息
- **消息搜索** — 全文搜索历史消息，关键词高亮，一键定位到聊天位置
- **消息置顶** — 群聊中可将重要消息置顶，全体成员可见
- **@提及** — 群聊中 @所有人 或 @特定成员
- **回复消息** — 引用回复，上下文更清晰
- **日历定位** — 按日期快速跳转到历史消息
- **语音消息** — 按住录音，松开发送
- **粘贴发送图片** — Ctrl+V 直接粘贴剪贴板中的图片

### 文件管理
- **个人文件** — 上传/下载/删除/重命名，支持自定义分类
- **群文件** — 群聊文件自动汇集，按图片/视频/音频/文档分类浏览
- **群文件分类** — 服务端共享分类（多成员合并策略），localStorage 自动迁移到服务端
- **我的文档** — 从群文件中收藏到个人文档，跨会话访问
- **文件预览** — 图片在线预览，其他文件类型直接下载
- **拖拽上传** — 支持拖拽文件到页面直接上传
- **批量操作** — 多选文件、批量移动分类

### 企业通讯录
- **全企业成员浏览** — 按部门筛选，点击成员直接发起会话
- **在线状态感知** — 成员在线/离线实时显示，群聊在线人数统计
- **群组管理** — 创建群聊自动分配房间号，群主可邀请成员、踢人、解散群
- **群信息面板** — 查看群成员列表、在线状态、群设置

### 分级权限

| 角色 | 权限 |
|------|------|
| 超级管理员 | 全部权限：管理用户、部门、所有群聊、系统配置 |
| 管理员 | 用户管理、部门管理、创建群聊、查看所有群 |
| 项目负责人 | 创建群聊、管理自己的群、邀请成员 |
| 员工 | 聊天、查看通讯录、文件收发 |

### 管理后台
- **用户管理** — 创建/编辑/禁用/恢复账号，按部门/角色/状态筛选，排序与分页
- **部门管理** — 部门 CRUD，卡片/表格双视图切换，按部门人数统计
- **离职处理** — 一键标记离职：自动重置密码、转移群主权限（含转移日志）、禁止登录
- **账号恢复** — 离职人员恢复访问权限，重设新密码
- **统计概览** — 总用户数、在职/离职/管理员人数实时统计

### 更多特性
- **暗色模式** — 亮色/暗色主题自动跟随系统
- **首次登录改密** — 管理员分配账号后强制修改初始密码
- **AI 流式消息** — 支持 AI 流式输出消息实时渲染（Markdown 格式）
- **会话草稿** — 切换会话时自动保存/恢复输入框内容

## 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                      极速通 (JifengIM)                         │
├────────────┬──────────────┬───────────────┬──────────────────┤
│ Chat Demo  │ Admin Panel  │  biz-backend  │   IM Server      │
│ Vue 3 + TS │ Vue 3 + TS   │  Node.js      │   Go             │
│ Vite 5     │ (内嵌)        │  Express 5    │   HTTP API       │
│            │              │  SQLite       │   WebSocket      │
└────────────┴──────────────┴───────────────┴──────────────────┘
       ▲              ▲              │              │
       │              │              │              │
       └──────────────┼──────────────┼──────────────┘
                      │              │
                 Nginx (反向代理)
                      │
            ┌─────────┴─────────┐
            │  Docker Compose    │
            │  wk-node1/2/3      │
            │  biz-backend       │
            │  wk-web (Nginx)    │
            │  Prometheus        │
            │  Grafana           │
            └────────────────────┘
```

### 技术栈

| 模块 | 技术 | 说明 |
|------|------|------|
| IM 服务端 | Go (WuKongIM v2) | 高性能分布式 IM 核心，支持三节点集群，Pebble 存储引擎 |
| 业务后端 | Node.js + Express 5 + SQLite (better-sqlite3) | 用户管理、权限控制、部门管理、群组管理、文件管理 |
| 聊天前端 | Vue 3 + TypeScript + Vite 5 | 聊天 + 管理后台一体化 SPA，wukongimjssdk 集成 |
| 管理后台前端 | Vue 3 + TypeScript (内嵌) | 与聊天前端同仓库，路由级别分离 |
| 通讯协议 | WebSocket + Protobuf | 长连接实时消息推送，二进制协议高效传输 |
| 反向代理 | Nginx | 动静分离、API 路由、WebSocket 代理、文件服务 |
| 部署 | Docker Compose | 一键启动全部服务（7 个容器） |
| 监控 | Prometheus + Grafana | IM 节点指标采集与可视化，预置 Dashboard |
| 认证 | JWT | 无状态 Token 认证，支持角色鉴权中间件 |
| 存储 | Pebble (IM) + SQLite (业务) | 高性能嵌入式 KV + 轻量关系型数据库 |

## 快速开始

### 环境要求

| 项目 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 40 GB 系统 + 100 GB 数据 | SSD |
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Docker | 24.0+ | 最新稳定版 |
| Docker Compose | v2+ | 最新稳定版 |

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/zoranges/JifengIM.git
cd JifengIM

# 2. 构建并启动全部服务
docker compose up -d --build

# 3. 查看服务状态
docker compose ps

# 4. 查看日志
docker compose logs -f
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 聊天 + 管理后台 | 18080 | `/chatdemo/` 聊天应用，管理后台入口在侧边栏 |
| IM HTTP API | 5001 | WuKongIM 服务端 API |
| IM 内部 RPC | 5100 | 节点间内部通信 |
| WebSocket | 15200 | 长连接消息推送 |
| Grafana | 3000 | 监控面板（admin / Aa12345678） |
| Prometheus | 9091 | 指标采集 |
| 管理后台 Web | 5301 | WuKongIM 内置管理界面 |

### 初始化

首次启动后，biz-backend 种子脚本自动创建：

- **超级管理员账号**: 查看启动日志获取 UID 和初始密码
  ```bash
  docker compose logs biz-backend | grep -A5 "seed"
  ```
- **默认部门**: 技术部、产品部、运营部、综合部、未分配

管理员可登录后在管理后台创建员工账号。

## 项目结构

```
JifengIM/
├── cmd/                              # Go 命令行入口
│   ├── wukongim/                     # IM 服务端主程序
│   ├── wukongimv2/                   # IM v2 服务端
│   ├── wkbench/                      # 性能基准测试工具
│   ├── wkcli/                        # 命令行客户端
│   └── wkdb/                         # 数据库管理工具
├── internal/                         # IM v1 核心实现
│   ├── access/                       # 访问控制
│   ├── app/                          # 应用层
│   ├── contracts/                    # 接口定义
│   ├── observability/                # 可观测性
│   ├── runtime/                      # 运行时
│   └── usecase/                      # 用例层
├── internalv2/                       # IM v2 核心实现（单体架构）
│   ├── access/                       # 访问控制
│   ├── app/                          # 应用入口
│   ├── contracts/                    # 接口定义
│   ├── infra/                        # 基础设施
│   ├── log/                          # 日志
│   ├── observability/                # 可观测性
│   ├── runtime/                      # 运行时配置
│   └── usecase/                      # 业务用例
├── pkg/                              # 公共库
│   ├── channel/                      # 频道管理 v1
│   ├── channelv2/                    # 频道管理 v2
│   ├── client/                       # 客户端管理
│   ├── cluster/                      # 集群管理 v1
│   ├── clusterv2/                    # 集群管理 v2
│   ├── controller/                   # 控制器 v1
│   ├── controllerv2/                 # 控制器 v2
│   ├── db/                           # 数据库适配层
│   ├── gateway/                      # 网关
│   ├── goroutine/                    # 协程管理
│   ├── metrics/                      # Prometheus 指标
│   ├── observability/                # 可观测性工具
│   ├── protocol/                     # 通信协议
│   ├── raftlog/                      # Raft 日志
│   ├── slot/                         # 槽位管理
│   ├── transport/                    # 传输层 v1
│   ├── transportv2/                  # 传输层 v2
│   ├── wklog/                        # 日志库
│   └── workqueue/                    # 工作队列
├── demo/
│   ├── chatdemo/                     # 前端 SPA (Vue 3 + TypeScript)
│   │   └── src/
│   │       ├── view/                 # 页面组件
│   │       │   ├── Chat.vue          # 聊天主界面
│   │       │   ├── Admin.vue         # 管理后台
│   │       │   ├── Login.vue         # 登录页
│   │       │   ├── Profile.vue       # 个人信息（改密码）
│   │       │   ├── GroupFiles.vue    # 群文件面板
│   │       │   └── PersonalFiles.vue # 个人文件面板
│   │       ├── components/           # UI 组件
│   │       │   ├── Conversation/     # 会话列表
│   │       │   ├── admin/            # 管理后台组件（用户/部门/群组 CRUD）
│   │       │   ├── Calendar.vue      # 日历组件
│   │       │   └── GroupInfoPanel.vue # 群信息面板
│   │       ├── composables/          # 组合式函数
│   │       │   ├── useChatMessages.ts # 消息管理核心
│   │       │   ├── useGroupFiles.ts  # 群文件逻辑
│   │       │   ├── useGroupManager.ts # 群组管理
│   │       │   ├── useMarkdown.ts    # Markdown 渲染
│   │       │   └── usePersonalFiles.ts # 个人文件逻辑
│   │       ├── messages/             # 消息类型渲染组件
│   │       ├── router/               # Vue Router 配置
│   │       └── services/             # API 客户端 & 状态管理
│   │           ├── APIClient.ts      # WuKongIM API 客户端
│   │           ├── authStore.ts      # 认证状态管理
│   │           ├── bizClient.ts      # 业务 API 客户端
│   │           ├── personalFileService.ts  # 个人文件 API
│   │           ├── groupFileService.ts    # 群文件分类 API
│   │           └── personalFileStore.ts   # 我的文档 localStorage
│   └── biz-backend/                  # 企业业务后端 (Express 5 + SQLite)
│       ├── routes/
│       │   ├── auth.js               # 登录/注册/认证
│       │   ├── admin.js              # 管理员 CRUD 用户和部门
│       │   ├── groups.js             # 群组管理 CRUD
│       │   ├── members.js            # 企业通讯录
│       │   ├── files.js              # 个人文件上传/下载/分类
│       │   └── group-files.js        # 群文件分类（服务端共享）
│       ├── middleware/
│       │   └── auth.js               # JWT 认证 + 角色鉴权
│       ├── db.js                     # SQLite 数据库初始化 & 表结构
│       ├── server.js                 # Express 服务入口
│       └── scripts/
│           └── seed.js               # 种子数据（超级管理员 + 默认部门）
├── web/                              # WuKongIM 管理平台前端 (React + Vite)
├── docker/                           # Docker 部署配置
│   ├── conf/                         # IM 节点配置文件（单节点/三节点）
│   ├── chatdemo/                     # 前端构建产物（部署目录）
│   │   ├── index.html
│   │   └── assets/                   # Vite 构建的 JS/CSS bundles
│   ├── nginx/                        # Nginx 配置模板
│   ├── observability/                # Prometheus + Grafana 配置
│   │   ├── prometheus/
│   │   │   └── prometheus.yml
│   │   └── grafana/
│   │       ├── provisioning/         # 数据源 & Dashboard 自动配置
│   │       └── dashboards/           # 预置监控面板 JSON
│   ├── biz-data/                     # 业务数据库持久化目录
│   ├── dev-cluster/                  # 三节点数据目录
│   ├── dev-observability/            # 监控数据目录
│   └── uploads/                      # 上传文件共享卷
├── docs/                             # 文档
├── scripts/                          # 运维和测试脚本
│   ├── deploy-chatdemo.sh            # 前端构建部署脚本
│   ├── backup-biz-db.sh              # 业务数据库备份
│   ├── restore-biz-db.sh             # 业务数据库恢复
│   ├── bench-*.sh                    # 性能基准测试脚本
│   ├── smoke-*.sh                    # 冒烟测试脚本
│   └── start-wukongimv2-three-nodes.sh # 三节点启动脚本
├── test/                             # 测试资源
├── resources/                        # 静态资源
├── backup.sh                         # 全量备份脚本
├── restore.sh                        # 全量恢复脚本
├── docker-compose.yml                # 三节点集群部署
├── docker-compose.single.yml         # 单节点精简部署
├── Dockerfile                        # IM 服务镜像
├── wukongim.conf.example             # IM 配置示例
├── 使用说明.md                       # 用户使用手册
└── README.md                         # 本文件
```

## 开发指南

### 启动 IM 服务端（单节点）

```bash
go build -o wukongim ./cmd/wukongim
./wukongim -c docker/conf/single-node.conf
```

### 启动业务后端

```bash
cd demo/biz-backend
npm install
node server.js
# 或开发模式（文件变更自动重启）
npm run dev
```

业务后端默认监听 `http://0.0.0.0:3001`，需要设置环境变量：
- `WK_API_URL` — WuKongIM API 地址（默认 `http://localhost:5001`）
- `DB_PATH` — SQLite 数据库路径（默认 `./biz.db`）
- `UPLOADS_DIR` — 文件上传目录（默认 `./uploads`）

### 启动前端开发

```bash
cd demo/chatdemo
npm install
npm run dev
```

### 部署前端改动

```bash
cd demo/chatdemo
npm run build
# Vite 构建产物输出到 dist/，然后：
bash scripts/deploy-chatdemo.sh   # 构建 + 同步到 docker/chatdemo
```

### 数据库管理

业务数据存储在 `docker/biz-data/biz.db`（SQLite），表结构包括：

| 表名 | 用途 |
|------|------|
| `users` | 用户账号、密码哈希、角色、部门 |
| `departments` | 部门名称和时间戳 |
| `groups` | 群组信息、群主、成员数 |
| `group_members` | 群成员关系 |
| `personal_files` | 个人文件元信息 |
| `personal_file_categories` | 个人文件分类 |
| `group_file_categories` | 群文件分类（服务端共享） |
| `group_file_mappings` | 群文件→分类映射 |
| `pinned_messages` | 群聊置顶消息 |

### API 路由

| 路径 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/biz/auth/login` | POST | 无 | 用户登录 |
| `/api/biz/auth/change-password` | POST | JWT | 修改密码 |
| `/api/biz/groups` | GET/POST | JWT | 群组列表 / 创建群组 |
| `/api/biz/groups/:id` | GET/PUT/DELETE | JWT | 群组详情 / 修改 / 解散 |
| `/api/biz/groups/:id/members` | GET/POST/DELETE | JWT | 群成员管理 |
| `/api/biz/groups/:id/files` | GET/POST | JWT | 群文件分类 CRUD |
| `/api/biz/groups/:id/pins` | GET/POST/DELETE | JWT | 群消息置顶 |
| `/api/biz/files` | GET/POST | JWT | 个人文件列表 / 上传 |
| `/api/biz/files/:id` | GET/PATCH/DELETE | JWT | 文件详情 / 更新 / 删除 |
| `/api/biz/files/:id/download` | GET | JWT | 文件下载（保留原名） |
| `/api/biz/files/categories` | GET/POST | JWT | 个人文件分类 |
| `/api/biz/admin/users` | GET/POST | Admin | 用户管理 |
| `/api/biz/admin/users/:uid` | PUT | Admin | 编辑用户 |
| `/api/biz/admin/users/:uid/depart` | POST | Admin | 标记离职 |
| `/api/biz/admin/users/:uid/reinstate` | POST | Admin | 恢复离职 |
| `/api/biz/admin/departments` | GET/POST | Admin | 部门管理 |
| `/api/biz/admin/departments/:id` | PUT/DELETE | Admin | 部门更新 / 删除 |
| `/api/biz/admin/stats` | GET | Admin | 统计概览 |
| `/api/biz/members` | GET | JWT | 企业通讯录 |
| `/api/biz/health` | GET | 无 | 健康检查 |

### 备份与恢复

```bash
# 全量备份（IM 数据 + 业务数据库 + 上传文件 + 配置）
bash backup.sh

# 全量恢复
bash restore.sh

# 仅备份业务数据库
bash scripts/backup-biz-db.sh

# 恢复业务数据库
bash scripts/restore-biz-db.sh

# Pebble 冷备份
bash scripts/backup-pebble-cold.sh
```

备份文件默认存放在 `backups/` 目录（已加入 `.gitignore`，不会提交到 Git）。

## 三节点集群架构

生产环境使用三节点 Raft 集群部署：

```
        ┌──────────────┐
        │   Nginx LB   │  (wk-web)
        └──────┬───────┘
       ┌───────┼───────┐
       │       │       │
   ┌───▼──┐ ┌──▼───┐ ┌──▼───┐
   │Node 1│ │Node 2│ │Node 3│  Raft 共识
   │Leader│ │Folwr │ │Folwr │
   └──┬───┘ └──┬───┘ └──┬───┘
      │         │        │
      └─────────┼────────┘
           Pebble KV Store
```

- **Node 1** (端口 5001/15200): API 和 WebSocket 入口
- **Node 2/3**: 数据副本，自动故障转移
- **Raft 共识**: 保证消息一致性
- **Pebble**: CockroachDB 的 LSM-Tree 存储引擎，高性能读写

## 配置说明

### IM 节点配置

参考 `wukongim.conf.example`，关键配置项：

```yaml
# 集群配置
cluster:
  nodeId: 1
  apiUrl: "http://0.0.0.0:5001"
  
# 存储配置
storage:
  type: pebble
  dataDir: /var/lib/wukongim/data
  
# WebSocket 配置
websocket:
  port: 5200
  
# 日志配置
logger:
  level: info
  dir: /var/lib/wukongim/logs
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WK_API_URL` | `http://wk-node1:5001` | IM API 地址 |
| `DB_PATH` | `./biz.db` | 业务数据库路径 |
| `UPLOADS_DIR` | `./uploads` | 上传文件目录 |
| `WK_WEB_API_URL` | `http://wk-node1:5301` | 管理后台 API |

## 常见问题

### 连接断开怎么办？

顶部状态栏红色圆点表示连接断开。检查：
1. 服务器是否正常运行：`docker compose ps`
2. WebSocket 端口是否可达
3. 浏览器控制台是否有网络错误

### 如何重置管理员密码？

```bash
# 进入业务数据库
docker compose exec biz-backend node -e "
const db = require('better-sqlite3')('/data/biz.db');
const bcrypt = require('bcryptjs');
db.prepare('UPDATE users SET password_hash = ? WHERE role = ?').run(bcrypt.hashSync('新密码', 10), 'super_admin');
console.log('超级管理员密码已重置');
"
```

### 磁盘空间不足？

定期清理旧备份：
```bash
# 保留最近 7 天的备份
find backups/ -maxdepth 1 -type d -name '2*' -mtime +7 -exec rm -rf {} \;
```

### 如何从单节点迁移到三节点？

1. 备份现有数据：`bash backup.sh`
2. 修改 `docker-compose.yml` 中的配置
3. 启动三节点：`docker compose up -d`
4. 导入备份数据

## 性能基准

使用内置的 `wkbench` 工具进行压力测试：

```bash
# 启动模拟流量
docker compose --profile dev-sim up -d wk-sim

# 查看 Prometheus 指标
open http://localhost:9091
```

预置的 Grafana Dashboard 包含：
- 消息吞吐量（msg/s）
- WebSocket 连接数
- 频道订阅数
- 节点间传输延迟
- Pebble 读写延迟
- 内存和 CPU 使用率

## 致谢

本项目基于 [WuKongIM](https://github.com/WuKongIM/WuKongIM) 构建，感谢 WuKongIM 团队的开源贡献。

## 许可证

[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
