#!/usr/bin/env node
/**
 * 真实扩展集成测试——连接你浏览器中的 SmartClip 扩展。
 *
 * 使用方法：
 *   1. 确保 Chrome 已打开，SmartClip 扩展已安装并启用 MCP 服务
 *   2. 运行：node scripts/test-real-extension.mjs
 *   3. 脚本会等待扩展连接，然后依次执行 list-tabs → get-status → clip-page
 */

import { WebSocketBridge } from '../dist/bridge/websocketBridge.js'
import { createBridgeInvoker } from 'smartclip-bridge-protocol'
import { BridgeAction } from 'smartclip-bridge-protocol'

async function main() {
  console.log('🔧 启动 WebSocket Bridge (端口 18365)...')
  const bridge = new WebSocketBridge({
    sessionToken: process.env.SMARTCLIP_MCP_SESSION_TOKEN,
  })
  await bridge.connect()

  const invoker = createBridgeInvoker({
    send: (action, data) => bridge.send(action, data),
  })

  // 等待扩展连接
  console.log('⏳ 等待 Chrome 扩展连接...')
  console.log('   如果扩展未自动连接，请在 chrome://extensions 中刷新 SmartClip 扩展')
  // bridge.send 内部会 waitForExtension，这里直接调用即可

  // 1) GET_STATUS
  console.log('\n━━━ 1. GET_STATUS ━━━')
  try {
    const status = await invoker.invoke(BridgeAction.GET_STATUS)
    console.log('✅ 扩展已连接')
    console.log('   版本:', status.extensionVersion)
    console.log('   Pro:', status.pro)
    console.log('   MCP 开关:', status.mcpEnabled)
  }
  catch (err) {
    console.error('❌ GET_STATUS 失败:', err.message)
    process.exit(1)
  }

  // 2) LIST_TABS
  console.log('\n━━━ 2. LIST_TABS ━━━')
  try {
    const { tabs, count } = await invoker.invoke(BridgeAction.LIST_TABS)
    console.log(`✅ 当前 ${count} 个标签页:`)
    for (const tab of tabs.slice(0, 5)) {
      console.log(`   [${tab.active ? '★' : ' '}] ${tab.title}`)
      console.log(`       ${tab.url}`)
    }
    if (count > 5) console.log(`   ...还有 ${count - 5} 个`)
  }
  catch (err) {
    console.error('❌ LIST_TABS 失败:', err.message)
  }

  // 3) GET_DAILY_TASKS
  console.log('\n━━━ 3. GET_DAILY_TASKS ━━━')
  try {
    const { tasks, count, lastSyncAt } = await invoker.invoke(BridgeAction.GET_DAILY_TASKS, {})
    console.log(`✅ ${count} 个每日任务`)
    if (lastSyncAt)
      console.log('   最后同步:', new Date(lastSyncAt).toLocaleString())
    for (const t of tasks.slice(0, 5))
      console.log(`   [${t.status}] ${t.title}`)
  }
  catch (err) {
    console.error('❌ GET_DAILY_TASKS 失败:', err.message)
  }

  // 4) GET_VOCABULARY
  console.log('\n━━━ 4. GET_VOCABULARY ━━━')
  try {
    const { words, count, enabled } = await invoker.invoke(BridgeAction.GET_VOCABULARY)
    console.log(`✅ 生词本 ${count} 词 (enabled: ${enabled})`)
    for (const w of words.slice(0, 3))
      console.log(`   ${w.word} — ${w.definition || ''}`)
  }
  catch (err) {
    console.error('❌ GET_VOCABULARY 失败:', err.message)
  }

  // 5) CLIP_PAGE（提取当前活动标签页）
  console.log('\n━━━ 5. CLIP_PAGE（提取当前标签页） ━━━')
  try {
    // 从 LIST_TABS 找到活动标签页的 tabId
    const { tabs } = await invoker.invoke(BridgeAction.LIST_TABS)
    const activeTab = tabs.find(t => t.active)
    const clipParams = { mode: 'full' }
    if (activeTab)
      clipParams.tabId = activeTab.id
    console.log('   目标标签页:', activeTab ? `#${activeTab.id} ${activeTab.title}` : '默认')
    const result = await invoker.invoke(BridgeAction.CLIP_PAGE, clipParams)
    console.log('✅ 提取成功')
    console.log('   标题:', result.title || '(无)')
    console.log('   URL:', result.url || '(无)')
    console.log('   Markdown 长度:', result.markdown?.length ?? 0, '字符')
    if (result.markdown) {
      console.log('   前 200 字符:')
      console.log('   ' + result.markdown.substring(0, 200).replace(/\n/g, '\n   '))
    }
  }
  catch (err) {
    console.error('❌ CLIP_PAGE 失败:', err.message)
    if (err.kind) console.error('   错误类型:', err.kind)
  }

  console.log('\n━━━ 测试完成 ━━━')
  process.exit(0)
}

main().catch(err => {
  console.error('💥 致命错误:', err.message)
  process.exit(1)
})
