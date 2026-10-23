import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'

/**
 * 网易云详情页（歌单 / 歌手 / 专辑）共用的播放动作：
 * 这些列表都不落用户列表，直接进试听列表播放。
 */
export const handlePlay = async(listId: string, list: LX.Music.MusicInfoOnline[], index = 0) => {
  if (!list.length) return
  await setTempList(listId, [...list])
  void playList(LIST_IDS.TEMP, index)
}
