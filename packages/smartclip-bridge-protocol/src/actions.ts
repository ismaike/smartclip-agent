export const BRIDGE_PROTOCOL_VERSION = '1'

export enum BridgeAction {
  LIST_TABS = 'list-tabs',
  EXTRACT_PAGE = 'extract-page',
  CONVERT_TO_MARKDOWN = 'convert-to-markdown',
  SAVE_CLIP = 'save-clip',
  GET_TASKS = 'get-tasks',
  CLIP_PAGE = 'clip-page',
  GET_DAILY_TASKS = 'get-daily-tasks',
  CLIP_DAILY_TASK = 'clip-daily-task',
  CLIP_ALL_DAILY_TASKS = 'clip-all-daily-tasks',
  GET_VOCABULARY = 'get-vocabulary',
  GET_STATUS = 'get-status',
}
