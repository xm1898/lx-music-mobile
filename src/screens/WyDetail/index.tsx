import { useEffect, useRef } from 'react'

import MusicList, { type MusicListType } from './MusicList'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import PlayerBar from '@/components/player/PlayerBar'
import { type WyDetailInfo } from '@/store/wy/state'


export default ({ componentId, info }: { componentId: string, info: WyDetailInfo }) => {
  const musicListRef = useRef<MusicListType>(null)
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.wyDetail, componentId)

    isUnmountedRef.current = false

    musicListRef.current?.loadList(info)

    return () => {
      isUnmountedRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  return (
    <PageContent>
      <StatusBar />
      <MusicList ref={musicListRef} componentId={componentId} info={info} />
      <PlayerBar />
    </PageContent>
  )
}
