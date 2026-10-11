import type { UserConfig } from 'tsdown'

/** ModuleLoader 注册 id —— 必须是包名，与 `/plugins/<id>/client.js` 服务路由一致。 */
const PLUGIN_ID = 'dsh-session-attention'

/**
 * 客户端把 React 交给宿主运行时（ModuleLoader 的 require 提供 react /
 * react/jsx-runtime / react-dom），其余（本包相对导入）全部打进 lib/client.js。
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]

const clientBundle: UserConfig = {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    codeSplitting: false,
  },
}

export default [clientBundle] satisfies UserConfig[]
