import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * 注册 MCP 原生 Prompts，替代旧版针对单一客户端的 TOML 命令与工具参数提示。
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'read-webpage',
    {
      title: '读取网页内容',
      description: '只读提取网页正文并生成摘要（不会保存到笔记平台）。',
      argsSchema: {
        url: z.string().optional().describe('目标网页 URL；留空则读取当前活动标签页'),
      },
    },
    async ({ url }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              '请使用 SmartClip MCP 的只读工具 `read_page` 处理当前请求：',
              url ? `- 读取指定 URL：${url}` : '- 若未指定目标标签页，先直接调用 `read_page({})` 读取当前活动标签页，必要时用 `list_tabs` 确认 tabId。',
              '- 本流程为只读阅读，不要调用 `clip_page`（带 destination）或 `save_clip` 保存。',
              '- 基于提取出的 Markdown 内容进行准确总结与回答。',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'clip-webpage',
    {
      title: '剪藏网页到笔记',
      description: '将指定网页或当前标签页保存到 Notion、Obsidian 等笔记平台。',
      argsSchema: {
        url: z.string().optional().describe('目标网页 URL；留空则剪藏当前活动标签页'),
        destination: z.string().optional().describe('保存目标平台，如 obsidian、notion、flomo'),
      },
    },
    async ({ url, destination }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              '请使用 `clip_page` 将网页剪藏到用户的笔记平台：',
              url ? `- 目标 URL：${url}` : '- 剪藏当前活动标签页（可先 `list_tabs` 确认）。',
              destination
                ? `- 保存目标 destination：${destination}`
                : '- 请先询问并确认用户要保存到的 destination（例如 obsidian、notion、markdown、flomo），再传给 `clip_page`。',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'process-daily-tasks',
    {
      title: '处理每日任务池',
      description: '查看并处理 SmartClip 每日待剪藏任务池。',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              '请按以下步骤处理 SmartClip 每日任务池：',
              '1. 先调用 `get_daily_tasks({ status: "pending" })` 展示待办任务清单。',
              '2. 询问用户要处理单个任务还是全部待办；批量调用 `clip_all_daily_tasks` 前必须先获得用户确认。',
              '3. 处理单个任务使用 `clip_daily_task({ taskId })`，全部处理使用 `clip_all_daily_tasks`。',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.registerPrompt(
    'research-and-save',
    {
      title: '多页调研并保存总结',
      description: '读取多个打开的标签页或网页，提炼结构化研究笔记并经确认后保存。',
      argsSchema: {
        topic: z.string().optional().describe('调研主题或关注重点'),
        destination: z.string().optional().describe('最终保存目标平台，如 obsidian、notion'),
      },
    },
    async ({ topic, destination }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              '请执行 SmartClip 多页调研与归档工作流：',
              '1. 调用 `list_tabs` 列出相关标签页，筛选需要阅读的页面。',
              '2. 对目标标签页依次使用只读工具 `read_page` 提取正文。',
              topic ? `3. 围绕主题「${topic}」对比归纳核心观点，标注来源标题与 URL。` : '3. 提炼结构化 Markdown 总结，标注各部分来源链接。',
              destination
                ? `4. 先向用户展示总结预览并确认，确认后调用 \`save_clip\` 保存到 ${destination}。`
                : '4. 先向用户展示总结预览，询问目标平台后再调用 `save_clip` 保存。',
            ].join('\n'),
          },
        },
      ],
    }),
  )
}
