#!/usr/bin/env node
/**
 * Native Messaging Host 安装脚本
 *
 * 将 Native Messaging Host manifest 注册到 Chrome/Chromium 的配置目录，
 * 使 SmartClip 扩展能够通过 chrome.runtime.connectNative 与 native-host 通信。
 *
 * 用法（通过 smartclip-mcp 入口）：
 *   smartclip-mcp install [--extension-id <id>] [--browser <chrome|chromium|edge>]
 *   smartclip-mcp uninstall [--browser <chrome|chromium|edge>]
 *
 * 用法（直接运行）：
 *   node install.js [--extension-id <id>] [--uninstall] [--browser <chrome|chromium|edge>]
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir, platform } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const HOST_NAME = 'com.smartclip.mcp'
const HOST_DESCRIPTION = 'SmartClip MCP Native Messaging Bridge'

interface InstallOptions {
  extensionId?: string
  uninstall?: boolean
  browser?: 'chrome' | 'chromium' | 'edge'
}

function parseArgs(): InstallOptions {
  const args = process.argv.slice(2)
  const options: InstallOptions = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--extension-id':
        options.extensionId = args[++i]
        break
      case '--uninstall':
        options.uninstall = true
        break
      case '--browser':
        options.browser = args[++i] as any
        break
      case '--help':
        printHelp()
        process.exit(0)
    }
  }

  return options
}

function printHelp(): void {
  console.log(`
SmartClip Native Messaging Host 安装工具

用法:
  smartclip-mcp install [选项]
  smartclip-mcp uninstall [选项]

选项:
  --extension-id <id>     Chrome 扩展 ID（如不提供，将尝试自动检测）
  --browser <name>        浏览器类型: chrome, chromium, edge（默认: chrome）
  --help                  显示帮助信息

示例:
  smartclip-mcp install --extension-id abcdefghijklmnopqrstuvwxyz123456
  smartclip-mcp install --browser chromium
  smartclip-mcp uninstall
`)
}

function getNativeHostDir(browser: string): string {
  const os = platform()

  if (os === 'darwin') {
    switch (browser) {
      case 'chromium':
        return join(homedir(), 'Library/Application Support/Chromium/NativeMessagingHosts')
      case 'edge':
        return join(homedir(), 'Library/Application Support/Microsoft Edge/NativeMessagingHosts')
      default:
        return join(homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts')
    }
  }

  if (os === 'linux') {
    switch (browser) {
      case 'chromium':
        return join(homedir(), '.config/chromium/NativeMessagingHosts')
      case 'edge':
        return join(homedir(), '.config/microsoft-edge/NativeMessagingHosts')
      default:
        return join(homedir(), '.config/google-chrome/NativeMessagingHosts')
    }
  }

  if (os === 'win32') {
    const appData = process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local')
    switch (browser) {
      case 'chromium':
        return join(appData, 'Chromium/User Data/NativeMessagingHosts')
      case 'edge':
        return join(appData, 'Microsoft/Edge/User Data/NativeMessagingHosts')
      default:
        return join(appData, 'Google/Chrome/User Data/NativeMessagingHosts')
    }
  }

  throw new Error(`不支持的操作系统: ${os}`)
}

async function tryDetectExtensionId(browser: string): Promise<string | null> {
  const os = platform()
  let profileDir: string

  if (os === 'darwin') {
    switch (browser) {
      case 'chromium':
        profileDir = join(homedir(), 'Library/Application Support/Chromium/Default/Extensions')
        break
      case 'edge':
        profileDir = join(homedir(), 'Library/Application Support/Microsoft Edge/Default/Extensions')
        break
      default:
        profileDir = join(homedir(), 'Library/Application Support/Google/Chrome/Default/Extensions')
    }
  }
  else if (os === 'linux') {
    switch (browser) {
      case 'chromium':
        profileDir = join(homedir(), '.config/chromium/Default/Extensions')
        break
      default:
        profileDir = join(homedir(), '.config/google-chrome/Default/Extensions')
    }
  }
  else {
    return null
  }

  if (!existsSync(profileDir))
    return null

  try {
    const extensionDirs = readdirSync(profileDir)
    for (const extId of extensionDirs) {
      if (extId.length !== 32)
        continue
      const extPath = join(profileDir, extId)
      try {
        const versions = readdirSync(extPath)
        for (const version of versions) {
          const manifestPath = join(extPath, version, 'manifest.json')
          if (existsSync(manifestPath)) {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
            if (manifest.name === '__MSG_extName__' || manifest.name?.includes('SmartClip')) {
              return extId
            }
          }
        }
      }
      catch { /* skip */ }
    }
  }
  catch { /* skip */ }

  return null
}

/**
 * 解析 native-host.js 的绝对路径。
 *
 * 优先级：
 * 1. 相对于当前脚本的路径（适用于 npm 全局安装和 npx）
 * 2. 通过 which 查找 smartclip-mcp-host 命令（备选）
 */
function resolveNativeHostPath(): string {
  // 方式 1：相对路径（dist/scripts/install.js → dist/bridge/native-host.js）
  const relativePath = resolve(__dirname, '..', 'bridge', 'native-host.js')
  if (existsSync(relativePath)) {
    return relativePath
  }

  // 方式 2：通过 which 查找全局安装的命令
  try {
    const cmd = platform() === 'win32' ? 'where smartclip-mcp-host' : 'which smartclip-mcp-host'
    const binPath = execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0]
    if (binPath && existsSync(binPath)) {
      return binPath
    }
  }
  catch { /* not found */ }

  // 兜底：仍然返回相对路径（安装时会报错提示）
  return relativePath
}

/**
 * 生成 Native Messaging Host 的 wrapper 脚本。
 * Chrome 要求 native host 的 path 指向一个可直接执行的文件。
 * 在 macOS/Linux 上生成一个 shell wrapper 来调用 node。
 * 在 Windows 上生成一个 .bat wrapper。
 */
function createWrapper(nativeHostJsPath: string, hostDir: string): string {
  const os = platform()

  if (os === 'win32') {
    const wrapperPath = join(hostDir, 'smartclip-mcp-host.bat')
    writeFileSync(wrapperPath, `@echo off\r\nnode "${nativeHostJsPath}" %*\r\n`)
    return wrapperPath
  }

  // macOS / Linux: shell wrapper
  const wrapperPath = join(hostDir, 'smartclip-mcp-host')
  writeFileSync(wrapperPath, `#!/bin/sh\nexec node "${nativeHostJsPath}" "$@"\n`)
  chmodSync(wrapperPath, 0o755)
  return wrapperPath
}

function createManifest(extensionId: string, executablePath: string): object {
  return {
    name: HOST_NAME,
    description: HOST_DESCRIPTION,
    path: executablePath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  }
}

async function install(options: InstallOptions): Promise<void> {
  const browser = options.browser || 'chrome'

  let extensionId = options.extensionId
  if (!extensionId) {
    console.log('正在尝试自动检测 SmartClip 扩展 ID...')
    extensionId = (await tryDetectExtensionId(browser)) ?? undefined
    if (extensionId) {
      console.log(`检测到扩展 ID: ${extensionId}`)
    }
    else {
      console.error('无法自动检测扩展 ID。请使用 --extension-id 参数手动指定。')
      console.error('你可以在 chrome://extensions 页面找到 SmartClip 的扩展 ID。')
      process.exit(1)
    }
  }

  const hostDir = getNativeHostDir(browser)
  mkdirSync(hostDir, { recursive: true })

  // 解析 native-host.js 路径并创建 wrapper
  const nativeHostJsPath = resolveNativeHostPath()
  if (!existsSync(nativeHostJsPath)) {
    console.error(`错误: 找不到 native-host.js: ${nativeHostJsPath}`)
    console.error('请确保已正确构建项目（npm run build）或通过 npm 安装。')
    process.exit(1)
  }

  const wrapperPath = createWrapper(nativeHostJsPath, hostDir)
  const manifest = createManifest(extensionId, wrapperPath)
  const manifestPath = join(hostDir, `${HOST_NAME}.json`)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  console.log('')
  console.log('✅ Native Messaging Host 安装成功！')
  console.log('')
  console.log(`   Manifest:    ${manifestPath}`)
  console.log(`   Wrapper:     ${wrapperPath}`)
  console.log(`   Native Host: ${nativeHostJsPath}`)
  console.log(`   扩展 ID:     ${extensionId}`)
  console.log(`   浏览器:      ${browser}`)
  console.log('')
  console.log('请重启 Chrome 浏览器以使配置生效。')
}

function uninstall(options: InstallOptions): void {
  const browser = options.browser || 'chrome'
  const hostDir = getNativeHostDir(browser)
  const manifestPath = join(hostDir, `${HOST_NAME}.json`)

  let removed = false

  if (existsSync(manifestPath)) {
    unlinkSync(manifestPath)
    removed = true
  }

  // 清理 wrapper
  const wrapperSh = join(hostDir, 'smartclip-mcp-host')
  const wrapperBat = join(hostDir, 'smartclip-mcp-host.bat')
  for (const p of [wrapperSh, wrapperBat]) {
    if (existsSync(p)) {
      unlinkSync(p)
      removed = true
    }
  }

  if (removed) {
    console.log('✅ Native Messaging Host 已卸载')
  }
  else {
    console.log('Native Messaging Host 未安装，无需卸载')
  }
}

async function main(): Promise<void> {
  const options = parseArgs()

  if (options.uninstall) {
    uninstall(options)
  }
  else {
    await install(options)
  }
}

main().catch((err) => {
  console.error(`错误: ${err.message}`)
  process.exit(1)
})
