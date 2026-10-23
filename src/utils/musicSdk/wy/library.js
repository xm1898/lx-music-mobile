import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'
import musicDetailApi from './musicDetail'

/**
 * 网易云「账号资料库」相关接口：关注的歌手、收藏的专辑、歌手热门、专辑歌曲。
 * 与 user.js 一样，cookie 由调用方显式传入。
 */

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

const toArtist = item => ({
  id: String(item.id),
  name: item.name || '',
  picUrl: item.picUrl || item.img1v1Url || item.cover || '',
  albumSize: item.albumSize || 0,
  musicSize: item.musicSize || 0,
})

const toAlbum = item => ({
  id: String(item.id),
  name: item.name || '',
  picUrl: item.picUrl || '',
  singer: item.artists?.map(a => a.name).join(' / ') || item.artist?.name || '',
  size: item.size || 0,
  publishTime: item.publishTime || 0,
})

export default {
  /**
   * 我关注的歌手
   */
  async getFollowedArtists(cookie, limit = 100, offset = 0) {
    if (!cookie) throw new Error('cookie_required')
    const { body, statusCode } = await post('https://music.163.com/weapi/artist/sublist', cookie, { limit, offset, total: true })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_followed_artist_failed')
    return (body.data || []).map(toArtist)
  },

  /**
   * 我收藏的专辑
   */
  async getCollectedAlbums(cookie, limit = 100, offset = 0) {
    if (!cookie) throw new Error('cookie_required')
    const { body, statusCode } = await post('https://music.163.com/weapi/album/sublist', cookie, { limit, offset, total: true })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_collected_album_failed')
    return (body.data || body.albums || []).map(toAlbum)
  },

  /**
   * 歌手热门歌曲（默认前 50 首，足够当详情页用）
   */
  async getArtistSongs(cookie, artistId, limit = 50) {
    if (!cookie) throw new Error('cookie_required')
    const { body, statusCode } = await post('https://music.163.com/weapi/artist/top/song', cookie, { id: String(artistId) })
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_artist_songs_failed')
    const songs = body.songs || []
    return musicDetailApi.filterList({ songs: songs.slice(0, limit), privileges: [] })
  },

  /**
   * 专辑全部歌曲
   */
  async getAlbumSongs(cookie, albumId) {
    if (!cookie) throw new Error('cookie_required')
    const { body, statusCode } = await post(`https://music.163.com/weapi/v1/album/${albumId}`, cookie, {})
    if (statusCode !== 200 || body.code !== 200) throw new Error(body.message || 'get_album_songs_failed')
    return musicDetailApi.filterList({ songs: body.songs || [], privileges: [] })
  },

  /**
   * 批量取歌曲详情（我喜欢的音乐全量用）
   */
  async getSongDetails(ids) {
    if (!ids?.length) return []
    const { list } = await musicDetailApi.getList(ids)
    return list
  },
}
