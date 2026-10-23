import leaderboard from './leaderboard'
import { apis } from '../api-source'
import settingState from '@/store/setting/state'
import * as apiCookie from './api-cookie'
import user from './user'
import dailyRec from './dailyRec'
import getLyric from './lyric'
import getMusicInfo from './musicInfo'
import musicSearch from './musicSearch'
import songList from './songList'
import library from './library'
import hotSearch from './hotSearch'
import comment from './comment'
// import tipSearch from './tipSearch'

const wy = {
  // tipSearch,
  leaderboard,
  musicSearch,
  songList,
  library,
  hotSearch,
  comment,
  user,
  dailyRec,
  getMusicUrl(songInfo, type) {
    // 登录后走 Cookie 直连拿 VIP 音质，失败时由上层换源逻辑兜底；
    // 未登录保持原有行为，不影响任何现有用户
    if (settingState.setting['common.wyCookie']) return apiCookie.getMusicUrl(songInfo, type)
    return apis('wy').getMusicUrl(songInfo, type)
  },
  getLyric(songInfo) {
    return getLyric(songInfo.songmid)
  },
  getPic(songInfo) {
    const requestObj = getMusicInfo(songInfo.songmid)
    return requestObj.promise.then(info => info.al.picUrl)
  },
  getMusicDetailPageUrl(songInfo) {
    return `https://music.163.com/#/song?id=${songInfo.songmid}`
  },
}

export default wy
