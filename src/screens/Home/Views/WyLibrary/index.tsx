import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View, RefreshControl } from 'react-native'

import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { setNavActiveId } from '@/core/common'
import { useWyAccount } from '@/store/wy/hook'
import {
  getCollectedAlbums,
  getFollowedArtists,
  getHeartModeList,
  getMyPlaylists,
  getRecPlaylists,
  type WyAlbumItem,
  type WyArtistItem,
  type WyPlaylistItem,
} from '@/core/wy'
import { setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS } from '@/config/constant'
import { scaleSizeW } from '@/utils/pixelRatio'
import { useWindowSize } from '@/utils/hooks'

const GRID_GAP = scaleSizeW(10)

/**
 * Home 的一个页面（和歌单/排行榜平级），从侧边栏进入。
 * 注意：头部（汉堡+标题）、PlayerBar 由 Home 统一提供，这里只渲染内容。
 */
export default () => {
  const theme = useTheme()
  const t = useI18n()
  const account = useWyAccount()
  const windowSize = useWindowSize()
  const isUnmountedRef = useRef(false)

  const [myPlaylists, setMyPlaylists] = useState<WyPlaylistItem[]>([])
  const [recPlaylists, setRecPlaylists] = useState<WyPlaylistItem[]>([])
  const [artists, setArtists] = useState<WyArtistItem[]>([])
  const [albums, setAlbums] = useState<WyAlbumItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [heartModeLoading, setHeartModeLoading] = useState(false)

  // 两列网格，减去左右 padding 和中间间距
  const itemWidth = (windowSize.width - GRID_GAP * 3) / 2

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const load = useCallback(async(force: boolean) => {
    if (!account) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    try {
      // 四个接口并发，单个失败不拖垮整页
      const [mine, rec, arts, albs] = await Promise.all([
        getMyPlaylists(force).catch(() => [] as WyPlaylistItem[]),
        getRecPlaylists(force).catch(() => [] as WyPlaylistItem[]),
        getFollowedArtists(force).catch(() => [] as WyArtistItem[]),
        getCollectedAlbums(force).catch(() => [] as WyAlbumItem[]),
      ])
      if (isUnmountedRef.current) return
      setMyPlaylists(mine)
      setRecPlaylists(rec)
      setArtists(arts)
      setAlbums(albs)
    } finally {
      // finally 里不能 return（会吞掉 try 的返回值），只做状态收尾
      if (!isUnmountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [account])

  useEffect(() => {
    void load(false)
  }, [load])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void load(true)
  }, [load])

  const handleOpenStats = useCallback(() => {
    const homeId = commonState.componentIds.home
    if (homeId) navigations.pushWyHistoryScreen(homeId)
  }, [])

  const handleLogin = useCallback(() => {
    // 未登录时一键去设置页登录（音乐库是启动落地页，必须给出路）
    setNavActiveId('nav_setting')
  }, [])

  const openPlaylist = useCallback((item: WyPlaylistItem) => {
    navigations.pushWyDetailScreen(commonState.componentIds.home!, { type: 'playlist', id: item.id, name: item.name, picUrl: item.picUrl })
  }, [])

  const openArtist = useCallback((item: WyArtistItem) => {
    navigations.pushWyDetailScreen(commonState.componentIds.home!, { type: 'artist', id: item.id, name: item.name, picUrl: item.picUrl })
  }, [])

  const openAlbum = useCallback((item: WyAlbumItem) => {
    navigations.pushWyDetailScreen(commonState.componentIds.home!, { type: 'album', id: item.id, name: item.name, picUrl: item.picUrl })
  }, [])

  const handleHeartMode = useCallback(async() => {
    if (heartModeLoading) return
    setHeartModeLoading(true)
    try {
      // 私人 FM 官方接口风控最狠，用「我喜欢的歌 → 相似歌曲」拼无限流
      const list = await getHeartModeList(undefined, 40)
      await setTempList('wy_heart_mode', list)
      void playList(LIST_IDS.TEMP, 0)
      toast(t('wy_heart_mode_started'))
    } catch (err: any) {
      toast(err?.message == 'empty' ? t('wy_heart_mode_empty') : t('wy_heart_mode_failed'))
    } finally {
      if (!isUnmountedRef.current) setHeartModeLoading(false)
    }
  }, [heartModeLoading, t])

  const renderPlaylistGrid = useCallback((list: WyPlaylistItem[]) => {
    const rows: WyPlaylistItem[][] = []
    for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2))
    return rows.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.gridRow}>
        {row.map(item => (
          <TouchableOpacity key={item.id} style={{ width: itemWidth }} onPress={() => { openPlaylist(item) }} activeOpacity={0.7}>
            <Image url={item.picUrl} style={{ width: itemWidth, height: itemWidth, borderRadius: 4 }} />
            <Text numberOfLines={1} size={13} style={styles.gridName}>{item.name}</Text>
            <Text numberOfLines={1} size={10} color={theme['c-500']}>
              {item.trackCount ? `${item.trackCount}${t('wy_lib_tracks_unit')}` : ''}
              {item.creator ? `${item.trackCount ? ' · ' : ''}${item.creator}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
        {row.length == 1 ? <View style={{ width: itemWidth }} /> : null}
      </View>
    ))
  }, [itemWidth, openPlaylist, t, theme])

  const renderAlbumGrid = useCallback((list: WyAlbumItem[]) => {
    const rows: WyAlbumItem[][] = []
    for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2))
    return rows.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.gridRow}>
        {row.map(item => (
          <TouchableOpacity key={item.id} style={{ width: itemWidth }} onPress={() => { openAlbum(item) }} activeOpacity={0.7}>
            <Image url={item.picUrl} style={{ width: itemWidth, height: itemWidth, borderRadius: 4 }} />
            <Text numberOfLines={1} size={13} style={styles.gridName}>{item.name}</Text>
            <Text numberOfLines={1} size={10} color={theme['c-500']}>{item.singer}</Text>
          </TouchableOpacity>
        ))}
        {row.length == 1 ? <View style={{ width: itemWidth }} /> : null}
      </View>
    ))
  }, [itemWidth, openAlbum, theme])

  const content = useMemo(() => {
    if (!account) {
      return (
        <View style={styles.empty}>
          <Icon name="logo" size={40} color={theme['c-350']} />
          <Text color={theme['c-500']} style={styles.emptyText}>{t('setting_wy_need_login')}</Text>
          <Text size={11} color={theme['c-500']} style={styles.emptyText}>{t('setting_wy_login_tip')}</Text>
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} activeOpacity={0.8}>
            <Text size={13} color={theme['c-primary-font']}>{t('setting_wy_login')}</Text>
          </TouchableOpacity>
        </View>
      )
    }
    if (loading) {
      return (
        <View style={styles.empty}>
          <Text color={theme['c-500']}>{t('wy_lib_loading')}</Text>
        </View>
      )
    }
    return (
      <>
        <TouchableOpacity style={{ ...styles.heartBanner, backgroundColor: theme['c-primary-background-hover'] }} onPress={handleHeartMode} activeOpacity={0.8}>
          <Icon name="love" size={22} color={theme['c-primary-font']} />
          <View style={styles.heartText}>
            <Text size={15} color={theme['c-primary-font']}>{t('wy_heart_mode')}</Text>
            <Text size={11} color={theme['c-500']}>{t('wy_heart_mode_tip')}</Text>
          </View>
          <Icon name="chevron-right" size={18} color={theme['c-primary-font']} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.statsRow} onPress={handleOpenStats} activeOpacity={0.7}>
          <Icon name="leaderboard" size={17} color={theme['c-font']} />
          <Text size={13} style={styles.statsText}>{t('wy_history_title')}</Text>
          <Icon name="chevron-right" size={16} color={theme['c-500']} />
        </TouchableOpacity>

        {myPlaylists.length ? (
          <>
            <Text size={14} style={styles.sectionTitle}>{t('wy_lib_my_playlists')}</Text>
            {renderPlaylistGrid(myPlaylists)}
          </>
        ) : null}

        {recPlaylists.length ? (
          <>
            <Text size={14} style={styles.sectionTitle}>{t('wy_lib_rec_playlists')}</Text>
            {renderPlaylistGrid(recPlaylists)}
          </>
        ) : null}

        {artists.length ? (
          <>
            <Text size={14} style={styles.sectionTitle}>{t('wy_lib_followed_artists')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {artists.map(item => (
                <TouchableOpacity key={item.id} style={styles.artistItem} onPress={() => { openArtist(item) }} activeOpacity={0.7}>
                  <Image url={item.picUrl} style={styles.artistPic} />
                  <Text numberOfLines={1} size={12} style={styles.artistName}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        {albums.length ? (
          <>
            <Text size={14} style={styles.sectionTitle}>{t('wy_lib_collected_albums')}</Text>
            {renderAlbumGrid(albums)}
          </>
        ) : null}
      </>
    )
  }, [account, loading, myPlaylists, recPlaylists, artists, albums, theme, t, handleHeartMode, handleLogin, handleOpenStats, renderPlaylistGrid, renderAlbumGrid, openArtist])

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme['c-primary']]} progressBackgroundColor={theme['c-primary-background']} />}
    >
      <View style={styles.body}>
        {content}
        <View style={{ height: 60 }} />
      </View>
    </ScrollView>
  )
}

const styles = createStyle({
  body: {
    padding: GRID_GAP,
  },
  heartBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  heartText: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  statsText: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 10,
  },
  loginBtn: {
    marginTop: 16,
    paddingLeft: 18,
    paddingRight: 18,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: 'rgba(127, 127, 127, 0.15)',
  },
  sectionTitle: {
    paddingTop: 14,
    paddingBottom: 8,
    fontWeight: 'bold',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  gridName: {
    paddingTop: 4,
  },
  hScroll: {
    // marginHorizontal: -GRID_GAP,
  },
  artistItem: {
    width: scaleSizeW(72),
    alignItems: 'center',
    paddingRight: GRID_GAP,
  },
  artistPic: {
    width: scaleSizeW(64),
    height: scaleSizeW(64),
    borderRadius: scaleSizeW(32),
  },
  artistName: {
    paddingTop: 4,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    paddingTop: 12,
    textAlign: 'center',
  },
})
