import { useEffect, useState } from 'react'
import state from './state'

export const useWyAccount = () => {
  const [account, setAccount] = useState(() => state.account)
  useEffect(() => {
    const handleUpdate = () => { setAccount(state.account) }
    global.state_event.on('wyAccountChanged', handleUpdate)
    handleUpdate()
    return () => { global.state_event.off('wyAccountChanged', handleUpdate) }
  }, [])
  return account
}

export const useIsWyLiked = (songId: string | number) => {
  const strId = String(songId)
  const [isLiked, setIsLiked] = useState(() => state.likedSongIds.has(strId))
  useEffect(() => {
    const handleUpdate = () => {
      const newStatus = state.likedSongIds.has(strId)
      setIsLiked(current => current === newStatus ? current : newStatus)
    }
    global.state_event.on('wyLikedListChanged', handleUpdate)
    handleUpdate()
    return () => { global.state_event.off('wyLikedListChanged', handleUpdate) }
  }, [strId])
  return isLiked
}

export const useWyLikedListInited = () => {
  const [inited, setInited] = useState(() => state.likedListInited)
  useEffect(() => {
    const handleUpdate = () => { setInited(state.likedListInited) }
    global.state_event.on('wyLikedListChanged', handleUpdate)
    handleUpdate()
    return () => { global.state_event.off('wyLikedListChanged', handleUpdate) }
  }, [])
  return inited
}
