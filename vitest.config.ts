import { defineConfig } from 'vitest/config'

/**
 * 根 vitest 配置。
 *
 * 只收编各包 src 下的 vitest 测试（*.test.ts）。
 * smartclip-agent-extension 的 __tests__ 是 node:test 套件，
 * 由该包自身的 `node --test` 脚本运行（根 pnpm test 会串链调用），
 * 不属于 vitest 范围。
 */
export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
})
