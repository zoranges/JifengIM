# 极速通 (JifengIM)

面向中小企业的即时通讯平台，基于 [WuKongIM](https://github.com/WuKongIM/WuKongIM) 构建。支持单聊、群聊、企业通讯录、分级权限管控、离职人员处理、文件管理、消息搜索等功能。

## 功能特性

### 企业通讯
- **单聊 & 群聊** — 一对一私聊和多人群组聊天，支持文字、图片、文件、语音等消息类型
- **企业通讯录** — 全企业成员浏览，按部门筛选，点击成员直接发起会话
- **群组管理** — 创建群聊自动分配房间号，群主可邀请成员、踢人、解散群
- **实时在线状态** — 成员在线/离线实时感知
- **消息状态追踪** — 发送中 / 已送达 / 发送失败

### 分级权限
| 角色 | 权限 |
|------|------|
| 超级管理员 | 全部权限：管理用户、部门、系统配置 |
| 管理员 | 用户管理、部门管理、创建群聊 |
| 项目负责人 | 创建群聊、管理自己的群 |
| 员工 | 聊天、查看通讯录、文件收发 |

### 管理后台
- **用户管理** — 创建/编辑/禁用/恢复账号，按部门/角色/状态筛选，排序与分页
- **部门管理** — 部门 CRUD，卡片/表格双视图，按部门人数统计
- **离职处理** — 一键标记离职：自动重置密码、转移群主权限、禁止登录
- **账号恢复** — 离职人员恢复访问权限，重设密码
- **统计概览** — 总用户数、在职/离职/管理员人数实时统计

### 更多功能
- **文件管理** — 支持图片、视频、PDF、Office 文档，群文件面板分类浏览
- **消息搜索** — 全文搜索历史消息，关键词高亮
- **暗色模式** — 亮色/暗色主题自动跟随系统
- **首次登录改密** — 管理员分配账号后强制修改初始密码
- **AI 流式消息** — 支持 AI 流式输出消息实时渲染

## 技术架构

```
┌──────────────────────────────────────────────────────────┐
│                       极速通 (JifengIM)                     │
├─────────────┬──────────────┬───────────────┬──────────────┤
│  Chat Demo  │  Admin Panel │  biz-backend  │  IM Server   │
│  Vue 3 + TS │  Vue 3 + TS  │  Node.js      │  Go          │
│  Vite 5     │  (内嵌)       │  Express 5    │  HTTP API    │
│             │              │  SQLite       │  WebSocket   │
└─────────────┴──────────────┴───────────────┴──────────────┘
        ▲              ▲              │              │
        │              │              │              │
        └──────────────┼──────────────┼──────────────┘
                       │              │
                  Nginx (反向代理)
                       │
             ┌─────────┴─────────┐
             │   Docker Compose   │
             │  wk-node1/2/3      │
             │  biz-backend       │
             │  wk-web (Nginx)    │
             │  prometheus        │
             │  grafana           │
             └────────────────────┘
```

### 技术栈

| 模块 | 技术 | 说明 |
|------|------|------|
| IM 服务端 | Go (WuKongIM) | 高性能分布式 IM 核心，三节点集群 |
| 业务后端 | Node.js + Express 5 + SQLite | 用户管理、权限控制、部门管理 |
| 前端 | Vue 3 + TypeScript + Vite 5 | 聊天 + 管理后台一体化 SPA |
| 通讯协议 | WebSocket | 长连接实时消息推送 |
| 反向代理 | Nginx | 动静分离、API 路由 |
| 部署 | Docker Compose | 一键启动全部服务 |
| 监控 | Prometheus + Grafana | 节点指标采集与可视化 |

## 快速开始

### 环境要求

- Docker & Docker Compose
- 2核4G 以上服务器（20人团队最低配置）

### 部署步骤

```bash
# 1. 克隆项目
git clone https://github.com/zoranges/JifengIM.git
cd JifengIM

# 2. 构建并启动全部服务
docker compose up -d --build

# 3. 查看服务状态
docker compose ps
```

### 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 聊天 + 管理后台 | 18080 | `/chatdemo/` 聊天应用，「管理后台」入口在侧边栏 |
| IM HTTP API | 5001 | WuKongIM 服务端 API |
| WebSocket | 15200 | 长连接通讯 |
| Grafana | 3000 | 监控面板 |
| Prometheus | 9091 | 指标采集 |

### 初始化

首次启动后，biz-backend 种子脚本自动创建：

- **超级管理员账号**: 查看启动日志获取 UID 和初始密码
- **默认部门**: 技术部、产品部、运营部、综合部、未分配

管理员可登录后在管理后台创建员工账号。

### 服务器配置建议

**20人团队最低配置（阿里云 ECS）：**

| 项目 | 配置 |
|------|------|
| 实例规格 | ecs.c7a.large / ecs.g7a.large（2vCPU 4GB） |
| 系统盘 | ESSD PL0 40GB |
| 数据盘 | ESSD PL1 100GB（存放上传文件与数据库） |
| 带宽 | 按量计费 3-5 Mbps |
| 操作系统 | Ubuntu 22.04 LTS |

## 项目结构

```
JifengIM/
├── cmd/                          # Go 服务端入口
├── internal/                     # IM 服务端核心
├── pkg/                          # 公共库
├── demo/
│   ├── chatdemo/                 # 前端 SPA (Vue 3)
│   │   └── src/
│   │       ├── view/             # 页面: Chat, Admin, Login, Profile
│   │       ├── components/       # 组件
│   │       │   └── admin/        # 管理后台组件
│   │       ├── composables/      # 组合式函数
│   │       ├── messages/         # 消息类型渲染
│   │       ├── router/           # 路由配置
│   │       └── services/         # API 客户端 & 状态管理
│   └── biz-backend/              # 企业业务后端 (Express 5)
│       ├── routes/               # auth, admin, groups, members
│       ├── middleware/            # JWT 认证, 角色鉴权
│       ├── db.js                 # SQLite 数据库初始化
│       ├── server.js             # 服务入口
│       └── scripts/seed.js       # 种子数据脚本
├── web/                          # WuKongIM 管理平台 (React)
├── docker/                       # Docker 部署配置
│   ├── conf/                     # IM 节点配置
│   ├── chatdemo/                 # 前端构建产物（部署目录）
│   ├── nginx/                    # Nginx 配置
│   └── observability/            # Prometheus + Grafana 配置
├── docker-compose.yml            # 集群部署
└── Dockerfile                    # IM 服务镜像
```

## 开发指南

### 启动 IM 服务端

```bash
go build -o wukongim ./cmd/wukongim
./wukongim -c docker/conf/single-node.conf
```

### 启动业务后端

```bash
cd demo/biz-backend
npm install
node server.js
```

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
bash scripts/deploy-chatdemo.sh   # 构建 + 同步到 docker/chatdemo
```

## 致谢

本项目基于 [WuKongIM](https://github.com/WuKongIM/WuKongIM) 构建，感谢 WuKongIM 团队的开源贡献。

## 许可证

[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0)
