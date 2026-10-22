import { httpFetch } from '../../request'
import musicDetailApi from './musicDetail'
import { weapi } from './utils/crypto'

const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const getCsrf = cookie => (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''

const createHeaders = cookie => ({
  'User-Agent': UA_PC,
  origin: 'https://music.163.com',
  Referer: 'https://music.163.com',
  cookie,
})

const post = (url, cookie, data = {}) => {
  return httpFetch(url, {
    method: 'post',
    headers: createHeaders(cookie),
    form: weapi({ ...data, csrf_token: getCsrf(cookie) }),
  }).promise
}

export default {
  /**
   * 每日推荐歌曲
   */
  async getList(cookie) {
    if (!cookie) throw new Error('cookie_required')
    const { body, statusCode } = await post('https://music.163.com/weapi/v3/discovery/recommend/songs', cookie, {
      offset: 0,
      total: true,
      limit: 30,
    })
    if (statusCode !== 200 || body.code !== 200 || !body.data?.dailySongs) throw new Error('get_daily_rec_failed')
    return {
      source: 'wy',
      list: musicDetailApi.filterList({ songs: body.data.dailySongs, privileges: [] }),
    }
  },

  /**
   * 每日推荐歌单（不含歌曲，只有歌单元信息）
   */
  async getRecPlaylists(cookie) {
    if (!cookie) throw new Error('cookie_required')
    const { body, statusCode } = await post('https://music.163.com/weapi/v1/discovery/recommend/resource', cookie)
    if (statusCode !== 200 || body.code !== 200) throw new Error('get_rec_playlist_failed')
    return body.recommend || []
  },

  /**
   * 相似歌曲（心动模式的轻量替代）
   */
  async getSimilarSongs(cookie, songId, limit = 30, offset = 0) {
    if (!cookie) throw new Error('cookie_required')
    const { body, statusCode } = await post('https://music.163.com/weapi/v1/discovery/simiSong', cookie, {
      songid: songId,
      limit,
      offset,
    })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_similar_failed')
    return musicDetailApi.filterList({ songs: body.songs || [], privileges: [] })
  },
}
