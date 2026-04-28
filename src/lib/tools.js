// Function Calling — Tool specifications and client-side executors
// Tools are defined in OpenAI-compatible format and executed locally
// to mutate app state (TODO list / artifacts / references) shown in the RightPanel.

import { readReference } from "./references";
import { readToolsConfig, getSubagentModel } from "./toolsConfig";
import { runSearch } from "./toolsExec/search";
import { fetchUrlViaJina } from "./toolsExec/fetchUrl";
import { buildNativeSearchTools } from "./toolsExec/nativeSearchTools";
import {
  readFile,
  createFile,
  createFolder,
  editFile,
  deleteFile,
  searchReplace,
} from "./toolsExec/fileOps";
import {
  listDirectory,
  findFiles,
  grepFiles,
  moveFile,
  copyFile,
} from "./toolsExec/fileBrowse";
import { runSubagent } from "./subagents/runner";
import { executePython } from "./toolsExec/pythonExec";

export const agentTools = [
  {
    type: "function",
    function: {
      name: "update_todo_list",
      description:
        "创建或更新当前任务的 TODO 列表，显示在右侧面板。当任务需要分解为多个可追踪步骤时使用。每次调用都会完全替换当前任务的 TODO 列表。状态含义：pending=未开始；in_progress=正在进行；completed=已完成；skipped=跳过（用户拒绝或判断无需执行）；failed=失败（尝试后无法完成）。配合 update_progress 可上报百分比与预计剩余时间。",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "完整的待办项列表，按顺序排列",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "稳定的标识符，后续更新状态时保持一致",
                },
                text: { type: "string", description: "待办项描述" },
                status: {
                  type: "string",
                  enum: [
                    "pending",
                    "in_progress",
                    "completed",
                    "skipped",
                    "failed",
                  ],
                  description:
                    "待办项状态：pending / in_progress / completed / skipped / failed",
                },
              },
              required: ["id", "text", "status"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_progress",
      description:
        "上报当前任务的整体进度，显示在右侧面板 TODO 下方的进度条。仅在执行较长任务时调用即可——只需要发送百分比和预计剩余时间，不需要重发 TODO 列表。任务完成时建议传 percent=100 并将 eta 设为空字符串，前端会自动隐藏 ETA。",
      parameters: {
        type: "object",
        properties: {
          percent: {
            type: "number",
            description: "整体完成度百分比，范围 0–100（自动夹紧）。",
          },
          eta: {
            type: "string",
            description:
              "预计剩余时间的人类可读描述，例如 '约 2 分钟'、'30 秒内'、'<1 min'。可留空字符串表示无估计。",
          },
        },
        required: ["percent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_artifact",
      description:
        "创建一个可交付产物（文件 / 代码 / 文档），显示在右侧面板「任务产物」区。用于最终成品。",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: '文件名或标题，例如 "main.py"、"报告.md"',
          },
          type: {
            type: "string",
            description:
              '产物类型，例如 "code" / "markdown" / "json" / "text" / "html"',
          },
          language: {
            type: "string",
            description:
              '当 type=code 时的编程语言，例如 "python"、"javascript"',
          },
          content: { type: "string", description: "产物的完整内容" },
        },
        required: ["name", "type", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_reference",
      description:
        "记录一条参考信息（来源 / 链接 / 资料），显示在右侧面板「参考信息」区。用于标注任务过程中查阅的内容。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "参考条目的标题" },
          source: {
            type: "string",
            description: '来源简称，例如 "MDN"、"Wikipedia"、"arxiv"',
          },
          url: { type: "string", description: "可选的 URL 链接" },
        },
        required: ["title", "source"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_reference",
      description:
        '读取用户在本次消息中引用 (referenced) 的资源内容：文件、文件夹、或终端输出快照。用户的消息里会附带一个 "用户引用的资源" 列表，每项都有 reference_id。只有在你确实需要该内容来回答时才调用此工具——这不会自动发送文件，只有被调用时才返回内容。',
      parameters: {
        type: "object",
        properties: {
          reference_id: {
            type: "string",
            description: "引用条目的 id（从用户消息的引用列表中取）",
          },
        },
        required: ["reference_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "请求在用户的本机终端上运行一条 shell 命令。由于是浏览器环境，无法直接执行进程——每次调用都会弹出确认框，用户复制命令到自己的终端运行后，把 stdout / exit code 粘贴回 UI。只在确实需要真实执行结果时调用（如构建、测试、git、ls）；不要用它来写文件（用 edit_file），也不要滥用 cat / echo。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              '要运行的完整命令（单行或带 && 的组合）。示例："npm run build"、"git status"',
          },
          cwd: {
            type: "string",
            description: "建议的工作目录（相对于工作区根目录，可选）",
          },
          explanation: {
            type: "string",
            description: "用一句话向用户解释为什么要运行此命令（中文）",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        '在网络上搜索信息。根据用户设置，会使用 Tavily / Brave / Jina 中的一家作为搜索引擎。返回排名前几位的结果；如果用户开启了"精简摘要"模式，另一个小模型会阅读结果并生成简洁报告。用于获取实时资讯、近期事件、官方文档等模型训练时没有的信息。',
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索查询。用自然语言、尽量包含关键术语。",
          },
          max_results: {
            type: "number",
            description: "返回结果数量上限，默认 5，最多 10",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "抓取一个网页并返回其正文的 Markdown 内容（通过 Jina Reader 清理了广告、导航、脚本）。当你在 web_search 结果里看到相关链接、或用户直接给了 URL 时使用。单次返回限制在约 12000 字符内，超出会截断。不要用来抓取图片或视频。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "完整的 http(s) URL",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fast_context",
      description:
        '快速检索：把"我想了解 X"这种探索性问题委托给一个小模型 subagent。这个 subagent 可以读取用户在本次任务中引用（referenced）的文件/文件夹/终端快照，自主决定读哪几个、读到什么程度，然后返回一份简洁的答复给你（带路径引用）。' +
        "\n\n何时使用：" +
        "\n  - 主任务开始前，快速了解用户引用的代码/文档里有什么" +
        "\n  - 你需要某个函数/类/模式的信息，但不想自己 read_reference 一个一个翻" +
        "\n  - 用户引用了多个大文件，想让 subagent 先过一遍做摘要" +
        "\n不适合：用户没引用任何资源时（没内容可读），或你只想读一个具体文件（直接 read_reference 更快）。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              '你想让 subagent 回答的具体问题。用自然语言，越具体越好。例："找出所有处理用户认证的函数和它们的调用关系"、"这个 Python 项目的入口和主要依赖是什么"、"docs/ 里关于 API 的部分有没有提到 rate limit"。',
          },
          reference_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "可选：限制 subagent 只读取这些引用 id。不填则默认开放本次任务的所有引用。",
          },
        },
        required: ["query"],
      },
    },
  },
  
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "读取工作区内文件的内容。仅在用户已经打开了项目/工作区时可用（Electron 模式）。请提供相对于工作区根目录的相对路径。\n" +
        "\n**支持按行号区间读取**：对于较大文件，强烈建议先用 `start_line` + `end_line` 读取目标区间（1-indexed，闭区间），避免一次性把上万行内容塞进上下文。常见用法：\n" +
        "- 不传 start/end：读取整个文件（小文件首选）。\n" +
        "- 只传 `start_line`：从该行读到文件末尾。\n" +
        "- 同传两者：精确切片，例如 `start_line=120, end_line=180` 取第 120–180 行。\n" +
        "返回值会带 `total_lines`、`start_line`、`end_line`、`truncated` 字段，方便你判断要不要继续翻页。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "要读取的文件路径，例如 'src/index.js'",
          },
          start_line: {
            type: "integer",
            description:
              "起始行号（1-indexed，包含）。不传则从第 1 行开始。建议先 grep_files 定位目标行号再来读。",
            minimum: 1,
          },
          end_line: {
            type: "integer",
            description:
              "结束行号（1-indexed，包含）。不传则读到文件末尾。注意：单次最多 2000 行，超过会被截断（返回值 truncated=true）。",
            minimum: 1,
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description:
        "新建一个文件并写入内容。两种调用方式：\n1) **工作区模式**（推荐）：用户已打开项目/工作区时，只需传 path（相对工作区根的路径，如 'src/hello.js'）即可。\n2) **引用模式**（Playground / 未打开工作区）：传 folder_reference_id + path（相对引用文件夹根的路径）。\n\n中间层级不存在时会自动创建。默认不允许覆盖同名文件；覆盖须 overwrite=true。每次调用都会弹出确认框让用户授权。",
      parameters: {
        type: "object",
        properties: {
          folder_reference_id: {
            type: "string",
            description:
              "可选：目标文件夹的引用 id。仅在没打开工作区、需要用户已引用的文件夹作为根时才需要。",
          },
          path: {
            type: "string",
            description:
              '相对路径。工作区模式下相对于工作区根（如 "src/hello.js"）；引用模式下相对于 folder_reference_id 指向的文件夹。',
          },
          content: {
            type: "string",
            description: "要写入的完整文件内容（UTF-8 文本）",
          },
          overwrite: {
            type: "boolean",
            description: "当同名文件已存在时是否覆盖，默认 false",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description:
        "新建一个目录（支持多级路径，中间层级按需创建）。两种调用方式：\n1) **工作区模式**（推荐）：只传 path（相对工作区根）。\n2) **引用模式**：folder_reference_id + path。每次调用都会弹出确认框让用户授权。",
      parameters: {
        type: "object",
        properties: {
          folder_reference_id: {
            type: "string",
            description: "可选：仅在 Playground 模式需要。",
          },
          path: {
            type: "string",
            description: '相对路径，例如 "src/utils" 或 "docs"',
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "**完整覆盖**已存在文件的全部内容。这是「最后手段」工具——如果你只是想改其中一段，**优先使用 search_replace**（局部精修，省 token、不会因输出截断而损坏文件）。仅在确实需要把整个文件大部分内容都改写时才用本工具。\n" +
        "\n两种调用方式：\n" +
        "1) 直接传 reference_id 指向一个文件类型引用（kind=file）。\n" +
        "2) 传 folder_reference_id + path，编辑该文件夹下的指定文件（文件必须已存在）。\n" +
        "请先通过 read_file / read_reference 读取原内容再生成新内容。每次调用都会弹出确认框。",
      parameters: {
        type: "object",
        properties: {
          reference_id: {
            type: "string",
            description:
              "文件引用 id（kind=file）。与 folder_reference_id 二选一。",
          },
          folder_reference_id: {
            type: "string",
            description: "文件夹引用 id（kind=folder）。配合 path 使用。",
          },
          path: {
            type: "string",
            description:
              '使用 folder_reference_id 时必填：相对路径，例如 "src/index.js"',
          },
          content: {
            type: "string",
            description: "文件的新完整内容（UTF-8 文本）",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description:
        "删除文件或目录（高危 · 不可撤销）。两种调用方式：\n" +
        "1) reference_id 指向单个文件引用（kind=file）。因为浏览器 File System Access API 的限制，单文件引用只能被清空内容，无法真正删除文件实体——若要真正删除，请让用户引用其父文件夹并用第 2 种方式。\n" +
        "2) folder_reference_id + path：从该文件夹下移除对应条目。若 path 指向目录，默认拒绝；传 recursive=true 才会递归删除。\n" +
        "每次调用都会弹出醒目的高危确认框。",
      parameters: {
        type: "object",
        properties: {
          reference_id: {
            type: "string",
            description: "文件引用 id。与 folder_reference_id 二选一。",
          },
          folder_reference_id: {
            type: "string",
            description: "父文件夹引用 id。配合 path 使用。",
          },
          path: {
            type: "string",
            description:
              "使用 folder_reference_id 时必填：要删除条目的相对路径",
          },
          recursive: {
            type: "boolean",
            description:
              "当 path 是目录时必须设为 true 才会递归删除，默认 false",
          },
        },
        required: [],
      },
    },
  },
  // ─────────────────────────────────────────────────────────────────
  // Phase 2 — workspace browse / search / move / copy / search-replace
  // ─────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "list_directory",
      description:
        "列出工作区内某个目录的直接子项（不递归，递归请用 find_files）。默认列工作区根目录。返回 [{name, type:'file'|'dir', size, modified}]，自动排除 node_modules / .git / dist 等无意义目录。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: '相对工作区根的目录路径，省略或传 "." 表示根目录',
          },
          max_entries: {
            type: "number",
            description: "返回的最大条目数（默认 500，上限 2000）",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_files",
      description:
        "按 glob 模式递归搜索工作区内的文件名，返回相对路径列表。常用模式：`**/*.test.ts`、`src/**/foo*.js`、`{*.md,*.mdx}`。自动跳过 node_modules / .git / dist 等。仅匹配文件路径，不读取内容（要搜内容用 grep_files）。",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "glob 模式，如 `**/*.tsx` 或 `lib/**/*.test.js`",
          },
          path: {
            type: "string",
            description: "搜索起始目录（相对工作区根），省略表示根目录",
          },
          max_results: {
            type: "number",
            description: "返回的最大匹配数（默认 500，上限 2000）",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep_files",
      description:
        "在工作区内递归搜索文件**内容**。默认按字面量匹配，传 regex=true 后 query 视作正则。可用 file_pattern 限定只搜某类文件（如 `**/*.py`）。返回 [{path, line, text}]。自动跳过二进制和 > 2 MB 的文件。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "要搜索的字符串或正则",
          },
          regex: {
            type: "boolean",
            description: "true = 把 query 当作 JS 正则；false（默认）= 字面量",
          },
          path: {
            type: "string",
            description: "搜索起始目录（相对工作区根），省略表示根目录",
          },
          file_pattern: {
            type: "string",
            description: "只搜匹配此 glob 的文件，如 `**/*.{js,ts}`",
          },
          case_sensitive: {
            type: "boolean",
            description: "区分大小写，默认 false",
          },
          max_matches: {
            type: "number",
            description: "返回的最大匹配数（默认 200，上限 1000）",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description:
        "重命名 / 移动文件或目录（一把抓）。源和目标都必须在工作区内，且都是相对路径。父目录不存在时会自动创建。每次调用都会弹出确认框。",
      parameters: {
        type: "object",
        properties: {
          from_path: {
            type: "string",
            description: "源相对路径",
          },
          to_path: {
            type: "string",
            description: "目标相对路径",
          },
        },
        required: ["from_path", "to_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "copy_file",
      description:
        "复制文件或目录到工作区内的另一位置。默认拒绝覆盖已存在的目标，需显式 overwrite=true。每次调用都会弹出确认框。",
      parameters: {
        type: "object",
        properties: {
          from_path: { type: "string", description: "源相对路径" },
          to_path: { type: "string", description: "目标相对路径" },
          overwrite: {
            type: "boolean",
            description: "true = 允许覆盖已存在的目标，默认 false",
          },
        },
        required: ["from_path", "to_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_python",
      description:
        "在本机独立的 Python venv 环境中执行一段 Python 代码，并返回标准输出、生成的文件（文本）和图片（base64）。适用于：数据分析、绘图、数学计算、文件生成、爬虫脚本等。代码在隔离的临时目录中运行，无需用户手动操作终端。\n\n注意：\n- 如需保存图片，请用 matplotlib.pyplot.savefig('output.png') 等方式写入文件，工具会自动收集并返回。\n- 如需安装第三方库，在 packages 参数中列出（首次安装较慢）。\n- 不要运行无限循环或极耗时操作，默认超时 60 秒。",
      parameters: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "要执行的完整 Python 代码。使用 print() 输出结果，用文件写入产出图片/数据文件。",
          },
          packages: {
            type: "array",
            items: { type: "string" },
            description: "需要 pip 安装的第三方包列表，例如 [\"pandas\", \"matplotlib\"]。已安装的包会跳过。可选。",
          },
          timeout: {
            type: "number",
            description: "执行超时秒数，默认 60，最大 300。",
          },
        },
        required: ["script"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_replace",
      description:
        '在已存在的文件里用 new_string 替换 old_string。**优先于 edit_file**：edit_file 是整文件覆盖，大文件容易截断；search_replace 是局部精修，省 token、可验证。\n\n硬性约束：默认 old_string 在文件中**只能出现一次**。如果出现多次，工具会返回错误并要求你「加大上下文」直到 old_string 唯一定位到目标位置——这是一种防止误改的安全机制。如果你确实想批量替换所有出现，传 replace_all=true。\n\n常见调用方式同 edit_file：\n1) 工作区模式：直接传 path（相对工作区根）\n2) reference_id：单文件引用\n3) folder_reference_id + path：文件夹引用 + 相对路径\n\n约束：\n- old_string 不能等于 new_string（无意义）\n- old_string 必须包含足够上下文使其在文件中唯一（除非 replace_all）',
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "工作区内相对路径，与 reference_id / folder_reference_id 三选一",
          },
          reference_id: {
            type: "string",
            description: "单文件引用 id",
          },
          folder_reference_id: {
            type: "string",
            description: "父文件夹引用 id（需配合 path）",
          },
          old_string: {
            type: "string",
            description: "要被替换的精确字符串（包含足够上下文以保证唯一）",
          },
          new_string: {
            type: "string",
            description: "替换为的新字符串",
          },
          replace_all: {
            type: "boolean",
            description: "true = 替换所有出现；false（默认）= 只在 old_string 唯一时替换那一处",
          },
        },
        required: ["old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_background_command",
      description:
        "启动一条**长驻**的 shell 命令（dev server、watch 进程、后台脚本等），命令在用户机器上独立运行，不阻塞对话。返回一个 background id，用户在输入框上方能看到该命令并随时停止。\n\n何时使用：\n- npm run dev / vite / webpack --watch / jest --watch 等需要持续运行的命令\n- python -m http.server 这类简单服务\n- 不要用于一次性命令（用 run_command 让用户在自己的终端跑）\n\nwait_seconds 行为：\n- 0（默认）：立即返回 background id 和当前缓冲（通常为空）。下一轮用户继续对话时，工具自动把新输出注入上下文。\n- >0：阻塞至多这么多秒，期间若进程退出会立即返回；返回时带上累积输出。适合短驻命令（编译/测试一次跑）。最大 300。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的 shell 命令，例如 'npm run dev' 或 'python -m http.server 8080'",
          },
          wait_seconds: {
            type: "number",
            description: "等待该命令的最大秒数。0=立即返回；>0 等到进程退出或超时。默认 0。",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_background_output",
      description:
        "读取一条已启动的背景命令的**新输出**（自上次读取以来的增量）。可以可选地等待进程退出。常见场景：dev server 启动后，等几秒看是否成功监听端口。",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "background id（来自 run_background_command 的返回）",
          },
          wait_seconds: {
            type: "number",
            description: "等待该命令退出的最大秒数。0=立即返回当前缓冲；>0 等到退出或超时。默认 0。",
          },
          full: {
            type: "boolean",
            description: "true=返回完整输出（不增量）；默认 false（只返回自上次读取以来的新输出）。",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stop_background_command",
      description: "停止一条正在运行的背景命令。已退出的命令调用此工具会原样返回成功。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "background id" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_skill",
      description:
        "按 id 或名称读取一条已注册的 Skill（用户在「Skills」页或附件菜单里管理的 .md 知识片段）的完整内容。\n\n何时使用：\n- 用户在消息附件里**引用了**一条 skill（references 列表里 kind='skill' 的项），但你需要看到完整文本而不仅是描述时\n- 用户口头提到某个 skill 名字（即使没显式引用），你想确认其内容\n- 用户想让你按某个未启用的 skill 中的指引完成任务\n\n注意：已启用（enabled=true）的 skill 默认会随每条消息注入到 system prompt，无需用此工具——只有当某条 skill **未启用** 或在引用列表中你需要原文时才调用。",
      parameters: {
        type: "object",
        properties: {
          skill_id: {
            type: "string",
            description: "Skill 的 id（来自 references 列表）。与 skill_name 二选一；id 优先。",
          },
          skill_name: {
            type: "string",
            description: "Skill 的名称（不区分大小写，匹配第一个名字相同的 skill）。仅在没有 id 时使用。",
          },
        },
      },
    },
  },
];

const REF_PALETTE = [
  "#10A37F",
  "#6366F1",
  "#F59E0B",
  "#EC4899",
  "#3B82F6",
  "#8B5CF6",
];

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Heuristic risk detector for shell commands. Conservative — we'd rather
// false-positive (extra consent prompt) than false-negative (silent
// destructive exec). Kept in sync with CommandExecuteModal's patterns.
const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-[rRf]+/i, // rm -rf, rm -r, rm -f
  /\bsudo\b/i, // privilege escalation
  /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)/i, // pipe-to-shell
  /\bchmod\s+[0-7]{3,}/i, // permissions mass-change
  /\bchown\s+-R/i, // recursive ownership change
  /\bmkfs\b/, // format filesystem
  /\bdd\s+if=/i, // low-level disk writes
  />\s*\/dev\/[sh]d[a-z]/i, // redirect to disk device
  /\bformat\b.*[cC]:/, // windows format C:
  /:\(\)\{.*:\|:&\};:/, // fork bomb
  /\bkill(?:all)?\s+-9/i, // SIGKILL bulk
  /\bshutdown\b|\breboot\b/i, // system power
  /\bgit\s+push\s+--force/i, // destructive git
  /\bgit\s+reset\s+--hard/i, // destructive git
];

export function isRiskyCommand(command) {
  if (typeof command !== "string" || !command.trim()) return false;
  return DANGEROUS_COMMAND_PATTERNS.some((re) => re.test(command));
}

// Creates a runner function: runner(name, args) -> Promise<result>
// Side effects mutate the App state via the provided setters, scoped to taskId.
//
// `requestCommandExec` (optional) is a callback that returns a Promise
// resolving when the user has confirmed / provided output for a run_command
// request. Shape: ({ command, cwd, explanation }) => Promise<{ ok, stdout, stderr, exit_code }>.
// App.jsx injects this and drives the CommandExecuteModal.
//
// `requestToolPermission` (optional) is the generic permission gate used by
// destructive tools like delete_file / edit_file. Shape:
//   ({ toolName, argsSummary, args }) => Promise<'allow' | 'deny'>
// Tools that don't need confirmation (web_search, fetch_url, read_file, ...)
// never call it. Phase 2 file-mutation tools wire through this.
export function createToolRunner({
  taskId,
  projectPath,
  setTodoItems,
  setTaskProgress,
  setArtifacts,
  setReferences,
  // Reads the CURRENT references attached to this task (post-reducer
  // state). Called by fast_context to enumerate what's available to the
  // subagent; scoping to taskId keeps cross-task refs from leaking.
  getTaskReferences,
  requestCommandExec,
  requestToolPermission,
  // Optional: notified the moment a long-running background command is
  // launched so the renderer can pop the "running command" pill in the
  // input bar before any output drains.
  onBackgroundStarted,
  // Live reader for the user's registered skills. Returns the current
  // skills array (same shape as in App state). read_skill resolves
  // through this so it always sees the latest catalogue, including
  // skills the user added mid-conversation.
  getSkills,
}) {
  // Gate a destructive tool through the generic permission flow. Returns
  // 'allow' | 'deny'. Low-risk tools (or when no gate is wired) default to
  // 'allow' so callers don't need special-case paths.
  const gate = async (toolName, args, argsSummary) => {
    if (typeof requestToolPermission !== "function") return "allow";
    try {
      return await requestToolPermission({ toolName, args, argsSummary });
    } catch {
      return "deny";
    }
  };
  return async (name, args) => {
    switch (name) {
      case "read_file": {
        const path = args?.path;
        if (!path) return { ok: false, error: "path is required" };
        // start_line / end_line are optional; pass through to readFile
        // which slices the buffer after read. Both are 1-indexed and
        // inclusive — see readFile() for normalization rules.
        const startLine = Number.isInteger(args?.start_line)
          ? args.start_line
          : undefined;
        const endLine = Number.isInteger(args?.end_line)
          ? args.end_line
          : undefined;
        // read_file is read-only, no gate needed
        return readFile({
          path,
          projectPath,
          start_line: startLine,
          end_line: endLine,
        });
      }

      case "update_todo_list": {
        const rawItems = Array.isArray(args?.items) ? args.items : [];
        const validStatus = new Set([
          "pending",
          "in_progress",
          "completed",
          "skipped",
          "failed",
        ]);
        const items = rawItems.map((it, i) => ({
          id: String(it?.id ?? `todo-${i}`),
          text: String(it?.text ?? ""),
          status: validStatus.has(it?.status) ? it.status : "pending",
          taskId,
        }));
        setTodoItems((prev) => {
          const others = prev.filter((t) => t.taskId !== taskId);
          return [...others, ...items];
        });
        return { ok: true, count: items.length };
      }

      case "update_progress": {
        // 把百分比夹紧到 [0, 100]，eta 留空时存空串（UI 会隐藏）。
        const rawPct = Number(args?.percent);
        const percent = Number.isFinite(rawPct)
          ? Math.max(0, Math.min(100, rawPct))
          : 0;
        const eta = typeof args?.eta === "string" ? args.eta.trim() : "";
        if (typeof setTaskProgress === "function") {
          setTaskProgress((prev) => {
            const others = Array.isArray(prev)
              ? prev.filter((p) => p.taskId !== taskId)
              : [];
            return [
              ...others,
              { taskId, percent, eta, updatedAt: Date.now() },
            ];
          });
        }
        return { ok: true, percent, eta };
      }

      case "create_artifact": {
        if (!args?.name || !args?.content) {
          return { ok: false, error: "name and content are required" };
        }
        const artifact = {
          id: randomId(),
          taskId,
          name: String(args.name),
          type: String(args.type || "text"),
          language: args.language ? String(args.language) : null,
          content: String(args.content),
          createdAt: new Date().toISOString(),
        };
        setArtifacts((prev) => [...prev, artifact]);
        return { ok: true, id: artifact.id, name: artifact.name };
      }

      case "add_reference": {
        if (!args?.title || !args?.source) {
          return { ok: false, error: "title and source are required" };
        }
        const ref = {
          id: randomId(),
          taskId,
          title: String(args.title),
          source: String(args.source),
          url: args.url ? String(args.url) : null,
          color: REF_PALETTE[Math.floor(Math.random() * REF_PALETTE.length)],
          createdAt: new Date().toISOString(),
        };
        setReferences((prev) => [...prev, ref]);
        return { ok: true, id: ref.id };
      }

      case "read_reference": {
        const refId = args?.reference_id;
        if (!refId) return { ok: false, error: "reference_id is required" };
        const result = await readReference(String(refId));
        return result;
      }

      case "run_command": {
        const command =
          typeof args?.command === "string" ? args.command.trim() : "";
        if (!command) return { ok: false, error: "command is required" };
        // Resolve cwd against the active workspace. Without this, an
        // unspecified cwd would fall through to electron/main.js's
        // os.homedir() last-resort fallback, which means every command
        // would silently run in /Users/<name> (or C:\Users\<name>) — not
        // the project the user opened. Cross-platform aware:
        //   - absent / empty       → projectPath (or null if no workspace)
        //   - absolute path        → kept verbatim
        //   - relative path        → joined onto projectPath using its
        //                            native separator (\ on Windows, / elsewhere)
        const rawCwd = args?.cwd ? String(args.cwd).trim() : "";
        const isAbsolute = (p) => /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
        let cwd;
        if (!rawCwd) {
          cwd = projectPath || null;
        } else if (isAbsolute(rawCwd)) {
          cwd = rawCwd;
        } else if (projectPath) {
          const sep = projectPath.includes("\\") ? "\\" : "/";
          // Strip any leading ./ or trailing slashes from the model's
          // suggestion before joining; double-separator-safe.
          const cleaned = rawCwd.replace(/^\.[\\/]/, "").replace(/[\\/]+$/, "");
          cwd = projectPath.replace(/[\\/]+$/, "") + sep + cleaned;
        } else {
          cwd = rawCwd;
        }
        const explanation = args?.explanation ? String(args.explanation) : null;

        // Workspace-scope check: a cwd that resolves outside the active
        // workspace requires explicit user consent (the main-process
        // sandbox will reject the exec otherwise). We only flag this
        // when projectPath is set — Playground mode has no defined
        // boundary, so absolute cwds there are user-explicit anyway.
        const isOutsideWorkspace = (() => {
          if (!projectPath || !cwd) return false;
          const sep = projectPath.includes("\\") ? "\\" : "/";
          const root = projectPath.replace(/[\\/]+$/, "");
          const target = String(cwd).replace(/[\\/]+$/, "");
          // Case-insensitive comparison on macOS/Windows is the safe
          // default; Linux users with weird casing get false positives
          // that the modal disambiguates anyway.
          const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
          if (eq(target, root)) return false;
          return !eq(target.slice(0, root.length + 1), root + sep);
        })();

        // Fast path — Electron + safe command + inside workspace:
        // run natively, no prompt. The command card on the chat is
        // already showing what's running (animated terminal icon +
        // command as summary), so there's no UX loss.
        const nativeExec =
          typeof window !== "undefined" && window.arcticAPI?.execCommand;
        const risky = isRiskyCommand(command);
        const needsConsent = risky || isOutsideWorkspace;

        if (nativeExec && !needsConsent) {
          try {
            return await window.arcticAPI.execCommand({ command, cwd });
          } catch (e) {
            return { ok: false, error: e?.message || String(e), exit_code: -1 };
          }
        }

        // Needs consent — risky command and/or running outside the
        // workspace. Electron path: compact confirm modal then native
        // exec. Browser path: legacy paste-back modal.
        if (nativeExec && needsConsent) {
          if (typeof requestCommandExec !== "function") {
            return { ok: false, error: "run_command is not wired up" };
          }
          const result = await requestCommandExec({
            command,
            cwd,
            explanation,
            riskHint: risky ? "high" : "medium",
            nativeOnly: true,
            outsideWorkspace: isOutsideWorkspace,
            workspaceRoot: projectPath || null,
          });
          // CommandExecuteModal.handleNativeRun is responsible for
          // calling addAllowedRoot before exec when outsideWorkspace —
          // see CommandExecuteModal.jsx for the timing rationale.
          return result;
        }

        // Non-Electron browser: retain paste-back flow as the only option.
        if (typeof requestCommandExec !== "function") {
          return { ok: false, error: "run_command is not wired up" };
        }
        return await requestCommandExec({ command, cwd, explanation });
      }

      case "fetch_url": {
        const url = args?.url;
        if (!url) return { ok: false, error: "url is required" };
        const cfg = readToolsConfig();
        return fetchUrlViaJina({
          url,
          apiKey: cfg.fetchUrl?.jinaApiKey || "",
          format: cfg.fetchUrl?.format || "markdown",
        });
      }

      case "web_search": {
        const query = typeof args?.query === "string" ? args.query.trim() : "";
        if (!query) return { ok: false, error: "query is required" };
        const cfg = readToolsConfig();
        const searchCfg = cfg.search || {};
        const maxResults = Math.min(
          Number(args?.max_results) || searchCfg.maxResults || 5,
          10,
        );

        // For the 'model' provider, the subagent needs both a real search
        // tool AND fetch_url so it can find AND read pages. Previously we
        // only exposed fetch_url + native google_search; when the native
        // tool was rejected by the OpenAI-compat layer (common on Gemini
        // when mixed with function tools), the subagent was left with no
        // way to discover URLs and would hallucinate or skip searching
        // altogether. A function-shaped `search_web` tool wired to Jina
        // (no API key required) guarantees the subagent always has a
        // working SERP regardless of provider quirks.
        const fetchCfg = cfg.fetchUrl || {};
        const subagentFetchRunner = async (toolName, toolArgs) => {
          if (toolName === "fetch_url") {
            const url = toolArgs?.url;
            if (!url) return { ok: false, error: "url is required" };
            return fetchUrlViaJina({
              url,
              apiKey: fetchCfg.jinaApiKey || "",
              format: fetchCfg.format || "markdown",
            });
          }
          // Subagent's own search tool — uses whichever provider the user
          // has configured for the main web_search tool, but defaults to
          // Jina (free, no key) so it always works.
          if (toolName === "search_web") {
            const subQuery =
              typeof toolArgs?.query === "string" ? toolArgs.query.trim() : "";
            if (!subQuery)
              return { ok: false, error: "query is required" };
            const subMax = Math.min(
              Number(toolArgs?.max_results) || 5,
              10,
            );
            // Avoid recursion: never use 'model' provider here.
            const subProvider =
              searchCfg.provider && searchCfg.provider !== "model"
                ? searchCfg.provider
                : "jina";
            return runSearch({
              query: subQuery,
              config: {
                provider: subProvider,
                tavilyApiKey: searchCfg.tavilyApiKey,
                braveApiKey: searchCfg.braveApiKey,
                jinaApiKey: searchCfg.jinaApiKey,
                maxResults: subMax,
              },
            });
          }
          return { ok: false, error: `subagent cannot call ${toolName}` };
        };
        const subagentModelId = getSubagentModel("web_search");
        // Function-shaped `search_web` tool spec for the subagent. We use
        // a distinct name (`search_web`, not `web_search`) so it doesn't
        // collide with the parent tool — keeps the subagent from looping
        // back into us.
        const subagentSearchTool = {
          type: "function",
          function: {
            name: "search_web",
            description:
              "Search the web for relevant pages. Returns up to 10 results with title, URL, and snippet. Use this FIRST to find candidate URLs, then call fetch_url to read the most promising ones.",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "Natural-language search query." },
                max_results: { type: "number", description: "Max results (1-10, default 5)." },
              },
              required: ["query"],
            },
          },
        };
        // Bundle: function-style search_web + fetch_url + provider-native
        // grounding tool (google_search for Gemini, web_search_20250305
        // for Claude). Native tools are best-effort; the function tools
        // guarantee the baseline.
        const fetchUrlTool = agentTools.find(
          (t) => t.function.name === "fetch_url",
        );
        const nativeTools = buildNativeSearchTools(subagentModelId);
        const subagentTools = [
          subagentSearchTool,
          fetchUrlTool,
          ...nativeTools,
        ].filter(Boolean);

        // Try native-enabled first; if the provider rejects the bare
        // `{google_search:{}}` shape (not all OpenAI-compat layers
        // accept it), re-try with just fetch_url so the user still
        // gets something useful.
        const runWithTools = async (tools, opts) =>
          runSubagent({ ...opts, tools, toolRunner: subagentFetchRunner });

        const raw = await runSearch({
          query,
          config: {
            provider: searchCfg.provider,
            tavilyApiKey: searchCfg.tavilyApiKey,
            braveApiKey: searchCfg.braveApiKey,
            jinaApiKey: searchCfg.jinaApiKey,
            maxResults,
          },
          runSubagent: async (opts) => {
            try {
              return await runWithTools(subagentTools, opts);
            } catch (e) {
              const msg = e?.message || "";
              // 400 with "invalid"/"unknown"/"unsupported" hints a tool-
              // schema rejection. Degrade and retry without native tools.
              if (nativeTools.length > 0 && /http 4\d\d/i.test(msg)) {
                // Drop only native tools; keep search_web + fetch_url so
                // the subagent can still actually search.
                return await runWithTools(
                  [subagentSearchTool, fetchUrlTool].filter(Boolean),
                  opts,
                );
              }
              throw e;
            }
          },
          modelId: subagentModelId,
        });
        if (!raw.ok) return raw;

        // Model provider already produced a narrative answer — return it
        // as-is without a second round of digest.
        if (raw.provider === "model") {
          return {
            ok: true,
            provider: "model",
            query: raw.query,
            summary: raw.answer,
            sources: [],
          };
        }

        // Raw mode: hand the SERP back as-is. Cheapest, model digests it.
        if (searchCfg.mode === "raw") {
          return {
            ok: true,
            provider: raw.provider,
            query: raw.query,
            results: raw.results,
            answer: raw.answer,
          };
        }

        // Digest mode: run a tiny subagent that turns the SERP into a
        // short Chinese report with inline citations. Keeps the main
        // model's context lean; the user configures which small model
        // runs this under Settings → Tools.
        try {
          const modelId = getSubagentModel("web_search");
          const sources = raw.results
            .map(
              (r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`,
            )
            .join("\n\n");
          const providerAnswer = raw.answer
            ? `\n\n搜索引擎的原始摘要（可能不准）:\n${raw.answer}`
            : "";
          const { text } = await runSubagent({
            modelId,
            systemPrompt:
              "你是一个严谨的网页研究助手。给定一个用户查询和一份搜索结果清单，写出 200-500 字的简洁报告：\n" +
              "1) 先给核心答案/要点；\n" +
              "2) 对每个关键事实用 [数字] 标注来源；\n" +
              "3) 如信息相互矛盾或可能过时，明确指出；\n" +
              "4) 不要编造结果中没有的信息。\n" +
              "只输出报告正文，不要客套。",
            query: `用户查询：${query}\n\n搜索结果：\n\n${sources}${providerAnswer}`,
            maxIterations: 1,
          });
          return {
            ok: true,
            provider: raw.provider,
            query,
            summary: text,
            sources: raw.results,
          };
        } catch (e) {
          // Subagent failed (misconfigured / rate-limited) — fall back to
          // raw SERP rather than bubbling an error; main agent can still
          // handle the results itself.
          return {
            ok: true,
            provider: raw.provider,
            query,
            results: raw.results,
            digest_error: e?.message || String(e),
          };
        }
      }

      case "execute_python": {
        const pyCfg = readToolsConfig().pythonExec || {};
        if (pyCfg.enabled === false) {
          return { ok: false, error: "Python 代码执行已在设置中关闭。请前往「设置 → Python 执行」启用后重试。" };
        }
        const script = typeof args?.script === "string" ? args.script.trim() : "";
        if (!script) return { ok: false, error: "script is required" };
        const packages = args?.packages || [];
        const timeout = Math.min(Number(args?.timeout) || pyCfg.timeout || 60, 300);
        const decision = await gate("execute_python", args, script.split("\n")[0].slice(0, 80));
        if (decision !== "allow") return { ok: false, error: "user denied permission" };
        return executePython({ script, packages, timeout });
      }

      case "fast_context": {
        const query = typeof args?.query === "string" ? args.query.trim() : "";
        if (!query) return { ok: false, error: "query is required" };

        // Enumerate task references. Without any refs there's nothing
        // for the subagent to read, so we bail early with a helpful hint
        // so the main model knows to ask the user to reference files
        // instead of retrying.
        const taskRefs =
          typeof getTaskReferences === "function"
            ? getTaskReferences() || []
            : [];
        const filterIds =
          Array.isArray(args?.reference_ids) && args.reference_ids.length > 0
            ? new Set(args.reference_ids.map(String))
            : null;
        const availableRefs = filterIds
          ? taskRefs.filter((r) => filterIds.has(r.id))
          : taskRefs;

        if (availableRefs.length === 0) {
          return {
            ok: false,
            error: filterIds
              ? "没有匹配的引用 id。请先用 read_reference 查看可用的引用，或让用户重新引用文件。"
              : '当前任务没有任何引用资源。Fast Context 需要用户先通过"引用文件/文件夹"按钮添加参考；若只是想回答模型自身知识问题，请直接回复用户，不要调用 fast_context。',
          };
        }

        // Build a tiny toolRunner exposed ONLY to the subagent. It can
        // read any of the pre-authorized refs but cannot trigger
        // write operations / web requests / command execution. This
        // isolation is what makes the subagent safe to give a long
        // iteration budget to.
        const authorizedIds = new Set(availableRefs.map((r) => r.id));
        const subagentToolRunner = async (toolName, toolArgs) => {
          if (toolName !== "read_reference") {
            return { ok: false, error: `subagent cannot call ${toolName}` };
          }
          const refId = String(toolArgs?.reference_id || "");
          if (!refId) return { ok: false, error: "reference_id is required" };
          if (!authorizedIds.has(refId)) {
            return {
              ok: false,
              error: `reference_id "${refId}" is out of scope — only these refs are available this turn: ${[...authorizedIds].join(", ")}`,
            };
          }
          return await readReference(refId);
        };

        // Build a readable manifest for the subagent's prompt. Small
        // models follow structured lists better than JSON dumps.
        const refManifest = availableRefs
          .map((r, i) => {
            const parts = [
              `[${i + 1}] id=${r.id}`,
              `kind=${r.kind || "unknown"}`,
            ];
            if (r.name) parts.push(`name="${r.name}"`);
            if (r.path) parts.push(`path="${r.path}"`);
            if (typeof r.size === "number") parts.push(`size=${r.size}`);
            return parts.join("  ");
          })
          .join("\n");

        const readReferenceTool = agentTools.find(
          (t) => t.function.name === "read_reference",
        );
        const subagentTools = [readReferenceTool].filter(Boolean);
        const subagentModelId = getSubagentModel("fast_context");

        const systemPrompt =
          "你是一个高效的代码 / 文档检索助手（Fast Context）。你的工作是根据主 Agent 的查询，读取用户提供的引用资源，给出一份简洁但有足够信息量的中文回答。\n\n" +
          "规则：\n" +
          "1) 只使用 read_reference 工具读取可用的引用 id；不要虚构。\n" +
          "2) 优先读取文件名 / 路径最可能相关的引用。对大文件可以只读一遍浏览。\n" +
          "3) 不要把整个文件粘贴回来。给出关键信息 + 带 `path:line` 或 `path` 的精确引用。\n" +
          '4) 如果查询信息不在引用里，诚实说明"引用中未找到"，不要编造。\n' +
          "5) 最终回答格式：\n" +
          "   - 第一段：直接答复问题的核心。\n" +
          "   - 中段：关键代码片段 / 要点（用 Markdown 代码块或列表），每条带来源路径。\n" +
          '   - 末尾：可选的"补充上下文"或"进一步建议查看的路径"。\n' +
          "6) 总长度控制在 600 字以内（主 Agent 还要处理你的输出）。";

        const userMessage =
          `主 Agent 的查询：\n${query}\n\n` +
          `可用的引用资源（共 ${availableRefs.length} 条）：\n${refManifest}\n\n` +
          "请用 read_reference 阅读你认为相关的条目，然后按规则 5 的格式给出回答。";

        try {
          const { text } = await runSubagent({
            modelId: subagentModelId,
            systemPrompt,
            query: userMessage,
            tools: subagentTools,
            toolRunner: subagentToolRunner,
            // 6 turns is usually enough: 1-2 for read calls + 1 for
            // final synthesis. Too few and the subagent can't actually
            // read multiple refs; too many and a confused subagent
            // burns tokens looping.
            maxIterations: 6,
          });
          return {
            ok: true,
            query,
            summary: text,
            // Echo the refs the subagent was allowed to look at so
            // the main model can decide if it wants to dig deeper.
            sources: availableRefs.map((r) => ({
              reference_id: r.id,
              title: r.name || r.path || r.id,
              kind: r.kind,
            })),
          };
        } catch (e) {
          return {
            ok: false,
            error: `Fast Context 调用失败: ${e?.message || String(e)}`,
          };
        }
      }

      case "create_file": {
        const folderRefId = args?.folder_reference_id;
        const path = args?.path;
        const content = args?.content;
        const overwrite = !!args?.overwrite;
        if (!path) return { ok: false, error: "path is required" };
        if (typeof content !== "string")
          return { ok: false, error: "content is required" };
        // Workspace mode: path is enough. Playground mode (no projectPath)
        // still requires folder_reference_id since there's no implicit root.
        if (!projectPath && !folderRefId) {
          return {
            ok: false,
            error:
              "未打开工作区。请要么让用户引用一个文件夹并传 folder_reference_id，要么打开一个项目后使用工作区相对路径。",
          };
        }
        const summary = `${path}${overwrite ? " (overwrite)" : ""}`;
        const decision = await gate("create_file", args, summary);
        if (decision !== "allow")
          return { ok: false, error: "user denied permission" };
        return createFile({
          folder_reference_id: folderRefId,
          path,
          content,
          overwrite,
          projectPath,
        });
      }

      case "create_folder": {
        const folderRefId = args?.folder_reference_id;
        const path = args?.path;
        if (!path) return { ok: false, error: "path is required" };
        if (!projectPath && !folderRefId) {
          return {
            ok: false,
            error:
              "未打开工作区。请要么让用户引用一个文件夹并传 folder_reference_id，要么打开一个项目后使用工作区相对路径。",
          };
        }
        const decision = await gate("create_folder", args, path);
        if (decision !== "allow")
          return { ok: false, error: "user denied permission" };
        return createFolder({ folder_reference_id: folderRefId, path, projectPath });
      }

      case "edit_file": {
        const refId = args?.reference_id;
        const folderRefId = args?.folder_reference_id;
        const path = args?.path;
        const content = args?.content;
        if (typeof content !== "string")
          return { ok: false, error: "content is required" };
        // Workspace mode: path alone is fine. Otherwise need a ref.
        const hasWorkspacePath = !!(projectPath && path);
        if (!hasWorkspacePath && !refId && !folderRefId) {
          return {
            ok: false,
            error:
              "需要以下之一：(a) 工作区模式下传 path；(b) 传 reference_id 指向某个已引用文件；(c) 传 folder_reference_id + path。",
          };
        }
        const summary = folderRefId ? path || "(no path)" : `ref:${refId}`;
        const decision = await gate("edit_file", args, summary);
        if (decision !== "allow")
          return { ok: false, error: "user denied permission" };
        return editFile({
          reference_id: refId,
          folder_reference_id: folderRefId,
          path,
          content,
          projectPath,
        });
      }

      case "delete_file": {
        const refId = args?.reference_id;
        const folderRefId = args?.folder_reference_id;
        const path = args?.path;
        const recursive = !!args?.recursive;
        const hasWorkspacePath = !!(projectPath && path);
        if (!hasWorkspacePath && !refId && !folderRefId) {
          return {
            ok: false,
            error:
              "需要以下之一：(a) 工作区模式下传 path；(b) 传 reference_id；(c) 传 folder_reference_id + path。",
          };
        }
        const summary = folderRefId
          ? `${path || "(no path)"}${recursive ? " (recursive)" : ""}`
          : `ref:${refId}`;
        const decision = await gate("delete_file", args, summary);
        if (decision !== "allow")
          return { ok: false, error: "user denied permission" };
        return deleteFile({
          reference_id: refId,
          folder_reference_id: folderRefId,
          path,
          recursive,
          projectPath,
        });
      }

      // ───── Phase 2: workspace browse / search / move / copy ─────
      // Browse / search are read-only → no permission gate.
      case "list_directory": {
        return listDirectory({
          path: args?.path,
          max_entries: args?.max_entries,
          projectPath,
        });
      }

      case "find_files": {
        return findFiles({
          pattern: args?.pattern,
          path: args?.path,
          max_results: args?.max_results,
          projectPath,
        });
      }

      case "grep_files": {
        return grepFiles({
          query: args?.query,
          regex: args?.regex,
          path: args?.path,
          file_pattern: args?.file_pattern,
          case_sensitive: args?.case_sensitive,
          max_matches: args?.max_matches,
          projectPath,
        });
      }

      case "move_file": {
        const fromPath = args?.from_path;
        const toPath = args?.to_path;
        if (!fromPath || !toPath) {
          return { ok: false, error: "from_path and to_path are required" };
        }
        const decision = await gate("move_file", args, `${fromPath} → ${toPath}`);
        if (decision !== "allow")
          return { ok: false, error: "user denied permission" };
        return moveFile({ from_path: fromPath, to_path: toPath, projectPath });
      }

      case "copy_file": {
        const fromPath = args?.from_path;
        const toPath = args?.to_path;
        if (!fromPath || !toPath) {
          return { ok: false, error: "from_path and to_path are required" };
        }
        const decision = await gate(
          "copy_file",
          args,
          `${fromPath} → ${toPath}${args?.overwrite ? " (overwrite)" : ""}`,
        );
        if (decision !== "allow")
          return { ok: false, error: "user denied permission" };
        return copyFile({
          from_path: fromPath,
          to_path: toPath,
          overwrite: !!args?.overwrite,
          projectPath,
        });
      }

      case "search_replace": {
        const refId = args?.reference_id;
        const folderRefId = args?.folder_reference_id;
        const path = args?.path;
        const oldStr = args?.old_string;
        const newStr = args?.new_string;
        const replaceAll = !!args?.replace_all;
        if (!path && !refId && !folderRefId) {
          return {
            ok: false,
            error:
              "either path, reference_id, or folder_reference_id is required",
          };
        }
        const summary = path
          ? `${path}${replaceAll ? " (all)" : ""}`
          : refId
            ? `ref:${refId}${replaceAll ? " (all)" : ""}`
            : `${folderRefId}/${path}`;
        const decision = await gate("search_replace", args, summary);
        if (decision !== "allow")
          return { ok: false, error: "user denied permission" };
        return searchReplace({
          reference_id: refId,
          folder_reference_id: folderRefId,
          path,
          old_string: oldStr,
          new_string: newStr,
          replace_all: replaceAll,
          projectPath,
        });
      }

      case "run_background_command": {
        if (!window.arcticAPI?.bgStart) {
          return {
            ok: false,
            error: "background commands require the desktop app (Electron).",
          };
        }
        const command = typeof args?.command === "string" ? args.command.trim() : "";
        if (!command) return { ok: false, error: "command is required" };
        const wait = Math.min(Math.max(Number(args?.wait_seconds) || 0, 0), 300);
        // No permission gate here: the user owns the input bar's "stop"
        // button for any of these and will see the command from the
        // moment it starts. If we wanted to add a confirm modal later,
        // route through gate('run_background_command', ...).
        const startResult = await window.arcticAPI.bgStart({
          command,
          cwd: projectPath || null,
        });
        if (!startResult?.ok) {
          return { ok: false, error: startResult?.error || "bgStart failed" };
        }
        const id = startResult.id;
        // Notify the renderer's UI layer so the input-bar pill appears
        // immediately, even before the agent reads output back.
        if (typeof onBackgroundStarted === "function") {
          try { onBackgroundStarted({ id, command, startedAt: startResult.startedAt }); } catch { /* noop */ }
        }
        if (wait > 0) {
          const waitResult = await window.arcticAPI.bgWait({
            id,
            timeoutMs: wait * 1000,
            sinceLast: true,
          });
          return {
            ok: true,
            id,
            command,
            running: waitResult?.snapshot?.running ?? false,
            exit_code: waitResult?.snapshot?.exitCode ?? null,
            output: waitResult?.output || "",
            truncated: !!waitResult?.snapshot?.truncated,
          };
        }
        return {
          ok: true,
          id,
          command,
          running: true,
          message:
            "命令已启动并在后台运行。下次用户继续对话时，新输出会自动随消息送回；也可以主动调用 read_background_output 查看。",
        };
      }

      case "read_background_output": {
        if (!window.arcticAPI?.bgRead) {
          return { ok: false, error: "background commands require Electron." };
        }
        const id = String(args?.id || "");
        if (!id) return { ok: false, error: "id is required" };
        const wait = Math.min(Math.max(Number(args?.wait_seconds) || 0, 0), 300);
        const full = !!args?.full;
        if (wait > 0) {
          const r = await window.arcticAPI.bgWait({
            id,
            timeoutMs: wait * 1000,
            sinceLast: !full,
          });
          if (!r?.ok) return { ok: false, error: r?.error || "bgWait failed" };
          return {
            ok: true,
            id,
            running: r.snapshot?.running,
            exit_code: r.snapshot?.exitCode ?? null,
            output: r.output || "",
            truncated: !!r.snapshot?.truncated,
          };
        }
        const r = await window.arcticAPI.bgRead({ id, sinceLast: !full });
        if (!r?.ok) return { ok: false, error: r?.error || "bgRead failed" };
        return {
          ok: true,
          id,
          running: r.snapshot?.running,
          exit_code: r.snapshot?.exitCode ?? null,
          output: r.output || "",
          truncated: !!r.snapshot?.truncated,
        };
      }

      case "read_skill": {
        const skills = typeof getSkills === "function" ? getSkills() || [] : [];
        if (!Array.isArray(skills) || skills.length === 0) {
          return { ok: false, error: "当前没有任何已注册的 Skill。" };
        }
        const sid = typeof args?.skill_id === "string" ? args.skill_id.trim() : "";
        const sname = typeof args?.skill_name === "string" ? args.skill_name.trim() : "";
        if (!sid && !sname) {
          return { ok: false, error: "skill_id 与 skill_name 至少提供一个" };
        }
        // id 优先；没匹配则降级到 name（不区分大小写）。
        let skill = sid ? skills.find((s) => s.id === sid) : null;
        if (!skill && sname) {
          const lower = sname.toLowerCase();
          skill = skills.find(
            (s) => typeof s.name === "string" && s.name.toLowerCase() === lower,
          );
        }
        if (!skill) {
          // Helpful manifest so the model can self-correct on its next call.
          const list = skills
            .slice(0, 20)
            .map((s) => `  - id=${s.id}  name="${s.name || "?"}"  enabled=${s.enabled !== false}`)
            .join("\n");
          return {
            ok: false,
            error: `未找到指定的 Skill。可用列表：\n${list}${skills.length > 20 ? `\n  …还有 ${skills.length - 20} 条` : ""}`,
          };
        }
        return {
          ok: true,
          id: skill.id,
          name: skill.name || "",
          description: skill.description || "",
          when_to_use: skill.whenToUse || "",
          tags: Array.isArray(skill.tags) ? skill.tags : [],
          version: skill.version || "",
          enabled: skill.enabled !== false,
          truncated: !!skill.truncated,
          content: typeof skill.content === "string" ? skill.content : "",
        };
      }

      case "stop_background_command": {
        if (!window.arcticAPI?.bgStop) {
          return { ok: false, error: "background commands require Electron." };
        }
        const id = String(args?.id || "");
        if (!id) return { ok: false, error: "id is required" };
        const r = await window.arcticAPI.bgStop({ id });
        if (!r?.ok) return { ok: false, error: r?.error || "bgStop failed" };
        return {
          ok: true,
          id,
          alreadyExited: !!r.alreadyExited,
          exit_code: r.snapshot?.exitCode ?? null,
        };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  };
}

// Streaming SSE reader for OpenAI-compatible /chat/completions responses.
// Consumes a fetch Response body incrementally and invokes `onChunk` after
// every delta so the UI can show tokens as they arrive instead of waiting
// for the entire response. Returns the final { content, thinking, tool_calls }
// once the stream ends (or when the request is aborted).
//
// onChunk receives the latest accumulated state:
//   { content, thinking, tool_calls }
// so the caller can `setState` with it directly.
// Coerce the many shapes providers use for reasoning/thinking deltas into a
// single string we can append. Covers:
//   - plain strings (DeepSeek / Kimi: delta.reasoning_content = "...")
//   - arrays of delta objects (Anthropic-style: [{type:'thinking_delta', thinking:'...'}])
//   - single objects (some proxies: { text: "..." } or { thinking: "..." })
// Anything unrecognizable returns empty string so we don't corrupt the
// thinking buffer with [object Object].
function extractThinkingText(delta) {
  if (!delta || typeof delta !== "object") return "";
  const raw = delta.reasoning_content ?? delta.thinking ?? delta.reasoning;
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return item.thinking || item.text || item.content || "";
        }
        return "";
      })
      .join("");
  }
  if (typeof raw === "object") {
    return raw.thinking || raw.text || raw.content || "";
  }
  return "";
}

// Robust streaming `tool_calls` accumulator.
//
// The OpenAI spec says each delta chunk for a tool call carries an `index`
// field that identifies which call it belongs to. In practice many providers
// (Google's Gemma compat layer, some Ollama / LM Studio backends, a few
// proxies) violate this in two ways:
//
//   (a) They omit `index` entirely, returning each tool call as a single
//       fully-formed delta (id + name + arguments all at once).
//   (b) They send `index: 0` for every call even when emitting multiple
//       distinct calls — relying on the new `id` to disambiguate.
//
// Our previous code did `tc.index ?? 0` and appended `function.name` /
// `function.arguments` per-index. Under (a) and (b) this collapses N
// independent calls into one mega-call whose name is the concatenation
// of all names (e.g. `update_todo_listupdate_progressweb_search`) and
// whose arguments are concatenated JSON garbage — the user sees a single
// red error card with the smashed-together name.
//
// `createToolCallAccumulator()` resolves a slot for each delta in priority
// order: `id` (most reliable, when present) → `index` (legacy OpenAI path,
// only when no conflicting id has appeared at that slot) → "continuation
// of the last touched slot" (for providers that stream pure-arguments
// chunks with no routing hints at all).
function createToolCallAccumulator() {
  const slots = []; // ordered: { id, type, function:{name, arguments} }
  const byId = new Map(); // id → slots index
  let lastIdx = -1;

  const newSlot = (seedId) => {
    const slot = {
      id: seedId || "",
      type: "function",
      function: { name: "", arguments: "" },
    };
    slots.push(slot);
    if (seedId) byId.set(seedId, slots.length - 1);
    lastIdx = slots.length - 1;
    return lastIdx;
  };

  const resolve = (tc) => {
    // (1) Prefer id-based routing — the most authoritative signal a
    //     provider can emit. Even if `index` is present and would
    //     collide with another slot, a matching id wins.
    if (tc.id) {
      if (byId.has(tc.id)) return byId.get(tc.id);
      return newSlot(tc.id);
    }
    // (2) Fall back to numeric index. If there's already a slot at
    //     that index whose id is set and differs from this delta's
    //     (we don't have one — already handled above), keep it; else
    //     extend the array as needed.
    if (typeof tc.index === "number" && Number.isFinite(tc.index)) {
      while (slots.length <= tc.index) newSlot();
      lastIdx = tc.index;
      return tc.index;
    }
    // (3) Continuation chunk with neither id nor index — append to the
    //     most recently touched slot, allocating one if this is the
    //     very first chunk.
    if (lastIdx < 0) return newSlot();
    return lastIdx;
  };

  return {
    push(tc) {
      const idx = resolve(tc);
      const slot = slots[idx];
      if (tc.id && !slot.id) {
        slot.id = tc.id;
        byId.set(tc.id, idx);
      }
      if (tc.type) slot.type = tc.type;
      if (tc.function?.name) slot.function.name += tc.function.name;
      if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
    },
    snapshot() {
      // Drop empty slots (no name yet) and synth ids for slots whose
      // provider never emitted one.
      return slots
        .filter((s) => s.function.name)
        .map((s, i) => ({ ...s, id: s.id || `call_${Date.now()}_${i}` }));
    },
  };
}

export async function streamChatCompletion(response, onChunk) {
  // If the server returned plain JSON (non-stream), fall back to bulk parse.
  const contentType = response.headers.get("content-type") || "";
  if (
    !contentType.includes("text/event-stream") &&
    !contentType.includes("stream")
  ) {
    const rawText = await response.text();
    // Some providers return SSE even without the declared content-type;
    // `parseChatCompletion` handles both cases.
    const parsed = parseChatCompletion(rawText);
    onChunk?.(parsed);
    return parsed;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // `rawContent` is the unmodified text stream from `delta.content`. Some
  // models (e.g. Gemma 4) emit chain-of-thought inline as <thought>...</thought>
  // blocks inside this same channel instead of in a dedicated reasoning
  // field. We keep the raw stream here and let `snapshot()` split it into
  // visible answer vs. reasoning on every tick.
  let rawContent = "";
  let fullThinking = "";
  const toolAcc = createToolCallAccumulator();

  // Split `<thought>...</thought>` blocks out of the raw content stream. An
  // unterminated trailing `<thought>...` is treated as "currently thinking"
  // — its partial text is surfaced as live thinking but NOT as visible
  // answer, matching how a dedicated reasoning channel would behave.
  const splitInlineThought = (raw) => {
    if (!raw.includes("<thought>")) return { visible: raw, thought: "" };
    let visible = "";
    let thought = "";
    let i = 0;
    while (i < raw.length) {
      const start = raw.indexOf("<thought>", i);
      if (start === -1) {
        visible += raw.slice(i);
        break;
      }
      visible += raw.slice(i, start);
      const end = raw.indexOf("</thought>", start + 9);
      if (end === -1) {
        // Still streaming this block — show it as live thinking only.
        thought += (thought ? "\n\n" : "") + raw.slice(start + 9);
        break;
      }
      thought += (thought ? "\n\n" : "") + raw.slice(start + 9, end);
      i = end + 10;
    }
    return { visible, thought };
  };

  const snapshot = () => {
    const tool_calls = toolAcc.snapshot();
    const { visible, thought } = splitInlineThought(rawContent);
    const combinedThinking = [fullThinking, thought]
      .filter(Boolean)
      .join("\n\n");
    return {
      content: visible,
      thinking: combinedThinking || null,
      tool_calls,
    };
  };

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return false;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr || jsonStr === "[DONE]") return false;
    try {
      const chunk = JSON.parse(jsonStr);
      const delta = chunk.choices?.[0]?.delta || {};
      let changed = false;
      if (typeof delta.content === "string" && delta.content) {
        rawContent += delta.content;
        changed = true;
      }
      const think = extractThinkingText(delta);
      if (think) {
        fullThinking += think;
        changed = true;
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          toolAcc.push(tc);
          changed = true;
        }
      }
      return changed;
    } catch {
      return false;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the trailing (possibly-incomplete) line in the buffer.
      buffer = lines.pop() || "";
      let anyChanged = false;
      for (const line of lines) {
        if (processLine(line)) anyChanged = true;
      }
      if (anyChanged) onChunk?.(snapshot());
    }
    // Flush any remaining complete line in the buffer.
    if (buffer.trim()) {
      if (processLine(buffer)) onChunk?.(snapshot());
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* no-op */
    }
  }

  return snapshot();
}

// Parse an OpenAI-compatible /chat/completions response (SSE or plain JSON)
// into { content, thinking, tool_calls }. Used as a fallback when streaming
// isn't available (rare); live requests go through `streamChatCompletion`.
export function parseChatCompletion(rawText) {
  const isSSE = rawText.trimStart().startsWith("data:");

  if (isSSE) {
    let fullContent = "";
    let fullThinking = "";
    const toolAcc = createToolCallAccumulator();

    for (const line of rawText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const chunk = JSON.parse(jsonStr);
        const delta = chunk.choices?.[0]?.delta || {};
        if (typeof delta.content === "string") fullContent += delta.content;
        const think = extractThinkingText(delta);
        if (think) fullThinking += think;

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            toolAcc.push(tc);
          }
        }
      } catch {
        /* ignore malformed chunk */
      }
    }

    const tool_calls = toolAcc.snapshot();

    return mergeInlineThought({
      content: fullContent,
      thinking: fullThinking || null,
      tool_calls,
    });
  }

  // Non-stream JSON response
  const data = JSON.parse(rawText);
  const choice = data.choices?.[0];
  const msg = choice?.message || {};
  let thinking = null;
  if (msg.reasoning_content) {
    thinking = msg.reasoning_content;
  } else if (msg.thinking) {
    thinking =
      typeof msg.thinking === "string"
        ? msg.thinking
        : Array.isArray(msg.thinking)
          ? msg.thinking.map((t) => t.text || t.thinking || "").join("\n\n")
          : null;
  } else if (msg.reasoning) {
    thinking = msg.reasoning;
  }
  const tool_calls = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((t, i) => ({
        ...t,
        id: t.id || `call_${Date.now()}_${i}`,
      }))
    : [];
  return mergeInlineThought({
    content: msg.content || "",
    thinking,
    tool_calls,
  });
}

// Strip `<thought>...</thought>` blocks out of the `content` field and
// promote them to the `thinking` field. Gemma 4 and similar open models use
// this inline convention instead of a dedicated reasoning channel, so the
// CoT would otherwise leak into the visible answer.
function mergeInlineThought({ content, thinking, tool_calls }) {
  if (typeof content !== "string" || !content.includes("<thought>")) {
    return { content, thinking, tool_calls };
  }
  let visible = "";
  let extracted = "";
  let i = 0;
  while (i < content.length) {
    const start = content.indexOf("<thought>", i);
    if (start === -1) {
      visible += content.slice(i);
      break;
    }
    visible += content.slice(i, start);
    const end = content.indexOf("</thought>", start + 9);
    if (end === -1) {
      // Unterminated — treat remainder as still-thinking, drop from visible.
      extracted += (extracted ? "\n\n" : "") + content.slice(start + 9);
      break;
    }
    extracted += (extracted ? "\n\n" : "") + content.slice(start + 9, end);
    i = end + 10;
  }
  const combined = [thinking, extracted].filter(Boolean).join("\n\n");
  return {
    content: visible,
    thinking: combined || null,
    tool_calls,
  };
}

// ---------------------------------------------------------------------------
// Inline tool-call extractor (Gemma / open-weight fallback)
// ---------------------------------------------------------------------------
//
// Some models (notably Gemma 4, certain Qwen / Hermes / Llama fine-tunes when
// served via OpenAI-compat layers, and a subset of LM Studio / Ollama runs)
// do NOT populate `delta.tool_calls`. They instead inline the call as TEXT in
// the visible content using one of these conventions:
//
//   1. Gemma "tool_code" Python block:
//        ```tool_code
//        edit_file(target_file="x.js", instructions="…", code_edit="…")
//        ```
//
//   2. Hermes / Qwen-Agent JSON tag:
//        <tool_call>
//        {"name": "edit_file", "arguments": {"target_file": "x.js", …}}
//        </tool_call>
//
//   3. Bare JSON code-fence with the tool-call shape:
//        ```json
//        {"name": "edit_file", "arguments": {…}}
//        ```
//
// Without recovery, the agent loop sees `tool_calls.length === 0` and
// terminates — the user perceives this as "the model said it would edit
// the file, then nothing happened." This extractor runs ONLY when the
// structured channel is empty; if it finds any matches, it synthesises
// well-formed tool_calls and strips the matched blocks from `content`
// so the visible text isn't duplicated.

// Parse a Python-style argument list of the form
//   key1=val1, key2=val2, …
// supporting double / single / triple-quoted strings (with backslash
// escapes for the single-line variants), numbers, True/False/None, and
// nested JSON-like list/dict literals (best-effort — Python literals are
// converted to JSON by string substitution).
function parsePythonKwargs(src) {
  const args = {};
  let i = 0;
  const n = src.length;
  const skipWs = () => {
    while (i < n && /[\s,]/.test(src[i])) i++;
  };
  const readIdent = () => {
    const start = i;
    while (i < n && /[A-Za-z0-9_]/.test(src[i])) i++;
    return src.slice(start, i);
  };
  const readString = () => {
    // Triple-quoted? """…""" or '''…'''
    const ch = src[i];
    if (src.slice(i, i + 3) === ch.repeat(3)) {
      const end = src.indexOf(ch.repeat(3), i + 3);
      if (end === -1) throw new Error("unterminated triple-quoted string");
      const out = src.slice(i + 3, end);
      i = end + 3;
      return out;
    }
    // Single-line quoted
    const quote = ch;
    i++;
    let out = "";
    while (i < n) {
      const c = src[i];
      if (c === "\\" && i + 1 < n) {
        const nxt = src[i + 1];
        const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };
        out += map[nxt] !== undefined ? map[nxt] : nxt;
        i += 2;
        continue;
      }
      if (c === quote) {
        i++;
        return out;
      }
      out += c;
      i++;
    }
    throw new Error("unterminated string");
  };
  // Read a balanced [...] or {...} block and return its raw text.
  const readBalanced = (open, close) => {
    const start = i;
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '"' || c === "'") {
        readString();
        continue;
      }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          i++;
          return src.slice(start, i);
        }
      }
      i++;
    }
    throw new Error("unterminated bracket");
  };
  const readValue = () => {
    skipWs();
    const c = src[i];
    if (c === '"' || c === "'") return readString();
    if (c === "[") {
      const raw = readBalanced("[", "]");
      try {
        return JSON.parse(raw.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null"));
      } catch {
        return raw;
      }
    }
    if (c === "{") {
      const raw = readBalanced("{", "}");
      try {
        return JSON.parse(raw.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null"));
      } catch {
        return raw;
      }
    }
    // bare token: number / True / False / None / ident
    const start = i;
    while (i < n && !/[,\s)]/.test(src[i])) i++;
    const tok = src.slice(start, i);
    if (tok === "True") return true;
    if (tok === "False") return false;
    if (tok === "None") return null;
    if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
    return tok;
  };
  while (i < n) {
    skipWs();
    if (i >= n) break;
    const key = readIdent();
    if (!key) break;
    skipWs();
    if (src[i] !== "=") break;
    i++;
    args[key] = readValue();
  }
  return args;
}

// Try to extract one or more inline tool calls from a content string.
// Returns { calls: [{id,type,function:{name,arguments}}], cleanedContent }.
// `allowedNames` (optional) is a Set of registered tool names — calls whose
// name isn't in this set are ignored (prevents hallucinated function names
// from polluting the dispatch).
export function extractInlineToolCalls(content, allowedNames) {
  if (typeof content !== "string" || !content) {
    return { calls: [], cleanedContent: content || "" };
  }
  const calls = [];
  const ranges = []; // [start, end] segments to strip from content
  const allow = (name) => !allowedNames || allowedNames.has(name);
  const pushCall = (name, args, start, end) => {
    if (!name || !allow(name)) return;
    calls.push({
      id: `call_inline_${Date.now()}_${calls.length}`,
      type: "function",
      function: {
        name,
        arguments: typeof args === "string" ? args : JSON.stringify(args || {}),
      },
    });
    ranges.push([start, end]);
  };

  // (1) ```tool_code … ``` blocks
  const toolCodeRe = /```\s*tool_code\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = toolCodeRe.exec(content)) !== null) {
    let body = m[1].trim();
    // Body may be wrapped as `print(name(args))` — strip the outer print().
    const printMatch = /^print\(\s*([\s\S]*)\s*\)\s*$/.exec(body);
    if (printMatch) body = printMatch[1].trim();
    const callRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*$/;
    const cm = callRe.exec(body);
    if (cm) {
      const name = cm[1];
      try {
        const args = parsePythonKwargs(cm[2]);
        pushCall(name, args, m.index, m.index + m[0].length);
      } catch {
        /* ignore malformed call */
      }
    }
  }

  // (2) <tool_call>{json}</tool_call>
  const tagRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  while ((m = tagRe.exec(content)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      const name = obj.name || obj.function?.name;
      const args = obj.arguments ?? obj.function?.arguments ?? obj.parameters ?? {};
      pushCall(name, args, m.index, m.index + m[0].length);
    } catch {
      /* ignore */
    }
  }

  // (3) ```json {"name":…,"arguments":…} ``` — only treat as a tool call
  //     if the JSON has the exact tool-call shape (avoids eating regular
  //     code blocks the model is just demonstrating to the user).
  const jsonRe = /```\s*json\s*\n([\s\S]*?)```/g;
  while ((m = jsonRe.exec(content)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && typeof obj.name === "string" && (obj.arguments !== undefined || obj.parameters !== undefined)) {
        pushCall(obj.name, obj.arguments ?? obj.parameters ?? {}, m.index, m.index + m[0].length);
      }
    } catch {
      /* ignore */
    }
  }

  if (calls.length === 0) {
    return { calls: [], cleanedContent: content };
  }
  // Strip matched ranges from content (back-to-front to keep offsets valid).
  ranges.sort((a, b) => b[0] - a[0]);
  let cleaned = content;
  for (const [s, e] of ranges) cleaned = cleaned.slice(0, s) + cleaned.slice(e);
  return { calls, cleanedContent: cleaned.replace(/\n{3,}/g, "\n\n").trim() };
}
