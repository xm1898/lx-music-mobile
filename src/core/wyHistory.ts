import { getData, saveData, removeData } from '@/plugins/storage'
import { storageDataPrefix } from '@/config/constant'
import { throttle } from '@/utils/common'

/**
 * 网易云播放历史 + 听歌统计。
 *
 * 纯本地记录（不上传网易云，避免额外打接口触发风控）：
 * - list：按歌曲聚合，去重、计数、累计时长、记录最后一次播放时间
 * - daily：按天聚合，用来算「本周 / 本月」听了多少
 * 写盘节流 2 秒，切歌/暂停等场景最多丢 2 秒数据。
 */

export interface WyPlayHistoryItem {
  /** 网易云歌曲 id（songmid，不含 wy_ 前缀） */
  id: string
  name: string
  singer: string
  album: string
  img: string
  interval: string
  /** 播放次数 */
  count: number
  /** 累计播放秒数 */
  duration: number
  /** 最后一次播放的时间戳 */
  lastPlayTime: number
  /** 记录时的可用音质，回放时还原，避免从无损掉回 128k */
  qualitys: LX.Music.MusicInfoOnline['meta']['qualitys']
  _qualitys: LX.Music.MusicInfoOnline['meta']['_qualitys']
}

interface WyDailyStat {
  /** YYYY-MM-DD，本地时区 */
  date: string
  /** 当天播放次数 */
  count: number
  /** 当天播放秒数 */
  duration: number
}

interface WyHistoryData {
  list: WyPlayHistoryItem[]
  daily: WyDailyStat[]
}

const MAX_HISTORY = 300
const MAX_DAILY = 120
const wyHistoryKey = storageDataPrefix.wyHistory

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

let data: WyHistoryData = { list: [], daily: [] }
/** 初始化 promise，并发调用复用一个，避免读到半初始化数据 */
let initPromise: Promise<void> | null = null
/** 存储数据是否已加载完；没加载完时记录类调用直接跳过，否则会被初始化覆盖 */
let loaded = false

const save = throttle(() => {
  void saveData(wyHistoryKey, data)
}, 2000)

export const initWyHistory = async() => {
  if (!initPromise) {
    initPromise = getData<WyHistoryData>(wyHistoryKey).then(cache => {
      data = cache && Array.isArray(cache.list) && Array.isArray(cache.daily)
        ? { list: cache.list, daily: cache.daily }
        : { list: [], daily: [] }
      loaded = true
    })
  }
  return initPromise
}

const bumpDaily = (count: number, duration: number) => {
  const key = dateKey(new Date())
  let day = data.daily.find(d => d.date == key)
  if (!day) {
    day = { date: key, count: 0, duration: 0 }
    data.daily.push(day)
    // 只保留最近 MAX_DAILY 天，防止无限增长
    if (data.daily.length > MAX_DAILY) {
      data.daily.sort((a, b) => (a.date < b.date ? -1 : 1))
      data.daily.splice(0, data.daily.length - MAX_DAILY)
    }
  }
  day.count += count
  day.duration += duration
}

/** 歌曲开始播放时记一次；同一首歌连续重复播放也会累加次数 */
export const recordWyPlay = (musicInfo: LX.Music.MusicInfoOnline) => {
  if (!loaded || musicInfo.source != 'wy') return
  const id = String(musicInfo.meta.songId)
  const idx = data.list.findIndex(i => i.id == id)
  const now = Date.now()

  if (idx > -1) {
    const [item] = data.list.splice(idx, 1)
    item.count++
    item.lastPlayTime = now
    data.list.unshift(item)
  } else {
    data.list.unshift({
      id,
      name: musicInfo.name,
      singer: musicInfo.singer,
      album: musicInfo.meta.albumName ?? '',
      img: musicInfo.meta.picUrl ?? '',
      interval: musicInfo.interval ?? '',
      count: 1,
      duration: 0,
      lastPlayTime: now,
      qualitys: musicInfo.meta.qualitys ?? [],
      _qualitys: musicInfo.meta._qualitys ?? {},
    })
    if (data.list.length > MAX_HISTORY) data.list.length = MAX_HISTORY
  }
  bumpDaily(1, 0)
  save()
}

/** 播放中累加时长，seconds 由播放进度每秒驱动 */
export const addWyPlayDuration = (musicInfo: LX.Music.MusicInfoOnline, seconds: number) => {
  if (!loaded || musicInfo.source != 'wy' || seconds <= 0) return
  const id = String(musicInfo.meta.songId)
  const item = data.list.find(i => i.id == id)
  if (item) {
    item.duration += seconds
  } else {
    // 歌曲被历史裁掉（超 MAX_HISTORY）但还在播：重新入列，别把时长丢了
    recordWyPlay(musicInfo)
    const reAdded = data.list.find(i => i.id == id)
    if (reAdded) reAdded.duration += seconds
  }
  bumpDaily(0, seconds)
  save()
}

export const getWyPlayHistory = async(): Promise<WyPlayHistoryItem[]> => {
  await initWyHistory()
  return [...data.list].sort((a, b) => b.lastPlayTime - a.lastPlayTime)
}

export const clearWyPlayHistory = async() => {
  data = { list: [], daily: [] }
  initPromise = Promise.resolve()
  loaded = true
  await removeData(wyHistoryKey)
}

export interface WyPlayStat {
  /** 播放次数 */
  count: number
  /** 播放秒数 */
  duration: number
}

export interface WyPlayStats {
  week: WyPlayStat
  month: WyPlayStat
  total: WyPlayStat
  /** 历史里去重后的歌曲数 */
  songs: number
}

const sumDaily = (from: Date): WyPlayStat => {
  const result = { count: 0, duration: 0 }
  for (const d of data.daily) {
    if (new Date(`${d.date}T00:00:00`) < from) continue
    result.count += d.count
    result.duration += d.duration
  }
  return result
}

export const getWyPlayStats = async(): Promise<WyPlayStats> => {
  await initWyHistory()
  const now = new Date()
  // 本周一 00:00（getDay() 周日是 0，换算成周一开头的 7）
  const offset = (now.getDay() || 7) - 1
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const total = data.list.reduce((acc, i) => ({
    count: acc.count + i.count,
    duration: acc.duration + i.duration,
  }), { count: 0, duration: 0 })

  return {
    week: sumDaily(weekStart),
    month: sumDaily(monthStart),
    total,
    songs: data.list.length,
  }
}
