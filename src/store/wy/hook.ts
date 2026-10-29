import { useEffect, useState } from 'react'
import state from './state'

type WyEventName = 'wyAccountChanged' | 'wyLikedListChanged'

/**
 * 通用 wy 事件订阅：监听 global.state_event 的事件，用 selector 取快照。
 * 三个 hook（useWyAccount / useIsWyLiked / useWyLikedListInited）的
 * useEffect + on/off 样板完全一样，抽到这里统一维护。
 * selector 返回值用 Object.is 比较，没变化不触发重渲染。
 */
const useWyEvent = <T>(event: WyEventName, selector: () => T): T => {
  const [value, setValue] = useState(selector)
  useEffect(() => {
    const handleUpdate = () => {
      const next = selector()
      setValue(current => Object.is(current, next) ? current : next)
    }
    global.state_event.on(event, handleUpdate)
    handleUpdate()
    return () => { global.state_event.off(event, handleUpdate) }
  // selector 由调用方保证稳定（组件内静态箭头/模块级函数），依赖只挂事件名
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])
  return value
}

export const useWyAccount = () => {
  return useWyEvent('wyAccountChanged', () => state.account)
}

export const useIsWyLiked = (songId: string | number) => {
  const strId = String(songId)
  return useWyEvent('wyLikedListChanged', () => state.likedSongIds.has(strId))
}

export const useWyLikedListInited = () => {
  return useWyEvent('wyLikedListChanged', () => state.likedListInited)
}
