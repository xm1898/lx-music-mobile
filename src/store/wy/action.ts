import state, { type WyAccountInfo } from './state'

export const setAccount = (account: WyAccountInfo | null) => {
  state.account = account
  global.state_event.wyAccountChanged()
}

export const setLikedSongIds = (ids: Array<string | number>) => {
  state.likedSongIds = new Set(ids.map(String))
  state.likedListInited = true
  global.state_event.wyLikedListChanged()
}

export const addLikedSong = (id: string | number) => {
  const strId = String(id)
  if (state.likedSongIds.has(strId)) return
  state.likedSongIds.add(strId)
  global.state_event.wyLikedListChanged()
}

export const removeLikedSong = (id: string | number) => {
  const strId = String(id)
  if (!state.likedSongIds.has(strId)) return
  state.likedSongIds.delete(strId)
  global.state_event.wyLikedListChanged()
}

export const resetLikedList = () => {
  state.likedSongIds = new Set()
  state.likedListInited = false
  global.state_event.wyLikedListChanged()
}
