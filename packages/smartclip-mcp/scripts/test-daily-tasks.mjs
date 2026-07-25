#!/usr/bin/env node
/**
 * Daily Tasks 剪藏测试——获取每日任务并批量保存到指定平台。
 *
 * 使用方法：
 *   SMARTCLIP_MCP_SESSION_TOKEN=xxx node scripts/test-daily-tasks.mjs [destination]
 *
 * 默认 destination = flowus
 */

import { WebSocketBridge } from '../dist/bridge/websocketBridge.js'
import { createBridgeInvoker, BridgeAction } from 'smartclip-bridge-protocol'

const destination = process.argv[2] || 'flowus'

async function main() {
  console.log(`📋 Daily Tasks 剪藏测试 → ${destination}`)
  const bridge = new WebSocketBridge({
    sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
  })
  await bridge.connect()

  const invoker = createBridgeInvoker({
    send: (action, data) => bridge.send(action, data),
  })

  // 1) 获取待办每日任务
  console.log('\n⏳ 等待扩展连接...')
  const { tasks, count, lastSyncAt } = await invoker.invoke(BridgeAction.GET_DAILY_TASKS, {})

  console.log(`\n━━━ 待办任务 (${count} 个) ━━━`)
  if (lastSyncAt)
    console.log(`   最后同步: ${new Date(lastSyncAt).toLocaleString()}`)

  if (count === 0) {
    console.log('   没有待处理的每日任务')
    process.exit(0)
  }

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    console.log(`   [${i + 1}] [${t.status}] ${t.title}`)
    console.log(`       URL: ${t.url}`)
    console.log(`       ID:  ${t.id}`)
  }

  // 2) 逐个剪藏保存
  console.log(`\n━━━ 开始剪藏保存到 ${destination} ━━━`)

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    if (task.status !== 'pending') {
      console.log(`\n⏭️  跳过 [${i + 1}] ${task.title} (状态: ${task.status})`)
      continue
    }

    console.log(`\n📦 [${i + 1}/${tasks.length}] 剪藏: ${task.title}`)
    console.log(`   URL: ${task.url}`)

    try {
      const result = await invoker.invoke(BridgeAction.CLIP_DAILY_TASK, {
        taskId: task.id,
        destination,
        mode: 'full',
        closeTab: true,
      })

      console.log('✅ 成功')
      console.log('   标题:', result.title || '(无)')
      if (result.clipTaskId)
        console.log('   taskId:', result.clipTaskId)
      if (result.warning)
        console.log('   ⚠️ 警告:', result.warning)
    }
    catch (err) {
      console.error('❌ 失败:', err.message)
      if (err.kind) console.error('   错误类型:', err.kind)
    }
  }

  console.log('\n━━━ 完成 ━━━')
  process.exit(0)
}

main().catch(err => {
  console.error('💥 致命错误:', err.message)
  process.exit(1)
})
