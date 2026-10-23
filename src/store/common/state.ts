import { type NAV_ID_Type, type COMPONENT_IDS } from '@/config/constant'


export interface InitState {
  fontSize: number
  statusbarHeight: number
  componentIds: Partial<Record<COMPONENT_IDS, string>>
  navActiveId: NAV_ID_Type
  lastNavActiveId: NAV_ID_Type
  sourceNames: Record<LX.OnlineSource | 'all', string>
  bgPic: string | null
}

const initData = {}

const state: InitState = {
  fontSize: global.lx.fontSize,
  statusbarHeight: 0,
  componentIds: {},
  // 启动默认落在「我的音乐库」（网易云账号页），未登录时该页会提示去登录
  navActiveId: 'nav_wy_library',
  lastNavActiveId: 'nav_wy_library',
  sourceNames: initData as InitState['sourceNames'],
  bgPic: null,
}


export default state
