import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'

/**
 * 网易云账号相关接口
 *
 * 所有需要登录态的接口都必须显式传入 cookie，不从全局 setting 里读，
 * 这样可以避免「cookie 刚改但 state 还没同步」导致的请求错乱。
 */

const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const getCsrf = cookie => (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

const createHeaders = cookie => ({
  'User-Agent': UA_PC,
  origin: 'https://music.163.com',
  Referer: 'https://music.163.com',
  cookie,
})

/**
 * 判断一份 cookie 是否具备登录态
 * MUSIC_U 是唯一的登录凭证（httpOnly），__csrf 只用于部分接口防伪，新版登录可能不下发，
 * 所以这里只校验 MUSIC_U，真正的有效性由 getAccountInfo 兜底验证
 */
export const isLoginCookie = cookie => {
  return typeof cookie == 'string' && cookie.includes('MUSIC_U=')
}

const request = (url, cookie, data = {}, retryNum = 0) => {
  const requestObj = httpFetch(url, {
    method: 'post',
    headers: createHeaders(cookie),
    form: weapi({ ...data, csrf_token: getCsrf(cookie) }),
  })
  return requestObj.promise.catch(err => {
    // 业务错误是下面各方法里自己 throw 的 snake_case 消息，重试没有意义；
    // 网络层错误是 requestMsg 里的中文提示，才值得重试
    const isBizError = /^[a-z0-9_]+$/.test(err.message || '')
    if (isBizError || retryNum >= 2) throw err
    return request(url, cookie, data, retryNum + 1)
  })
}

export default {
  /**
   * 拉取账号信息，同时用于校验 cookie 是否有效
   * @returns {{uid: string, nickname: string, avatarUrl: string, vipType: number}}
   */
  async getAccountInfo(cookie) {
    if (!isLoginCookie(cookie)) throw new Error('cookie_invalid')

    let body
    let statusCode = 0
    try {
      ({ body, statusCode } = await request('https://music.163.com/weapi/w/nuser/account/get', cookie))
    } catch (err) {
      // 网络错误，直接抛
      throw err
    }
    // 新版路径拿不到时回落到旧版路径，两者返回结构一致
    if (statusCode !== 200 || !body?.account?.id) {
      const res = await request('https://music.163.com/weapi/nuser/account/get', cookie)
      body = res.body
      statusCode = res.statusCode
    }

    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_account_failed')
    if (!body.account?.id) throw new Error('login_expired')

    const profile = body.profile || {}
    return {
      uid: String(body.account.id),
      nickname: profile.nickname || `用户${body.account.id}`,
      avatarUrl: profile.avatarUrl || '',
      vipType: Number(profile.vipType ?? body.account.vipType ?? 0),
    }
  },

  /**
   * 红心/取消红心
   */
  async likeSong(cookie, songId, like) {
    const { body, statusCode } = await request('https://music.163.com/weapi/song/like', cookie, {
      trackId: songId,
      like,
      time: 3,
      alg: 'itembased',
    })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'like_failed')
    return true
  },

  /**
   * 获取「我喜欢的音乐」全部歌曲 id
   */
  async getLikedSongList(cookie, uid) {
    const { body, statusCode } = await request('https://music.163.com/weapi/song/like/get', cookie, {
      uid: String(uid),
    })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_liked_failed')
    return (body.ids || []).map(String)
  },

  /**
   * 获取用户歌单列表
   */
  async getUserPlaylists(cookie, uid) {
    const { body, statusCode } = await request('https://music.163.com/weapi/user/playlist', cookie, {
      uid: String(uid),
      limit: 1000,
      offset: 0,
      includeVideo: true,
    })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_playlist_failed')
    return body.playlist || []
  },

  /**
   * 播放打点。日推质量完全依赖这个接口，不接的话日推只会是热门歌单水平。
   * @param {number|string} songId 歌曲 id
   * @param {number|string} sourceId 来源歌单/专辑 id，没有就传 0
   * @param {number} duration 已播放秒数
   */
  async scrobble(cookie, songId, sourceId, duration) {
    const { body, statusCode } = await request('https://music.163.com/weapi/feedback/weblog', cookie, {
      logs: JSON.stringify([{
        action: 'play',
        json: {
          id: songId,
          download: 0,
          type: 'song',
          sourceId: String(sourceId || 0),
          time: Math.floor(duration),
          end: 'playend',
          wifi: 0,
        },
      }]),
    })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'scrobble_failed')
    return true
  },
}
