# 🚀 疾风即时通讯 (JifengIM)

高性能即时通讯平台，提供单聊、群聊、文件管理、消息搜索、实时在线状态等完整 IM 功能。

## ✨ 功能特性

### 核心通讯
- **单聊 & 群聊** — 支持一对一私聊和多人群组聊天
- **实时消息** — 基于 WebSocket 的低延迟消息推送
- **消息状态** — 发送中 / 已送达 / 发送失败 状态追踪
- **流式消息** — AI 流式输出消息实时渲染

### 文件管理
- **多类型文件** — 支持图片、视频、音频、PDF、Word、Excel、压缩包等
- **文件卡片** — 聊天气泡内美观的文件卡片展示
- **文件面板** — 每个群组独立的文件管理面板，分图片/文档两个视图
- **在线预览** — 图片大图预览，文件点击下载

### 搜索
- **聊天记录搜索** — 全文搜索历史消息
- **关键词高亮** — 搜索结果中关键词高亮显示
- **实时过滤** — 输入即搜，即时展示匹配结果

### 群组管理
- **实时在线人数** — 15 秒轮询 + 订阅者事件驱动的在线状态
- **成员追踪** — 群组成员自动追踪与统计
- **会话列表** — 最近会话列表，未读计数

### 管理平台
- **集群运维** — 节点、槽位、频道集群状态监控
- **业务管理** — 频道管理、订阅者管理、消息查询
- **系统诊断** — 日志查看、分布式任务追踪、性能指标
- **暗色模式** — 支持亮色/暗色主题切换

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────┐
│                   疾风即时通讯                      │
├──────────────┬──────────────────┬────────────────┤
│  Chat Demo   │  Manager Web     │  IM Server     │
│  Vue 3 + TS  │  React 19 + TS   │  Go            │
│  Vite 5      │  Vite 8          │  HTTP API      │
│              │  shadcn/ui       │  WebSocket     │
│              │  Recharts        │  gnet          │
└──────────────┴──────────────────┴────────────────┘
         ▲              ▲              │
         │              │              │
         └──────────────┼──────────────┘
                        │
                   Nginx (反向代理)
                        │
              ┌─────────┴─────────┐
              │   Docker Compose   │
              │  wk-node1          │
              │  wk-web (Nginx)    │
              │  prometheus        │
              │  grafana           │
              └────────────────────┘
```

### 技术栈

| 模块 | 技术 | 说明 |
|------|------|------|
| IM 服务端 | Go | 高性能分布式 IM 核心 |
| 通讯协议 | WebSocket / TCP | 长连接消息推送 |
| 聊天前端 | Vue 3 + TypeScript + Vite 5 | 单聊/群聊/文件/搜索 |
| 管理后台 | React 19 + TypeScript + Vite 8 | 集群运维与业务管理 |
| UI 框架 | Tailwind CSS + shadcn/ui | 现代化 UI 组件 |
| 部署 | Docker Compose | 一键部署 |

## 🚀 快速开始

### 环境要求
- Docker & Docker Compose
- 2核4G 以上服务器

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/zoranges/JifengIM.git
cd JifengIM

# 2. 启动服务 (单节点模式)
docker compose -f docker-compose.single.yml up -d

# 3. 查看服务状态
docker compose ps
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Chat Demo | 18080 | `/chatdemo/` 聊天应用 |
| Manager | 18080 | `/` 管理平台 |
| HTTP API | 5001 | IM 服务端 API |
| WebSocket | 15200 | 长连接通讯 |
| Grafana | 3000 | 监控面板 |
| Prometheus | 9091 | 指标采集 |

### 默认账号

- **管理平台**: 用户名 `admin`，密码 `a1234567`

## 📁 项目结构

```
JifengIM/
├── cmd/                    # Go 命令行入口
│   ├── wukongim/           # IM 服务端主程序
│   └── ...
├── internal/               # 服务端内部实现
├── pkg/                    # 公共库
├── demo/chatdemo/          # 聊天 Demo (Vue 3)
│   └── src/
│       ├── view/           # 页面组件
│       ├── components/     # 通用组件
│       ├── composables/    # 组合式函数
│       ├── messages/       # 消息类型组件
│       └── services/       # API & 工具
├── web/                    # 管理平台 (React)
│   └── src/
│       ├── pages/          # 页面
│       ├── components/     # 组件
│       └── i18n/           # 国际化
├── docker/                 # Docker 配置
│   ├── conf/               # IM 服务配置
│   └── chatdemo/           # 聊天 Demo 静态文件
├── docker-compose.yml           # 集群部署
└── docker-compose.single.yml    # 单节点部署
```

## 💻 开发指南

### 启动 IM 服务端

```bash
# 构建
go build -o wukongim ./cmd/wukongim

# 使用单节点配置启动
./wukongim -c docker/conf/single-node.conf
```

### 启动聊天前端

```bash
cd demo/chatdemo
npm install
npm run dev
```

### 启动管理平台

```bash
cd web
npm install
npm run dev
```

## 🔧 配置说明

核心配置文件位于 `docker/conf/` 目录：

| 文件 | 说明 |
|------|------|
| `single-node.conf` | 单节点部署配置 |
| `node1.conf` / `node2.conf` / `node3.conf` | 集群节点配置 |

主要配置项：

```ini
# API 端口
WK_API_LISTEN_ADDR=0.0.0.0:5001

# WebSocket 端口
WK_GATEWAY_LISTENERS=[...,{"name":"ws-gateway","network":"websocket","address":"0.0.0.0:5200"}]

# 外部地址
WK_EXTERNAL_WSADDR=ws://your-server:15200

# 管理平台 JWT
WK_MANAGER_JWT_SECRET=your-secret-key
WK_MANAGER_USERS=[{"username":"admin","password":"your-password"}]
```

## 📄 致谢

本项目基于 [WuKongIM](https://github.com/WuKongIM/WuKongIM) 构建，感谢 WuKongIM 团队的开源贡献。

## 📄 许可证

[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)

---

**疾风即时通讯** — 让消息传递如风般迅捷 ⚡
