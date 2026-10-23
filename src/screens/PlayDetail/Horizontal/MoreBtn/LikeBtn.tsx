import { useCallback } from 'react'

import Btn from './Btn'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useIsWyLiked, useWyAccount } from '@/store/wy/hook'
import { toggleLike } from '@/core/wy'
import { toast } from '@/utils/tools'

const getSongId = (musicInfo: LX.Player.PlayMusic | null) => {
  if (!musicInfo) return ''
  // PlayMusic 是 MusicInfo | Download.ListItem 联合类型，in narrowing 拿不到 meta，直接按 source 字段判定
  const source = (musicInfo as { source?: string }).source
  if (source !== 'wy') return ''
  const info = musicInfo as unknown as LX.Music.MusicInfoOnline
  const meta = info.meta as { songId?: string | number } | undefined
  return String(meta?.songId ?? info.id.replace(/^wy_/, ''))
}

/**
 * 红心固定用经典红，不跟随主题色（默认主题是绿色，点了看不出来）。
 * love glyph 在 1024 em 里高 1043、宽 1164（还溢出），比邻居图标大一圈，
 * 渲染时缩到 18（22 × 860/1043）与旁边按钮视觉齐平。
 */
const LIKE_COLOR = '#ff4d4d'
const LIKE_BG_COLOR = 'rgba(255, 77, 77, 0.16)'
const LIKE_ICON_SIZE = 18

export default () => {
  const account = useWyAccount()
  // usePlayMusicInfo 返回 { listId, musicInfo, isTempPlay }，歌曲信息在 .musicInfo 上
  const songId = getSongId(usePlayMusicInfo().musicInfo)
  const isLiked = useIsWyLiked(songId || '__none__')

  const handlePress = useCallback(() => {
    if (!account) {
      toast(global.i18n.t('setting_wy_need_login'))
      return
    }
    if (!songId) {
      toast(global.i18n.t('setting_wy_only_wy'))
      return
    }
    void toggleLike(songId, !isLiked).catch(() => {})
  }, [account, songId, isLiked])

  return (
    <Btn
      icon="love"
      color={isLiked ? LIKE_COLOR : undefined}
      bgColor={isLiked ? LIKE_BG_COLOR : undefined}
      iconSize={LIKE_ICON_SIZE}
      onPress={handlePress}
    />
  )
}
