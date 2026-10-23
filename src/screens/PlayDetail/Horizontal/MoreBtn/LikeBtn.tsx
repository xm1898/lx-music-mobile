import { useCallback } from 'react'

import Btn from './Btn'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { useIsWyLiked, useWyAccount } from '@/store/wy/hook'
import { useTheme } from '@/store/theme/hook'
import { toggleLike } from '@/core/wy'
import { toast } from '@/utils/tools'

const getSongId = (musicInfo: LX.Player.MusicInfo | null) => {
  if (!musicInfo) return ''
  // Player.MusicInfo 是联合类型，用 in  narrowing 拿不到 meta，直接按 source 字段判定
  const source = (musicInfo as { source?: string }).source
  if (source !== 'wy') return ''
  const info = musicInfo as unknown as LX.Music.MusicInfoOnline
  const meta = info.meta as { songId?: string | number } | undefined
  return String(meta?.songId ?? info.id.replace(/^wy_/, ''))
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
