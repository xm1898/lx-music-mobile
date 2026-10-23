import { updateSetting } from '@/core/common'
import { createList, overwriteList, setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'
import settingState from '@/store/setting/state'
import listState from '@/store/list/state'
import wyState from '@/store/wy/state'
import { type WyAccountInfo } from '@/store/wy/state'
import { addLikedSong, removeLikedSong, resetLikedList, setAccount, setLikedSongIds } from '@/store/wy/action'
import wyApi, { isLoginCookie } from '@/utils/musicSdk/wy/user'
import dailyRecApi from '@/utils/musicSdk/wy/dailyRec'
import libraryApi from '@/utils/musicSdk/wy/library'
import commentApi from '@/utils/musicSdk/wy/comment'
import musicDetailApi from '@/utils/musicSdk/wy/musicDetail'
import {
  clearWyAccountCache,
  clearWyDailyRecCache,
  getWyAccountCache,
  getWyDailyRecCache,
  saveWyAccountCache,
  saveWyDailyRecCache,
} from '@/utils/data'
import { clearWebviewCookie } from '@/utils/nativeModules/cookieReader'
import { clearWyPlayHistory } from '@/core/wyHistory'
import { toast } from '@/utils/tools'
import { toNewMusicInfo } from '@/utils'
import { log as writeLog } from '@/utils/log'
import { AppState } from 'react-native'

const getCookie = () => settingState.setting['common.wyCookie']

// 只用来判断 cookie 有没有变，不需要密码学强度，避免依赖原生 md5 模块
const getCookieTag = (cookie: string) => {
  let h = 0
  for (let i = 0; i < cookie.length; i++) h = (h * 31 + cookie.charCodeAt(i)) | 0
  return String(h >>> 0)
}

/**
 * Cookie 直连支持的全部音质。
 * 上游的 qualityList 由所选接口（自定义源）决定，wy 不在其中，
 * 不注入的话即使登录了也只会请求 128k。实际能拿到哪一档由网易云按账号权益决定，
 * 拿不到时 api-cookie 会抛错并由上层换源。
 */
const WY_QUALITYS: LX.Quality[] = ['128k', '320k', 'flac', 'flac24bit']

export const ensureWyQuality = () => {
  if (!getCookie()) return
  if (global.lx.qualityList.wy) return
  global.lx.qualityList = { ...global.lx.qualityList, wy: WY_QUALITYS }
}

/** 退出登录后要把 wy 从音质表里摘掉，否则未登录也会去请求 flac 然后失败换源 */
export const removeWyQuality = () => {
  if (!global.lx.qualityList.wy) return
  const next = { ...global.lx.qualityList }
  delete next.wy
  global.lx.qualityList = next
}

/** 正在同步喜欢列表，避免重复请求 */
let syncingLikedList: Promise<void> | null = null

/** 拉取并缓存账号信息，成功即代表 cookie 有效 */
const fetchAccount = async(cookie: string) => {
  const account = await wyApi.getAccountInfo(cookie) as WyAccountInfo
  setAccount(account)
  await saveWyAccountCache({ ...account, cookieTag: getCookieTag(cookie) })
  return account
}

/**
 * 同步「我喜欢的音乐」到本地，用于列表页红心状态显示
 */
export const syncLikedList = async() => {
  const cookie = getCookie()
  const account = wyState.account
  if (!cookie || !account) return
  if (syncingLikedList) return syncingLikedList

  syncingLikedList = wyApi.getLikedSongList(cookie, account.uid).then((ids: string[]) => {
    setLikedSongIds(ids)
  }).catch((err: Error) => {
    writeLog.warn('[wy] sync liked list failed', err.message)
  }).finally(() => {
    syncingLikedList = null
  })
  return syncingLikedList
}

/**
 * 保存 cookie 并完成登录流程
 * @param cookie 从 WebView 拿到的完整 cookie 字符串
 * @param silent 静默模式，不弹 toast（启动校验时用）
 */
export const loginWy = async(cookie: string, silent = false) => {
  if (!isLoginCookie(cookie)) throw new Error('cookie_invalid')

  const account = await fetchAccount(cookie)
  updateSetting({ 'common.wyCookie': cookie })
  ensureWyQuality()
  if (!silent) toast(global.i18n.t('setting_wy_login_success'))
  void syncLikedList()
  // 刚登录，日推缓存必然不属于这个账号，直接拉一次
  void syncDailyRecommend().catch(err => {
    writeLog.warn('[wy] daily rec after login failed', err.message)
  })
  return account
}

export const logoutWy = async() => {
  updateSetting({ 'common.wyCookie': '' })
  setAccount(null)
  resetLikedList()
  removeWyQuality()
  await clearWyAccountCache()
  // 日推列表本身保留（用户可能想继续听），只清批次标记，换账号后能重拉
  await clearWyDailyRecCache()
  // 账号维度的资料库缓存全部作废，避免看到上一个账号的歌单/歌手
  clearWyLibCache()
  // 播放历史是本机行为记录，但会混账号，登出一并清掉
  await clearWyPlayHistory()
  // 不清 WebView 的 cookie，下次点登录会直接是已登录状态
  void clearWebviewCookie()
}

let eventBinded = false
/**
 * 启动时初始化：先用缓存点亮 UI，再后台校验 cookie
 */
export const initWy = async() => {
  // 切换接口会把 qualityList 整体替换掉，切完补回 wy
  if (!eventBinded) {
    eventBinded = true
    global.state_event.on('apiSourceUpdated', () => { ensureWyQuality() })
    // 常驻后台跨过 6 点的情况，靠回前台时补一次
    AppState.addEventListener('change', handleAppStateChange)
  }

  const cookie = getCookie()
  if (!cookie) return
  if (!isLoginCookie(cookie)) {
    // cookie 残缺（比如只同步了 document.cookie 没有 httpOnly 的 MUSIC_U），直接清掉
    writeLog.warn('[wy] cookie incomplete, clearing')
    await logoutWy()
    return
  }

  const cache = await getWyAccountCache()
  if (cache && cache.cookieTag === getCookieTag(cookie)) {
    setAccount({
      uid: cache.uid,
      nickname: cache.nickname,
      avatarUrl: cache.avatarUrl,
      vipType: cache.vipType,
    })
  }

  try {
    await fetchAccount(cookie)
    ensureWyQuality()
    void syncLikedList()
    autoSyncDailyRec()
  } catch (err: any) {
    writeLog.warn('[wy] init failed', err.message)
    // 只有明确判定登录失效才清 cookie，网络错误保留登录态
    if (err.message === 'login_expired' || err.message === 'cookie_invalid') {
      await logoutWy()
    }
  }
}

/**
 * 红心 / 取消红心，先改本地再发请求，失败回滚
 */
export const toggleLike = async(songId: string | number, like: boolean) => {
  const cookie = getCookie()
  if (!cookie) {
    toast(global.i18n.t('setting_wy_need_login'))
    throw new Error('not_login')
  }
  const strId = String(songId)
  const wasLiked = wyState.likedSongIds.has(strId)

  if (like) addLikedSong(strId)
  else removeLikedSong(strId)

  try {
    await wyApi.likeSong(cookie, strId, like)
  } catch (err: any) {
    // 回滚
    if (wasLiked) addLikedSong(strId)
    else removeLikedSong(strId)
    toast((err as Error)?.message || global.i18n.t('setting_wy_like_failed'))
    throw err
  }
}

/**
 * 每日推荐歌曲
 */
export const getDailyRecommendList = async(): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = getCookie()
  if (!cookie) throw new Error('not_login')
  const { list } = await dailyRecApi.getList(cookie)
  return list.map(toNewMusicInfo) as LX.Music.MusicInfoOnline[]
}

/** 每日推荐歌单（歌单元信息） */
export const getDailyRecommendPlaylists = async() => {
  const cookie = getCookie()
  if (!cookie) throw new Error('not_login')
  return dailyRecApi.getRecPlaylists(cookie)
}

/** 每日推荐专属列表的固定 id，靠它实现幂等覆盖而不是每次新建列表 */
export const WY_DAILY_LIST_ID = 'wy_daily_rec'
const getDailyListName = () => global.i18n.t('setting_wy_daily_list_name')

/**
 * 网易云的日推在每天 06:00 换一批，不是 00:00。
 * 所以「今天」的边界要往前推 6 小时，否则 0 点到 6 点之间拉到的还是昨天那批。
 */
const DAILY_REC_RESET_HOUR = 6
const getDailyRecDateKey = () => {
  const d = new Date(Date.now() - DAILY_REC_RESET_HOUR * 3600000)
  const pad = (n: number) => n < 10 ? `0${n}` : String(n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

let syncingDailyRec: Promise<number> | null = null

/**
 * 把当日推荐同步到专属列表。
 * 同一天重复调用直接跳过；歌曲整体覆盖，不做增量，避免列表越滚越长。
 * @param force 忽略「今天已同步」的判断，强制重拉
 * @returns 写入的歌曲数；跳过或未登录返回 -1
 */
export const syncDailyRecommend = async(force = false): Promise<number> => {
  const cookie = getCookie()
  const account = wyState.account
  if (!cookie || !account) return -1
  // 并发调用（启动 + 回前台）共用同一次请求
  if (syncingDailyRec) return syncingDailyRec

  const dateKey = getDailyRecDateKey()
  if (!force) {
    const cache = await getWyDailyRecCache()
    if (cache && cache.dateKey === dateKey && cache.uid === account.uid) return -1
  }

  // 用 promise 链而不是 async IIFE；并发由上面的 if (syncingDailyRec) 守卫
  // eslint-disable-next-line require-atomic-updates
  syncingDailyRec = getDailyRecommendList().then(async list => {
    if (!list.length) throw new Error('empty')

    const exists = listState.userList.some(l => l.id === WY_DAILY_LIST_ID)
    if (exists) {
      await overwriteList({
        id: WY_DAILY_LIST_ID,
        name: getDailyListName(),
        locationUpdateTime: null,
        list,
      })
    } else {
      await createList({
        id: WY_DAILY_LIST_ID,
        name: getDailyListName(),
        list,
        position: 0,
      })
    }

    await saveWyDailyRecCache({ dateKey, count: list.length, uid: account.uid })
    writeLog.info('[wy] daily rec synced', dateKey, list.length)
    return list.length
  }).finally(() => {
    syncingDailyRec = null
  })

  return syncingDailyRec
}

/** 供设置页显示「今日已同步 / 尚未同步」 */
export const getDailyRecSyncStatus = async() => {
  const account = wyState.account
  const cache = await getWyDailyRecCache()
  if (!cache || !account || cache.uid !== account.uid) return { synced: false, count: 0 }
  return { synced: cache.dateKey === getDailyRecDateKey(), count: cache.count }
}

/** 自动同步的静默版本，失败只写日志，不打扰用户 */const autoSyncDailyRec = () => {
  if (!settingState.setting['common.wyAutoDailyRec']) return
  void syncDailyRecommend().catch(err => {
    // 未登录、当天已同步、网络失败都很常见，不弹提示
    writeLog.warn('[wy] auto daily rec skipped', err.message)
  })
}

// 回到前台时补一次检查：App 常驻后台跨过 6 点的情况靠这里兜住
let lastResumeCheck = 0
const RESUME_CHECK_INTERVAL = 5 * 60 * 1000
const handleAppStateChange = (state: string) => {
  if (state != 'active') return
  const now = Date.now()
  if (now - lastResumeCheck < RESUME_CHECK_INTERVAL) return
  lastResumeCheck = now
  autoSyncDailyRec()
}

/** 相似歌曲 */
export const getSimilarSongs = async(songId: string | number, limit = 30) => {
  const cookie = getCookie()
  if (!cookie) throw new Error('not_login')
  const list = await dailyRecApi.getSimilarSongs(cookie, songId, limit)
  return list.map(toNewMusicInfo) as LX.Music.MusicInfoOnline[]
}

/**
 * 播放打点。
 * 网易云的日推完全依赖打点数据，不打点的话日推只会是热门歌单水平。
 * 只在「播放满 2 分钟」或「播放超过一半」时上报，避免触发风控。
 */
const scrobbledIds = new Set<string>()
export const handleScrobble = (musicInfo: LX.Music.MusicInfoOnline, playedSeconds: number, totalSeconds: number) => {
  if (musicInfo.source != 'wy') return
  if (!getCookie()) return
  if (totalSeconds <= 0) return

  const songId = String((musicInfo.meta as any).songId ?? musicInfo.id.replace(/^wy_/, ''))
  if (scrobbledIds.has(songId)) return
  if (playedSeconds < 120 && playedSeconds < totalSeconds * 0.5) return

  scrobbledIds.add(songId)
  if (scrobbledIds.size > 200) scrobbledIds.clear()

  const albumId = musicInfo.meta.albumId ?? 0
  void wyApi.scrobble(getCookie(), songId, albumId, playedSeconds).catch(err => {
    writeLog.warn('[wy] scrobble failed', err.message)
  })
}

/* ------------------------------------------------------------------ *
 * 账号资料库：我的歌单 / 推荐歌单 / 关注的歌手 / 收藏的专辑 / 歌手专辑详情
 *
 * 这些全是账号维度的接口，网易云对高频调用敏感（CK 会被风控），
 * 所以统一走 10 分钟内存缓存，进页面拿缓存、下拉刷新才强制重拉。
 * ------------------------------------------------------------------ */

const LIB_CACHE_TTL = 10 * 60 * 1000
const libCache = new Map<string, { time: number, data: any }>()

const withLibCache = async<T>(key: string, force: boolean, fetcher: () => Promise<T>): Promise<T> => {
  const hit = libCache.get(key)
  if (!force && hit && Date.now() - hit.time < LIB_CACHE_TTL) return hit.data as T
  const data = await fetcher()
  libCache.set(key, { time: Date.now(), data })
  return data
}

/** 退出登录 / 换账号时清空，避免看到上一个账号的数据 */
export const clearWyLibCache = () => { libCache.clear() }

const requireCookie = () => {
  const cookie = getCookie()
  if (!cookie) throw new Error('not_login')
  return cookie
}

export interface WyPlaylistItem {
  id: string
  name: string
  picUrl: string
  trackCount: number
  playCount: number
  creator?: string
}

export interface WyArtistItem {
  id: string
  name: string
  picUrl: string
  albumSize: number
  musicSize: number
}

export interface WyAlbumItem {
  id: string
  name: string
  picUrl: string
  singer: string
  size: number
  publishTime: number
}

const toPlaylistItem = (item: any): WyPlaylistItem => ({
  id: String(item.id),
  name: item.name || '',
  picUrl: item.coverImgUrl || item.picUrl || '',
  trackCount: item.trackCount ?? 0,
  playCount: item.playCount ?? 0,
  creator: item.creator?.nickname,
})

/** 我的歌单（含「我喜欢的音乐」） */
export const getMyPlaylists = async(force = false): Promise<WyPlaylistItem[]> => {
  const cookie = requireCookie()
  const account = wyState.account
  if (!account) throw new Error('not_login')
  return withLibCache(`my_playlists_${account.uid}`, force, async() => {
    const list = await wyApi.getUserPlaylists(cookie, account.uid) as any[]
    return list.map(toPlaylistItem)
  })
}

/** 每日推荐歌单 */
export const getRecPlaylists = async(force = false): Promise<WyPlaylistItem[]> => {
  const cookie = requireCookie()
  return withLibCache('rec_playlists', force, async() => {
    const list = await dailyRecApi.getRecPlaylists(cookie) as any[]
    return list.map(toPlaylistItem)
  })
}

/** 我关注的歌手 */
export const getFollowedArtists = async(force = false): Promise<WyArtistItem[]> => {
  const cookie = requireCookie()
  return withLibCache('followed_artists', force, async() => libraryApi.getFollowedArtists(cookie))
}

/** 我收藏的专辑 */
export const getCollectedAlbums = async(force = false): Promise<WyAlbumItem[]> => {
  const cookie = requireCookie()
  return withLibCache('collected_albums', force, async() => libraryApi.getCollectedAlbums(cookie))
}

/** 歌手热门歌曲 */
export const getArtistSongs = async(artistId: string | number): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = requireCookie()
  const list = await withLibCache(`artist_${artistId}`, false, async() => libraryApi.getArtistSongs(cookie, artistId))
  return list.map(toNewMusicInfo) as LX.Music.MusicInfoOnline[]
}

/** 专辑全部歌曲 */
export const getAlbumSongs = async(albumId: string | number): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = requireCookie()
  const list = await withLibCache(`album_${albumId}`, false, async() => libraryApi.getAlbumSongs(cookie, albumId))
  return list.map(toNewMusicInfo) as LX.Music.MusicInfoOnline[]
}

/** 「我喜欢的音乐」全量歌曲 */
export const getLikedSongs = async(): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = requireCookie()
  const account = wyState.account
  if (!account) throw new Error('not_login')
  const ids = await wyApi.getLikedSongList(cookie, account.uid) as string[]
  if (!ids.length) return []
  // 详情接口一次最多喂几十个 id，分批取
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  const results = await Promise.all(chunks.map(async chunk => musicDetailApi.getList(chunk).then(r => r.list).catch(() => [])))
  return results.flat().map(toNewMusicInfo) as LX.Music.MusicInfoOnline[]
}

const shuffle = <T>(arr: T[]): T[] => {
  const next = [...arr]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/**
 * 心动模式：拿 2~3 首种子歌去取相似歌曲再混合。
 * 不走官方「私人 FM」接口（那个风控最狠），用相似歌曲拼，稳定且不会误伤账号。
 * @param seedSongId 传了就以这首歌为种子，否则从「我喜欢的音乐」里随机挑
 */
export const getHeartModeList = async(seedSongId?: string | number, size = 40): Promise<LX.Music.MusicInfoOnline[]> => {
  const cookie = requireCookie()
  const account = wyState.account
  let seeds: string[] = []
  if (seedSongId) {
    seeds = [String(seedSongId)]
  } else if (account) {
    const ids = await wyApi.getLikedSongList(cookie, account.uid) as string[]
    seeds = shuffle(ids).slice(0, 3)
  }
  if (!seeds.length) throw new Error('empty')

  const batches = await Promise.all(seeds.map(async id => dailyRecApi.getSimilarSongs(cookie, id, 20).catch(() => [])))
  const seen = new Set<string>()
  const list: LX.Music.MusicInfoOnline[] = []
  for (const song of batches.flat()) {
    const id = String(song.songmid ?? song.id)
    if (seen.has(id)) continue
    seen.add(id)
    list.push(toNewMusicInfo(song) as LX.Music.MusicInfoOnline)
    if (list.length >= size) break
  }
  if (!list.length) throw new Error('empty')
  return list
}

/** 发送评论 */
export const sendWyComment = async(songId: string | number, content: string, replyToId?: string | number) => {
  const cookie = requireCookie()
  return commentApi.sendComment(cookie, songId, content, replyToId)
}

/** 是否已登录网易云（有 cookie 即视为登录，有效性由 initWy 后台校验） */
export const isWyLogin = () => !!getCookie()

/**
 * 相似歌曲：以当前歌为种子取相似歌曲，进试听列表直接播。
 * 不落用户列表，避免把搜索结果混进「我的列表」。
 */
export const playSimilarSongs = async(musicInfo: LX.Music.MusicInfoOnline, size = 30) => {
  const songId = String(musicInfo.meta.songId)
  const list = await getHeartModeList(songId, size)
  await setTempList(`wy_similar_${songId}`, list)
  void playList(LIST_IDS.TEMP, 0)
  return list.length
}
