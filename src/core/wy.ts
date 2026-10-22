import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import wyState from '@/store/wy/state'
import { addLikedSong, removeLikedSong, resetLikedList, setAccount, setLikedSongIds } from '@/store/wy/action'
import wyApi, { isLoginCookie } from '@/utils/musicSdk/wy/user'
import dailyRecApi from '@/utils/musicSdk/wy/dailyRec'
import { clearWyAccountCache, getWyAccountCache, saveWyAccountCache } from '@/utils/data'
import { clearWebviewCookie } from '@/utils/nativeModules/cookieReader'
import { toast } from '@/utils/tools'
import { toNewMusicInfo } from '@/utils'
import { log as writeLog } from '@/utils/log'

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
  const account = await wyApi.getAccountInfo(cookie)
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

  syncingLikedList = wyApi.getLikedSongList(cookie, account.uid).then(ids => {
    setLikedSongIds(ids)
  }).catch(err => {
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
  return account
}

export const logoutWy = async() => {
  updateSetting({ 'common.wyCookie': '' })
  setAccount(null)
  resetLikedList()
  removeWyQuality()
  await clearWyAccountCache()
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
    toast(err.message || global.i18n.t('setting_wy_like_failed'))
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
