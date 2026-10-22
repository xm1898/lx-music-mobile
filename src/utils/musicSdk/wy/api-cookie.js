import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'
import settingState from '@/store/setting/state'

/**
 * 网易云 Cookie 直连播放地址
 *
 * 有 cookie 时走这里，能拿到 VIP 音质；
 * 拿不到（未登录 / 非 VIP / 无版权）就抛错，由 core/music/utils.ts 的换源逻辑接管，
 * 未登录用户的行为与原来完全一致。
 */

const getSongId = songInfo => songInfo.songmid || songInfo.meta?.songId

const getNoCopyrightRcmdSongId = songInfo => {
  const noCopyrightRcmd = songInfo.noCopyrightRcmd || songInfo.meta?.noCopyrightRcmd
  if (!noCopyrightRcmd) return null
  return noCopyrightRcmd.songId || noCopyrightRcmd.id || noCopyrightRcmd.song?.id || null
}

const createFallbackSongInfo = (songInfo, songId) => ({
  ...songInfo,
  songmid: songId,
  meta: {
    ...songInfo.meta,
    songId,
    originalSongId: getSongId(songInfo),
  },
})

// LX 音质 -> 网易云 level / encodeType
const getLevelConfig = type => {
  switch (type) {
    case '128k':
      return { level: 'standard', encodeType: 'aac' }
    case '320k':
      return { level: 'exhigh', encodeType: 'aac' }
    case 'flac':
      return { level: 'lossless', encodeType: 'flac' }
    case 'flac24bit':
      return { level: 'hires', encodeType: 'flac' }
    default:
      return { level: 'exhigh', encodeType: 'aac' }
  }
}

export const getMusicUrl = (songInfo, type, retryNum = 0, noCopyrightFallbackUsed = false) => {
  const requestObj = {}
  requestObj.cancelHttp = () => {}

  if (retryNum > 2) {
    requestObj.promise = Promise.reject(new Error('try max num'))
    return requestObj
  }

  const cookie = settingState.setting['common.wyCookie']
  if (!cookie) {
    requestObj.promise = Promise.reject(new Error('wy_cookie_not_set'))
    return requestObj
  }

  const songId = getSongId(songInfo)
  const { level, encodeType } = getLevelConfig(type)

  const _requestObj = httpFetch('https://music.163.com/weapi/song/enhance/player/url/v1', {
    method: 'post',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      origin: 'https://music.163.com',
      Referer: 'https://music.163.com',
      cookie,
    },
    form: weapi({
      ids: `[${songId}]`,
      level,
      encodeType,
      csrf_token: (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || '',
    }),
  })
  requestObj.cancelHttp = _requestObj.cancelHttp

  requestObj.promise = _requestObj.promise.then(({ body, statusCode }) => {
    if (statusCode !== 200 || body.code !== 200) throw new Error('wy_url_request_failed')

    const data = body.data?.[0]
    if (!data) throw new Error('wy_url_empty_response')

    if (!data.url) {
      // 无版权时网易云会给一个替代歌曲 id，能拿到就换一首
      const fallbackSongId = getNoCopyrightRcmdSongId(songInfo)
      if (fallbackSongId && !noCopyrightFallbackUsed && String(fallbackSongId) !== String(songId)) {
        const newRequestObj = getMusicUrl(createFallbackSongInfo(songInfo, fallbackSongId), type, 0, true)
        requestObj.cancelHttp = newRequestObj.cancelHttp
        return newRequestObj.promise
      }
      if (data.fee === 1 || data.fee === 4) throw new Error('wy_vip_required')
      throw new Error('wy_url_not_available')
    }

    return {
      type,
      url: data.url,
      level: data.level,
    }
  }).catch(err => {
    // VIP / 无版权属于确定性失败，重试没有意义，直接交给上层换源
    if (/wy_vip_required|wy_url_not_available|wy_cookie_not_set/.test(err.message)) throw err

    if (retryNum >= 2) throw err
    const newRequestObj = getMusicUrl(songInfo, type, retryNum + 1, noCopyrightFallbackUsed)
    requestObj.cancelHttp = newRequestObj.cancelHttp
    return newRequestObj.promise
  })

  return requestObj
}
