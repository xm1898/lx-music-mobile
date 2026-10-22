import { useCallback } from 'react'

import Btn from './Btn'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { useIsWyLiked, useWyAccount } from '@/store/wy/hook'
import { useTheme } from '@/store/theme/hook'
import { toggleLike } from '@/core/wy'
import { toast } from '@/utils/tools'

/**
 * 取网易云歌曲 id。
 * 非 wy 来源返回空字符串 —— 跨源红心需要先按歌名搜索匹配，
 * 匹配错了会往用户歌单里塞错误歌曲，不做。
 */
const getSongId = (musicInfo: LX.Player.MusicInfo | null) => {
  if (!musicInfo || !('source' in musicInfo) || musicInfo.source !== 'wy') return ''
  const meta = musicInfo.meta as { songId?: string | number } | undefined
  return String(meta?.songId ?? musicInfo.id.replace(/^wy_/, ''))
}

export default () => {
  const theme = useTheme()
  const account = useWyAccount()
  const musicInfo = usePlayerMusicInfo()
  const songId = getSongId(musicInfo)
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
      color={isLiked ? theme['c-primary-font'] : undefined}
      onPress={handlePress}
    />
  )
}
