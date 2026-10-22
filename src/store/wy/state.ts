export interface WyAccountInfo {
  uid: string
  nickname: string
  avatarUrl: string
  vipType: number
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
