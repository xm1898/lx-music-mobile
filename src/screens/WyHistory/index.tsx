import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View, RefreshControl } from 'react-native'

import StatusBar from '@/components/common/StatusBar'
import PageContent from '@/components/PageContent'
import PlayerBar from '@/components/player/PlayerBar'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, confirmDialog, toast } from '@/utils/tools'
import { pop } from '@/navigation'
import commonState from '@/store/common/state'
import { useStatusbarHeight } from '@/store/common/hook'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { scaleSizeH } from '@/utils/pixelRatio'
import { clearWyPlayHistory, getWyPlayHistory, getWyPlayStats, type WyPlayHistoryItem, type WyPlayStats } from '@/core/wyHistory'
import { handlePlay } from '@/components/OnlineList/listAction'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

const formatMinutes = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.round(seconds / 60)}m`
}

const formatLastPlay = (time: number) => {
  const d = new Date(time)
  const now = new Date()
  const sameDay = d.toDateString() == now.toDateString()
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default ({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()
  const isUnmountedRef = useRef(false)

  const [stats, setStats] = useState<WyPlayStats | null>(null)
  const [list, setList] = useState<WyPlayHistoryItem[]>([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const load = useCallback(async() => {
    const [nextStats, nextList] = await Promise.all([getWyPlayStats(), getWyPlayHistory()])
    if (isUnmountedRef.current) return
    setStats(nextStats)
    setList(nextList)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void load().finally(() => {
      if (!isUnmountedRef.current) setRefreshing(false)
    })
  }, [load])

  const handleBack = useCallback(() => {
    void pop(commonState.componentIds.wyHistory!)
  }, [])

  const handleClear = useCallback(async() => {
    const confirm = await confirmDialog({
      message: t('wy_history_clear_confirm'),
      cancelButtonText: t('cancel_button_text_2'),
      confirmButtonText: t('confirm_button_text'),
      bgClose: false,
    })
    if (!confirm) return
    await clearWyPlayHistory()
    if (isUnmountedRef.current) return
    setList([])
    setStats({ week: { count: 0, duration: 0 }, month: { count: 0, duration: 0 }, total: { count: 0, duration: 0 }, songs: 0 })
    toast(t('wy_history_cleared'))
  }, [t])

  // 历史记录只存了展示字段，播放时按 wy 源重建最小可用的歌曲信息
  const handlePlayItem = useCallback((item: WyPlayHistoryItem) => {
    if (!item.id) return
    handlePlay({
      id: `wy_${item.id}`,
      name: item.name,
      singer: item.singer,
      source: 'wy',
      interval: item.interval || null,
      meta: {
        songId: item.id,
        albumName: item.album,
        picUrl: item.img || null,
        qualitys: item.qualitys ?? [],
        _qualitys: item._qualitys ?? {},
      },
    })
  }, [])

  const renderItem = useCallback(({ item }: { item: WyPlayHistoryItem }) => (
    <TouchableOpacity style={styles.item} onPress={() => { handlePlayItem(item) }} activeOpacity={0.7}>
      <View style={styles.itemInfo}>
        <Text numberOfLines={1} size={14}>{item.name}</Text>
        <Text numberOfLines={1} size={11} color={theme['c-500']}>
          {item.singer}{item.album ? ` · ${item.album}` : ''}
        </Text>
      </View>
      <View style={styles.itemMeta}>
        <Text size={11} color={theme['c-500']}>{formatLastPlay(item.lastPlayTime)}</Text>
        <Text size={11} color={theme['c-500']}>
          {t('wy_history_play_count', { count: String(item.count) })} · {formatMinutes(item.duration)}
        </Text>
      </View>
    </TouchableOpacity>
  ), [handlePlayItem, t, theme])

  return (
    <PageContent>
      <StatusBar />
      <View style={{ ...styles.header, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
        <StatusBar />
        <View style={styles.navBar}>
          <TouchableOpacity onPress={handleBack} style={{ ...styles.button, width: HEADER_HEIGHT }}>
            <Icon name="chevron-left" size={18} color={theme['c-font']} />
          </TouchableOpacity>
          <Text size={16} style={styles.headerTitle}>{t('wy_history_title')}</Text>
          <TouchableOpacity onPress={handleClear} style={{ ...styles.button, width: HEADER_HEIGHT }}>
            <Icon name="eraser" size={16} color={theme['c-font']} />
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        style={styles.list}
        data={list}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={stats ? (
          <View style={{ ...styles.statsCard, backgroundColor: theme['c-primary-background-hover'] }}>
            <View style={styles.statItem}>
              <Text size={18} color={theme['c-primary-font']}>{stats.week.count}</Text>
              <Text size={11} color={theme['c-500']}>{t('wy_stats_week_plays')}</Text>
              <Text size={11} color={theme['c-500']}>{formatMinutes(stats.week.duration)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text size={18} color={theme['c-primary-font']}>{stats.month.count}</Text>
              <Text size={11} color={theme['c-500']}>{t('wy_stats_month_plays')}</Text>
              <Text size={11} color={theme['c-500']}>{formatMinutes(stats.month.duration)}</Text>
            </View>
            <View style={styles.statItem}>
              <Text size={18} color={theme['c-primary-font']}>{stats.songs}</Text>
              <Text size={11} color={theme['c-500']}>{t('wy_stats_total_songs')}</Text>
              <Text size={11} color={theme['c-500']}>{formatMinutes(stats.total.duration)}</Text>
            </View>
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text color={theme['c-500']}>{t('wy_history_empty')}</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme['c-primary']]} progressBackgroundColor={theme['c-primary-background']} />}
      />
      <PlayerBar />
    </PageContent>
  )
}

const styles = createStyle({
  header: {
    borderBottomWidth: 0.5,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_HEIGHT,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  statsCard: {
    flexDirection: 'row',
    margin: 10,
    borderRadius: 8,
    paddingVertical: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  itemInfo: {
    flexGrow: 1,
    flexShrink: 1,
  },
  itemMeta: {
    alignItems: 'flex-end',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
})
