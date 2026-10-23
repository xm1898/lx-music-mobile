import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View, RefreshControl } from 'react-native'

import StatusBar from '@/components/common/StatusBar'
import PageContent from '@/components/PageContent'
import PlayerBar from '@/components/player/PlayerBar'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { navigations, pop } from '@/navigation'
import commonState from '@/store/common/state'
import { useStatusbarHeight } from '@/store/common/hook'
import { useWindowSize } from '@/utils/hooks'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
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
import { HEADER_HEIGHT as _HEADER_HEIGHT, LIST_IDS } from '@/config/constant'

const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)
const GRID_GAP = scaleSizeW(10)

export default ({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const t = useI18n()
  const account = useWyAccount()
  const statusBarHeight = useStatusbarHeight()
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

  const handleBack = useCallback(() => {
    void pop(commonState.componentIds.wyLibrary!)
  }, [])

  const openPlaylist = useCallback((item: WyPlaylistItem) => {
    navigations.pushWyDetailScreen(componentId, { type: 'playlist', id: item.id, name: item.name, picUrl: item.picUrl })
  }, [componentId])

  const openArtist = useCallback((item: WyArtistItem) => {
    navigations.pushWyDetailScreen(componentId, { type: 'artist', id: item.id, name: item.name, picUrl: item.picUrl })
  }, [componentId])

  const openAlbum = useCallback((item: WyAlbumItem) => {
    navigations.pushWyDetailScreen(componentId, { type: 'album', id: item.id, name: item.name, picUrl: item.picUrl })
  }, [componentId])

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
  }, [account, loading, myPlaylists, recPlaylists, artists, albums, theme, t, handleHeartMode, renderPlaylistGrid, renderAlbumGrid, openArtist])

  return (
    <PageContent>
      <StatusBar />
      <View style={{ ...styles.header, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
        <StatusBar />
        <View style={styles.navBar}>
          <TouchableOpacity onPress={handleBack} style={{ ...styles.button, width: HEADER_HEIGHT }}>
            <Icon name="chevron-left" size={18} color={theme['c-font']} />
          </TouchableOpacity>
          <Text size={16} style={styles.headerTitle}>{t('wy_lib_title')}</Text>
          <TouchableOpacity onPress={() => { navigations.pushWyHistoryScreen(componentId) }} style={{ ...styles.button, width: HEADER_HEIGHT }}>
            <Icon name="leaderboard" size={17} color={theme['c-font']} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme['c-primary']]} progressBackgroundColor={theme['c-primary-background']} />}
      >
        <View style={styles.body}>
          {content}
          <View style={{ height: 60 }} />
        </View>
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
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
