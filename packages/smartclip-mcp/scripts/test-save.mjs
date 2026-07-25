#!/usr/bin/env node
/**
 * 真实保存测试——剪藏当前页面到指定平台。
 *
 * 使用方法：
 *   SMARTCLIP_MCP_SESSION_TOKEN=xxx node scripts/test-save.mjs [destination]
 *
 * 默认 destination = flowus
 * 确保当前活动标签页是普通网页（非 chrome:// 页面）
 */

import { WebSocketBridge } from '../dist/bridge/websocketBridge.js'
import { createBridgeInvoker, BridgeAction } from 'smartclip-bridge-protocol'

const destination = process.argv[2] || 'flowus'

async function main() {
  console.log(`🔧 剪藏保存测试 → ${destination}`)
  const bridge = new WebSocketBridge({
    sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
  })
  await bridge.connect()

  const invoker = createBridgeInvoker({
    send: (action, data) => bridge.send(action, data),
  })

  // 找到活动标签页
  console.log('⏳ 等待扩展连接...')
  const { tabs } = await invoker.invoke(BridgeAction.LIST_TABS)
  const activeTab = tabs.find(t => t.active)

  if (!activeTab) {
    console.error('❌ 没有活动标签页')
    process.exit(1)
  }

  if (activeTab.url.startsWith('chrome')) {
    console.error(`❌ 当前活动标签页是浏览器内部页面: ${activeTab.title}`)
    console.error('   请切换到一个普通网页后再试')
    process.exit(1)
  }

  console.log(`📄 目标页面: ${activeTab.title}`)
  console.log(`   URL: ${activeTab.url}`)

  // 剪藏 + 保存
  console.log(`\n📦 正在剪藏并保存到 ${destination}...`)
  try {
    const result = await invoker.invoke(BridgeAction.CLIP_PAGE, {
      tabId: activeTab.id,
      destination,
      mode: 'full',
    })

    console.log('\n✅ 保存成功！')
    console.log('   标题:', result.title || '(无)')
    console.log('   URL:', result.url || '(无)')
    console.log('   Markdown:', result.markdown?.length ?? 0, '字符')
    console.log('   taskId:', result.taskId || '(无)')

    if (result.warning)
      console.log('   ⚠️ 警告:', result.warning)
  }
  catch (err) {
    console.error('\n❌ 保存失败:', err.message)
    if (err.kind) console.error('   错误类型:', err.kind)
    if (err.code) console.error('   错误码:', err.code)
  }

  process.exit(0)
}

main().catch(err => {
  console.error('💥 致命错误:', err.message)
  process.exit(1)
})
