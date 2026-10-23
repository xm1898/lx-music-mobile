import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import songListApi from '@/utils/musicSdk/wy/songList'
import { getAlbumSongs, getArtistSongs } from '@/core/wy'
import { toNewMusicInfo } from '@/utils'
import Header from './Header'
import { handlePlay } from './listAction'
import { type WyDetailInfo } from '@/store/wy/state'

export interface MusicListProps {
  componentId: string
  info: WyDetailInfo
}

export interface MusicListType {
  loadList: (info: WyDetailInfo) => void
}

interface LoadResult {
  list: LX.Music.MusicInfoOnline[]
  /** 接口返回的副标题（歌单作者/简介、专辑信息等），比外面传的 desc 更全 */
  desc?: string
}

const loadSongs = async(info: WyDetailInfo): Promise<LoadResult> => {
  switch (info.type) {
    case 'artist':
      return { list: await getArtistSongs(info.id) }
    case 'album':
      return { list: await getAlbumSongs(info.id) }
    case 'playlist':
    default: {
      // 用户歌单走上游歌单接口（已打 cookie 补丁），自动处理分页与批量详情
      const result = await songListApi.getListDetail(String(info.id), 1)
      const author = result.info?.author ? `${result.info.author}` : ''
      const count = result.total ? `${result.total}` : ''
      const desc = [author, count && `${count}首`].filter(Boolean).join(' · ')
      return {
        list: result.list.map(toNewMusicInfo) as LX.Music.MusicInfoOnline[],
        desc,
      }
    }
  }
}

export default forwardRef<MusicListType, MusicListProps>(({ info }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const isUnmountedRef = useRef(false)
  const loadedListRef = useRef<LX.Music.MusicInfoOnline[]>([])
  const infoRef = useRef(info)
  infoRef.current = info
  // 接口返回的副标题（歌单作者/曲目数）比入参更全，拉到后覆盖
  const [desc, setDesc] = useState(info.desc ?? '')

  useImperativeHandle(ref, () => ({
    async loadList(detailInfo) {
      listRef.current?.setStatus('loading')
      loadedListRef.current = []
      try {
        const result = await loadSongs(detailInfo)
        if (isUnmountedRef.current) return
        loadedListRef.current = result.list
        if (result.desc) setDesc(result.desc)
        listRef.current?.setList(result.list)
        listRef.current?.setStatus('end')
      } catch (err) {
        if (isUnmountedRef.current) return
        console.warn('WyDetail load failed', err)
        listRef.current?.setStatus('error')
      }
    },
  }))

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const listId = `wy_${info.type}_${info.id}`

  const handlePlayList: OnlineListProps['onPlayList'] = (index) => {
    if (!loadedListRef.current.length) return
    void handlePlay(listId, loadedListRef.current, index)
  }

  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    void loadSongs(infoRef.current).then(result => {
      if (isUnmountedRef.current) return
      loadedListRef.current = result.list
      listRef.current?.setList(result.list)
      listRef.current?.setStatus('end')
    }).catch(() => {
      if (isUnmountedRef.current) return
      listRef.current?.setStatus('error')
    })
  }

  const header = useMemo(() => (
    <Header
      name={info.name}
      desc={desc}
      picUrl={info.picUrl}
      onPlay={() => { handlePlayList(0) }}
    />
  ), [info.name, info.picUrl, desc])

  return <OnlineList
    ref={listRef}
    onPlayList={handlePlayList}
    onRefresh={handleRefresh}
    onLoadMore={() => {}}
    ListHeaderComponent={header}
  />
})
