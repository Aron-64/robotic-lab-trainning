# Robotic Lab 训练管理平台

平台已接入 OpenPI PyTorch 真实训练：环境预检、任务队列、真实进程、日志/Loss、停止与 Checkpoint 续训。侧栏“模型训练”和“训练任务”进入真实流程；原演示页面仍保留，Mock 总览和 Mock Checkpoints 不代表真实任务。模型导入、数据集上传及 GPU 数量检测也是实际操作。

## 本地开发

建议 Node.js 24（测试使用 Node.js 的 TypeScript 支持）。

```bash
npm install
npm run dev
```

访问 http://localhost:5173 。支持 Vite 热更新。端口占用时以终端输出为准；VS Code Remote 可在 Ports 面板转发端口。

## 页面和流程

| 页面 | 内容 |
| --- | --- |
| 总览 `/#/` | GPU 资源、统计、任务活动、最近任务、Checkpoint、系统事件；Loss 仅显示选中的运行任务，默认选择最新启动任务 |
| 模型训练 `/#/training` | 单页表单：模型/数据集下拉选择、全部训练参数、GPU 数量、保存/恢复及折叠命令预览；启动后进入监控 |
| 训练任务 `/#/jobs` | 搜索、状态/模型筛选、时间/进度排序、停止任务、查看监控 |
| 任务监控 `/#/jobs/:id` | 8 项指标、4 张图表、模拟日志、自动滚动、清空视图/恢复、日志下载、Checkpoint、模拟失败 |
| 模型管理 `/#/models` | 模型详情、虚拟环境配置编辑及模拟环境检测 |
| 数据集 `/#/datasets` | 搜索、格式筛选、详情、真实本机文件/文件夹上传；预置样本保留 Mock 标记 |
| Checkpoints `/#/checkpoints` | 模型/任务筛选、详情、模拟 JSON 下载、Resume 配置预填 |
| 设置 `/#/settings` | 主题、模拟时钟、配置导出、重置演示、后端配置说明 |

建议预览流程：新建训练 → 配置 1,000 Steps / 500 保存间隔 → 启动模拟训练 → 查看监控 → 等待 Checkpoint → 模拟 Resume。创建的新任务先进入 Pending，下一个模拟 tick 变为 Running。可在监控详情中模拟 GPU 显存不足，触发 Failed 状态和侧边栏错误提示。

## 模拟行为与边界

- 单一全局时钟每 2 秒更新任务，不因切换页面重复启动。浏览器后台可能节流；关闭页面后不推进。时长和预计剩余均为模拟值。
- 每个任务拥有独立配置、Loss 历史、运行指标与日志。同一模型的不同场景或实验不会共用曲线。
- 参数验证覆盖步数、Batch Size、学习率、GPU、保存间隔、种子、模型专属演示参数；这些默认值不是实际模型的通用推荐配置。
- Checkpoint 到保存间隔时生成，包含任务、步数与 Loss 元数据。Resume 创建新任务，继承配置并从保存步数继续；总步数必须大于恢复步数。
- GPU 数量选项上限由当前容器只读检测确定；模拟任务仍允许资源复用，无真实 GPU 调度。Epoch 由 episode 数估算，不代表真实 batch/sample 统计。
- 活动图与系统事件保留固定历史 Mock 示例；任务统计与实时指标使用当前状态。总览保留最近 4 条任务及 3 条 Checkpoint。
- 浏览器 localStorage 保存任务、Checkpoint、模型和数据集配置；刷新恢复数据。日志最多保留最近 300 行、Loss 最近 250 点、GPU/LR 指标最近 200 点，以控制存储体积。下载日志为当前保留的完整日志。
- 重置演示会恢复默认任务/配置、清除模拟错误并恢复时钟；主题偏好保留。
- 训练命令仅用于展示结构，未适配真实模型 CLI，不执行命令。
- 模拟环境检测不读取系统；模型/数据集兼容性全部待验证。
- 训练日志与 Checkpoint 下载明确标记模拟，仅包含日志或 JSON 元数据；新建模型中的权重下载为真实操作。

## 验证与构建

```bash
npm test
npm run build
npm run preview
```

测试覆盖参数校验、任务状态流转、暂停/停止/失败、Checkpoint/Resume、持久化和重置，并通过 Vue 服务端渲染检查所有页面（含不存在任务与恢复参数路由）。它不等同于浏览器点击或视觉验证。

ECharts 独立 chunk 约 538 KB，构建有大 chunk 提示，不影响构建；其余页面按路由拆分加载。

## 架构与部署

Vue 3、TypeScript、Vite、Pinia、Vue Router、ECharts、Lucide。统一自定义 CSS 与基础组件用于保持当前设计。

- `src/views`：页面。
- `src/components`：布局、图表、公共弹窗与总览组件。
- `src/stores`：共享状态、错误提示及持久化。
- `src/mocks/catalog.ts`：模型/数据集演示目录与默认参数。
- `src/mocks/engine.ts`：可独立验证的参数校验及训练状态推进。
- `src/api/mock.ts`：模拟数据入口；`src/api/client.ts`：未来 FastAPI Client，错误接入提示区。
- `src/types`：核心数据类型；`src/styles`：设计系统。

产物位于 `dist/`，可由 Nginx 等静态服务托管。Hash 路由不要求子路径回退。依赖、SVG Logo、图标均本地打包，无 CDN 字体或外部模型 API。

未来可将项目复制至 `/mnt/data/11197277/train_web` 后安装依赖、构建。复制 `.env.example` 为 `.env.local`，配置 `VITE_API_BASE_URL` 后重新构建。当前页面始终使用 Mock，不会因设置 API URL 自动启动真实训练。真实接入还需认证、数据适配、任务调度和后端事件流。本次未操作云端服务器。

## 容器 GPU 资源检测

训练页面请求 `GET /api/resources/gpus`，服务端优先执行只读 `xpu-smi`，解析 P800 设备表，并检查 `XPU_VISIBLE_DEVICES` / `CXPU_VISIBLE_DEVICES` 的限制；工具不存在且没有 XPU 可见性配置时才回退到 `nvidia-smi`，检查 `NVIDIA_VISIBLE_DEVICES` / `CUDA_VISIBLE_DEVICES`。返回 `status`、`count`、`devices`、`source`、`checkedAt`。检测失败或零 GPU 时禁用启动，不回退到虚构容量。启动前重新查询并校验数量，设备由模拟分配器自动选择。

`npm run dev` 和 `npm run preview` 已内置此只读接口。生产静态部署时浏览器不能直接执行 xpu-smi / nvidia-smi：可在同一个 GPU 容器内运行 `npm run gpu-api`（默认监听 127.0.0.1:8001），由网关将 `/api/resources/gpus` 反向代理到该服务；或由未来 FastAPI 实现相同返回结构。服务必须运行在申请到 GPU 的容器内，不能运行在宿主机后向用户报告宿主机总卡数。检测失败、可见性配置不一致或 MIG 环境需要平台专用资源接口。没有实现训练后端、资源申请或云端部署。

## 真实模型导入

从“模型管理 → 新建模型”输入模型名称、公开 GitHub 仓库首页、Hugging Face 或 ModelScope 权重仓库首页。可选权重 revision 和容器内已安装的 Python 版本。提交后真实执行下载与标准 Python 安装，不运行训练。

- 默认存储根目录：项目下 `managed-models/`；可在启动服务前通过 `MODEL_STORAGE_ROOT` 环境变量指定管理目录。
- 每次导入独立 UUID 目录，包含 `code/`、`weights/`、`.venv/`、`import.json`。不会覆盖其他模型目录。真实文件与导入记录不受“重置演示”影响。
- 服务使用 `git clone --depth 1` 拉取默认分支，记录 commit；不自动初始化 submodule 或拉取 Git LFS 文件。需要这类额外步骤的仓库应按 README 人工处理。
- 权重下载使用独立 `.downloader` 环境中的官方 SDK，下载整个模型仓库快照，支持 SDK 的缓存/断点重试。模型仓库代码不会作为权重加载代码执行。
- README 解析器只识别 fenced code 中精确的 `pip install -r <相对路径.txt>`、`pip install .`、`pip install -e .` 及本地 extras 形式。Python 版本不匹配、Conda、CUDA、系统包、uv、自定义脚本或其他无法识别的 pip 参数会标记“需人工处理”，不会盲目执行 README。
- 支持的安装计划在独立 venv 中自动执行，随后运行 `pip check` 和 Python / PyTorch 元数据检查。就绪表示基础依赖检查通过，不等于训练可运行或 CUDA 已验证。
- GitHub 目前仅支持公开仓库。受限 Hugging Face 权重需先获得仓库访问权，并在服务环境设置 `HF_TOKEN`；ModelScope 使用服务端 `MODELSCOPE_API_TOKEN`。凭据不通过页面提交，不写入导入记录，已知令牌从日志中过滤。
- 导入过程会执行仓库安装代码，需使用可信项目。一次只运行一个导入任务，可取消、查看日志、失败后重试。取消保留已下载文件；服务重启后标记中断，不自动恢复执行。
- `npm run dev` / `npm run preview` 已包含导入接口。正式静态部署可运行 `npm run model-api`（同时提供模型导入与 GPU 资源接口，默认 loopback:8001），网关保留 Host 与 Origin 并代理 `/api/model-imports` 和 `/api/resources/gpus`。不要同时在相同端口运行 `gpu-api` 和 `model-api`。
- 模型接口联调期间接受远程 JSON 请求，不校验来源 IP、Origin 或网关白名单。目录合法性及导入参数检查仍保留。

新页面：`/#/models/new`。成功导入的模型自动加入训练选择列表（训练依旧是 Mock）。真实导入列表从服务端持久化目录读取，页面刷新不会丢失。

测试使用隔离目录和命令执行替身覆盖导入阶段、README 策略、失败状态和记录落盘，不下载真实大型模型；实际仓库的依赖可安装性仍需具体导入验证。

SDK 参考：[Hugging Face snapshot_download](https://huggingface.co/docs/huggingface_hub/en/package_reference/file_download)、[ModelScope snapshot_download](https://github.com/modelscope/modelscope/blob/master/modelscope/hub/snapshot_download.py)。

## 新建数据集与本机上传

`/#/datasets/new` 从访问网页的电脑选择多个文件或一个文件夹，经浏览器上传到服务所在机器。浏览器不暴露完整本机路径，文件夹使用 `webkitRelativePath` 保留相对目录。无自动解压、格式转换或内容执行。

- API：`/api/dataset-uploads`，先提交文件清单，再顺序 PUT 每个文件，完成后提交 `complete`。XHR 提供进度，服务端流式写盘并核对文件长度、计算 SHA-256；只有全部完成的数据集进入管理列表。
- 默认目录 `managed-datasets/`；通过服务启动环境 `DATASET_STORAGE_ROOT` 配置云端挂载目录。`DATASET_MAX_BYTES` 配置每次上传总大小，默认 100 GiB，最多 10,000 文件。
- 支持当前页面内暂停/继续，已成功上传的文件跳过，失败的当前文件重新上传；不是文件内分块断点续传。刷新/关闭页面会失去浏览器 File 引用，需要重新选择上传，服务端未完成目录需由运维定期清理。离开正在上传的页面会提示先暂停。
- “取消并清理”终止未完成上传并删除该会话下的数据文件，不影响其他数据集。取消状态记录保留。已完成的数据集不能通过取消接口删除。
- 上传后的 Episodes 和模型兼容性显示待解析，不以模拟值代替。数据格式字段仅为用户标注。
- `npm run dev` / `npm run preview` 已内置上传服务；`npm run model-api` 也包含此接口。正式云端网关需将 `/api/dataset-uploads` 路径代理至同一容器服务，配置上传大小、超时及 `proxy_request_buffering off`（例如 Nginx），并负责认证、租户隔离与存储配额。接口不提供跨域上传，客户端和 API 使用同源路径。
- 当前本地预览上传写入本地开发机；部署到云容器并配置云端数据目录后才写入云端。本次未操作云服务器。

新建模型、新建训练、新建数据集均采用单列参数布局，每行一个配置项。

### 数据集本地上传与云端上传

新建数据集的“本地上传”保留浏览器文件和文件夹选择。“云端上传”接受运行后端的云容器内绝对路径（文件或文件夹），异步复制到 `managed-datasets/<id>/files`，不移动源文件、不解压，也不下载 HTTP/S3/OSS 链接。文件夹导入保留内部相对目录；空目录不登记。复制完成后自动加入数据集列表。进度按已完整复制文件的字节数更新；复制失败可取消清理后重试。刷新页面不会终止服务端复制，但当前页面不自动恢复未完成任务；服务重启会将中断任务标为失败。

允许的云端源目录默认是 `/mnt/data`。可以在启动服务前设置 `DATASET_IMPORT_ROOTS=/mnt/data:/data/datasets`（Linux 冒号分隔），只配置专用数据目录。源路径须在允许目录内，不得与管理目录互相包含；子目录中的符号链接和特殊文件拒绝导入。数量、空间及大小限制与本地上传一致。服务需要源文件读取权限与目标目录写入权限，部署到云端后才能读取云端文件；生产环境仍需在反向代理层配置身份认证与访问控制。

P800 容器建议设置 `ACCELERATOR_BACKEND=xpu` 后启动服务，例如 `ACCELERATOR_BACKEND=xpu npm run dev`；默认 `auto` 优先 XPU，也支持 `nvidia` 显式选择。`xpu-smi` 需在服务进程的 PATH 中。当前支持 P800 OAM/PCIe 常见设备表格式，未知格式返回检测错误，不猜测数量。编号必须与可见性变量一致，返回的 XPU 设备另附 `physicalIndex`。XPU 驱动故障不会回退到 NVIDIA。此功能只检测设备，不完成 P800 训练框架适配。

数量反映容器可见且符合可见性变量的设备；不能从硬件工具单独推断云平台申请配额。平台必须正确隔离设备或注入可见性变量。虚拟卡及编号重映射需要对接平台资源接口。解析及回退已用模拟输出测试，尚未在实际 P800 容器验证。命令参考：[百度智能云 AIHC 文档](https://bce-cdn.bj.bcebos.com/p3m/pdf/bce-doc/online/AIHC/AIHC.pdf)。

### 转移已有模型（复用 env 路径）

“新建模型”可选择“增加模型”或“转移模型”。转移需要云容器内代码目录、权重目录、已有环境目录的绝对路径。服务先执行原 `env/bin/python -m pip check` 并探测 Python/PyTorch 包元数据、核对 `sys.prefix`，之后异步复制代码及权重到独立管理目录。原环境不复制、不安装依赖，原代码和权重不删除；位于代码/权重内部的原 env 目录会排除复制。支持阶段、文件/字节进度、日志、取消和重试。取消或失败保留本次部分副本；重试重新构建本次副本，不动源数据。

默认仅允许 `/mnt/data` 下的源目录；额外路径可设置 `MODEL_TRANSFER_ROOTS=/mnt/data:/data/models`（Linux 冒号分隔），环境也必须在允许范围内。源目录不得与管理目录互相包含。仅支持普通文件/目录；符号链接会报错，需要先准备普通文件副本。环境的 bin/python 可使用 venv 常见的解释器链接。请使用可信环境，校验会执行环境内 Python；此检查不保证训练入口、XPU 库或完整模型兼容性。已有 editable 安装可能继续引用原代码，必须保留原代码和 env；服务不会自动重写依赖。

模型转移支持云端页面直接提交。已使用临时真实无 pip Python 环境验证复制和重试；尚未在用户实际 P800 环境验证。

### 数据集分类与可视化

数据集列表按 Franka、Openarm、宇树G1、仿真、其他、未分类筛选。新建数据集支持项目分类与 LeRobot v2.1 / LeRobot v3.0 标注，已有数据可在可视化页保存分类到服务端；旧数据默认未分类。点击名称或“可视化”进入 `/datasets/:id`。

可视化页提供 Episode 搜索/分页、多相机视频、统一时间轴、播放/暂停、倍速、按 FPS 逐帧定位、元信息、Features 和文件搜索。v2.1 读取 `meta/info.json` 与 `meta/episodes.jsonl`；v3.0 使用 Node 的 hyparquet / hyparquet-compressors 读取 `meta/episodes/**/*.parquet`，依据各相机的 chunk/file 索引及 from/to_timestamp 播放共享视频片段。可识别上传文件夹带来的单层或多层外包装目录。界面按相机最短公共时长同步播放，浏览器定位精度受编码关键帧影响，不是实验级帧同步工具。

服务端 `GET /api/dataset-uploads/:id/visualization` 返回解析结果；`GET/HEAD /api/dataset-uploads/:id/video?path=...` 支持单段 HTTP Range 与 416 响应，视频仅限上传清单中的 MP4/WebM/MOV，路径真实解析必须位于数据集内。只读，不执行数据集中的代码。云端网关应沿用平台认证并透传 Range。

缺少元数据时可浏览原始视频；v3 原始视频可能含多个 Episode。包含多个数据集根目录时需分别导入。Episode 索引最多展示 10,000 条，JSON 元数据上限 16 MB，文件搜索每次显示前 100 条。浏览器必须支持视频编码（AV1/HEVC 支持因浏览器而异）；不自动转码、解压或解析内嵌图片视频。HDF5/普通 Parquet 可查看清单及独立视频，目前不提供其内部数组、动作/状态曲线。格式标注不会转换数据，实际识别以 meta/info.json 为准。Mock 条目没有真实视频。

安装更新时执行 `npm ci`，然后构建并重启应用/API。新增测试使用真实生成的 v3 Parquet 索引，验证共享视频偏移、v2 外包装路径、Range/HEAD、越界路径及分类持久化；尚未用用户云端视频进行浏览器播放实测。格式参考：[LeRobot v3 官方说明](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)。

可视化性能：列表接口省略完整 files 清单（返回空数组，fileCount 保留）；单条上传查询仍包含清单，支持续传。详情页已有本地条目时直接加载可视化。解析结果内存缓存 5 分钟，最多 12 条 / 32 MB，并发请求共享解析；分类修改会失效，服务重启后重新解析。小于等于 32 MB 的 v3 Parquet 索引一次读取，减少网络挂载盘随机读取。直接修改底层文件后最多等待 5 分钟缓存过期。首次加载仍解析最多 10,000 条 Episode，尚未实现服务端 Episode 分页。

索引卡住处理：解析在独立 Worker 中运行（256 MB 堆限制），12 秒未完成时停止等待、请求终止 Worker，并返回原始视频清单和错误提示。该降级不能修复损坏的元数据或挂载盘；视频文件本身仍需存储可读。前端使用显式 20 秒超时并中止请求，覆盖响应体读取，不再仅依赖 AbortSignal.timeout。服务初始化/网关卡住会在前端提示超时。部署时需同时更新前端构建及后端 server 目录并重启。

### 权重来源与 Checkpoint 版本

转移模型现在区分基础权重、实验 Checkpoints、不导入权重。实验模式填写包含数字步骤目录的根目录，点击扫描后选择一个或多个版本，显示步骤、格式、结构检查和大小；服务在导入时重新校验选中版本。仅识别 model.safetensors（非空文件）及 JAX params 目录；PyTorch 续训还要求 optimizer.pt、metadata.pt，JAX 要求 train_state。结构检查不反序列化权重，不保证张量和架构兼容。未知或分片权重目录尚不能作为已识别 Checkpoint 导入，基础目录可保留管理。

代码复制排除根 checkpoints、wandb、.git、环境、常见缓存、.log 和指定权重目录，assets 与实际源码保留；选中步骤以 weights/<step> 存储，附带原实验目录与格式元信息。原 env 未安装 pip 时保留“依赖未验证”提示，仍可导入；有 pip 时依赖检查失败仍中止。

导入模型创建模拟训练时区分基础权重初始化、Checkpoint 参数微调、完整状态续训和从零训练。PyTorch 流程拒绝 JAX Checkpoints；“最新兼容版本”在创建任务时固定为具体版本路径并保存到任务配置/日志。新任务从 0 开始，模拟续训从选中步骤开始。保留数量仅删除当前模拟任务的历史 Checkpoint 记录，不删除真实磁盘文件。真实训练使用下方独立流程；架构兼容性自动验证和权重转换仍未实现。

### 云端模型访问配置（更新）

模型接口联调期间不使用 MODEL_TRUSTED_PROXY_IPS 或 MODEL_ALLOWED_ORIGINS。扫描、导入、取消与重试均允许远程 JSON 请求，不再要求本地连接或配置受信任网关。用户登录和权限控制留待后续接入。

Checkpoint 扫描已改为内容识别：检查所填目录，若本身有权重则作为一个版本；否则检查直接子目录，不要求数字命名。支持 safetensors/bin/pt/pth/ckpt 文件及 JAX params 目录。通用文件扩展名不保证 PyTorch/OpenPI 兼容，未知格式仅允许接入管理。非数字版本步数显示未知，不从文件名猜测；自动选择仅在已知步数的兼容版本中取最大值。扫描与导入不再使用网关白名单。


### OpenPI PyTorch 真实训练

入口：侧栏“模型训练” → `/#/training/real`；侧栏“训练任务” → `/#/real-jobs`。所有参数每行一项。仅支持已经导入的真实项目及数据集；项目需提供 `train_loop(config)` 和与示例一致的 OpenPI dataclass 配置。默认入口 `scripts/train_pytorch.py`。不会自动改装 JAX 训练为 PyTorch。

服务用导入记录中的 Python 启动项目，显式加入导入代码的 src 路径。预检执行 torch.cuda 可用性、设备数量及小张量计算，导入实际入口和配置；P800 需安装能支持该入口 torch.cuda/NCCL 接口的 PyTorch 兼容栈，xpu-smi 能列卡不等于训练可用。预检不加载大模型或完整数据，也不保证多卡通信通过。环境无需 pip，但原环境和依赖路径必须保留。

- 基础权重和 Checkpoint 参数微调要求非空 `model.safetensors`，从 Step 0 开始。JAX Orbax 的 params 不能作为 PyTorch 初始化权重。分片权重目前不支持。
- 数据集自动定位唯一 `meta/info.json` 的根目录，映射为 `data.repo_id`。上传分类/格式标签不会转换数据；项目的 LeRobot 依赖版本、相机/动作字段、assets/<配置名>/<asset_id>/norm_stats.json 必须匹配。相对 assets 目录来自已导入项目。
- 全局 Batch Size 必须被 GPU 数量整除。单卡直接启动 Python，多卡使用该环境的 `torch.distributed.run`。当前队列只并发一个平台任务；不能预留或停止平台外占用 GPU 的进程。
- 日志原文写入 `training-outputs/<任务名称_模型名称_数据集名称_时间>/training.log`，页面轮询最新 300 行和最近 2,000 个 Loss 点，解析示例入口的 `step=… loss=… lr=…` 日志。未输出指标时留空。新任务的输出、配置、日志和状态写入 `training-outputs` 下的可读任务目录，可通过 `TRAINING_OUTPUT_ROOT` 修改输出根目录。`TRAINING_STORAGE_ROOT` 仍用于稳定任务 ID 索引和旧任务读取。
- 保存间隔交给原脚本执行，适配器确保最后一步调用正常保存逻辑。只登记同时有非空 model.safetensors、optimizer.pt、metadata.pt 的数字步骤目录，不读取 tmp_*。目前保留所有快照，需自行规划磁盘容量；结构检查不保证张量可恢复。
- 停止发送 SIGTERM，10 秒未退出则 SIGKILL，不强制保存新的 Checkpoint。续训在原任务终止后选择完整步骤，创建新任务并异步复制该快照，然后让原脚本恢复模型、优化器和 step。复制需要额外磁盘空间；保留原任务，复制失败可查看原因。停止大型文件复制会在当前文件完成后生效。
- 监督进程独立于 HTTP 服务，服务重启不会主动终止已有训练；机器/容器重启后存活进程检查会标记中断。不要在运行中移动项目或删除任务文件。多个 API 实例需要共享同一绝对存储根目录（同一台 Linux 主机）；分布式多节点调度暂不支持。

云端验收：更新代码、`npm ci`、`npm run build` 后重启提供页面/API 的服务。导入完整 OpenPI 项目、原 env、兼容 PyTorch 权重和匹配数据集。进入真实训练，先选 1 GPU、Batch Size 1、workers 0、总步数 20、保存间隔 10、日志间隔 1，核对配置名/Asset ID 后预检。创建任务，确认日志与 Loss 来自训练脚本，检查 Checkpoint；再创建较长任务测试停止，并从已保存步骤恢复到更大总步数。单卡通过后再逐步测试多卡。

验证范围：`npm test` 包含真实 Node/Python 子进程、队列、日志、最终保存、停止、续训和失败路径的集成测试，其中硬件和 OpenPI 使用隔离 fixture；这不是 P800 真机训练结果。用户云端的模型加载、数据兼容性、显存容量及多卡通信仍需实测。模型总览、演示任务以及原 Checkpoints 页仍为独立 Mock，真实 Checkpoints 在真实任务详情查看。


### 训练输出目录

新任务自动保存为 `training-outputs/任务名称_模型名称_数据集名称_YYYYMMDD-HHmmss/`，内部直接包含 `checkpoints/<step>/`、`training.log`、`config.json`，以及平台状态文件。创建训练页显示根目录及规则，任务详情显示实际绝对路径。目录创建后不随展示名称变化。

默认根目录相对于服务启动工作目录。例如从 `/mnt/data/11197277/robotic-lab-trainning` 启动，输出位于该目录下的 `training-outputs`。可设置 `TRAINING_OUTPUT_ROOT=/mnt/data/11197277/robotic-lab-trainning/training-outputs` 固定绝对地址；多个服务实例须配置一致。时间默认 UTC+8（Asia/Shanghai），可用 `TRAINING_TIMEZONE` 指定 IANA 时区。名称保留中文，将空格和路径特殊字符替换为连字符，每段限制 60 字节；同名同秒并发创建使用短随机 ID 区分，完整名称保留在配置中。

旧任务不移动、不改名，继续使用旧路径读取和续训。`managed-training/<任务ID>` 对新任务是指向可读输出目录的符号链接；平台通过此稳定索引查找任务。备份时需同时保留索引目录与真实输出目录，不要手动重命名输出目录。续训生成独立新目录，并在 `config.json` 的 `resumeParent` 中记录原任务、快照路径和 Step。OpenPI 适配器仅对新布局覆盖 `checkpoint_dir` 属性，不修改项目原始脚本。
