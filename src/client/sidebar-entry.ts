/**
 * 侧边栏入口「提醒」：DOM 注入（shell 无对外侧边栏 slot），MutationObserver 自愈。
 * 与 task-board / ssh / 待办 的入口共处同一家族块，位置稳定、互斥开合。
 * @module dsh-session-attention/client/sidebar-entry
 */

import { attentionStore } from './attention-store.ts'

/** 入口行稳定标识。 */
const ENTRY_SELECTOR = '[data-dsh-att-entry]'

/**
 * 当前存活实例的清理函数。
 *
 * 客户端被重复 apply（HMR / 双重注册）时，旧实例的 MutationObserver 会在新实例接管后
 * 把旧元素重新插回去 —— 表现就是侧边栏出现两个入口。这里让新实例先干掉旧实例。
 */
let activeDispose: (() => void) | undefined

const ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.4 6.6a3.6 3.6 0 1 1 7.2 0c0 2.1.5 3.2 1 3.9H3.4c.5-.7 1-1.8 1-3.9Z"/><path d="M6.7 12.6a1.4 1.4 0 0 0 2.6 0"/></svg>`

function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

/**
 * 定位「新建会话」按钮（DSH 0.1.6 起它是 logoRow 的兄弟节点，不再是其子元素）；
 * 三级回退：全局 → root 内 → root 的第一个 button。
 */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const scopes: ParentNode[] = [document, root]
  for (const scope of scopes) {
    const found = scope.querySelector<HTMLButtonElement>('button[class*="newSession"]')
    if (found !== null) return found
  }
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/** `newSession` 按钮的宿主父元素（入口行的实际插入容器）。 */
function entryHost(button: HTMLButtonElement, fallback: HTMLElement): HTMLElement {
  const parent = button.parentElement
  return parent ?? button.closest<HTMLElement>('[class*="logoRow"]')?.parentElement ?? fallback
}

function createEntry(): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshAttEntry = ''
  entry.setAttribute('aria-label', '提醒')
  entry.innerHTML = `<span class="todo-entry-icon">${ICON}</span><span class="todo-entry-label">提醒</span>`
  entry.addEventListener('click', () => {
    attentionStore.togglePanel()
  })
  return entry
}

/** 家族锚点：与这些兄弟入口排在同一处。 */
const FAMILY_SELECTOR = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-todo-entry], [data-dsh-att-entry]'

function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  // 过期实例绝不抢插。守卫必须在这里而不是只在 tryPlace：rootObserver 也直接调本函数，
  // 少了它，旧实例会把入口插回来 —— 表现就是侧边栏多出一个入口。
  const owners = document.querySelectorAll(ENTRY_SELECTOR)
  if (owners.length > 1 || (owners.length === 1 && owners[0] !== entry)) return false
  const button = newSessionButton(root)
  if (button === undefined) return false
  const host = entryHost(button, root)
  if (entry.parentElement !== host) {
    const family = Array.from(host.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR),
    )
    const anchor = family.length > 0 ? family[0] : button.nextElementSibling
    host.insertBefore(entry, anchor)
  }
  return true
}

/** 挂载入口行并绑定激活态高亮。 */
export function mountSidebarEntry(): () => void {
  // 先干掉上一个实例（连同它的 observer），否则两个入口会同时存在。
  activeDispose?.()
  activeDispose = undefined
  // 幂等：清理旧实例残留（客户端 bundle 被重复加载时）。
  document.querySelectorAll(ENTRY_SELECTOR).forEach((el) => el.remove())

  const entry = createEntry()
  let root: HTMLElement | undefined
  let placed = false

  const tryPlace = (): void => {
    // 若场上已有别的实例的入口（跨 bundle 重复加载），本实例作废，绝不抢插。
    const owners = document.querySelectorAll(ENTRY_SELECTOR)
    if (owners.length > 1 || (owners.length === 1 && owners[0] !== entry)) return
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry)
    if (placed) rootObserver.observe(root, { childList: true, subtree: true })
  }

  /**
   * 清掉场上不属于本实例的入口。
   * 上限 20 次：万一遇到更老的、没有守卫的实例反复插回，也不会陷入无限循环。
   */
  let sweepBudget = 20
  const sweepForeign = (): void => {
    if (sweepBudget <= 0) return
    for (const el of document.querySelectorAll(ENTRY_SELECTOR)) {
      if (el === entry) continue
      el.remove()
      sweepBudget -= 1
    }
  }

  const waitObserver = new MutationObserver(() => { sweepForeign(); tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    sweepForeign()
    if (!root.contains(entry)) placed = placeEntry(root, entry)
  })

  const syncActive = (): void => {
    if (attentionStore.getSnapshot().panelOpen) entry.dataset.active = 'true'
    else delete entry.dataset.active
  }
  const unsubscribe = attentionStore.subscribe(syncActive)
  syncActive()

  tryPlace()

  const dispose = (): void => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribe()
    entry.remove()
    if (activeDispose === dispose) activeDispose = undefined
  }
  activeDispose = dispose
  return dispose
}
