export interface WyAccountInfo {
  uid: string
  nickname: string
  avatarUrl: string
  vipType: number
}

/** 网易云详情屏（歌单 / 歌手 / 专辑）的入参 */
export interface WyDetailInfo {
  type: 'playlist' | 'artist' | 'album'
  id: string
  name: string
  picUrl?: string
  desc?: string
}

export interface InitState {
  account: WyAccountInfo | null
  likedSongIds: Set<string>
  /** 喜欢列表是否已同步过 */
  likedListInited: boolean
}

const state: InitState = {
  account: null,
  likedSongIds: new Set(),
  likedListInited: false,
}

export default state
