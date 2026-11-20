import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

export function formatDetailDate(time) {
	return dayjs.utc(time).format('YYYY-MM-DD HH:mm:ss')
}

export function toUtc(time) {
	return dayjs.utc(time || dayjs())
}

// [S48] 时间口径统一：库内一律 UTC 裸串（'YYYY-MM-DD HH:mm:ss'），
// 对外展示（网页 / TG 文本）一律按站点时区转换。Workers 运行时本身就是 UTC，
// 所以 dayjs().format(...) 天然就是 UTC，不要再用「+8 小时」的写法把时区写进数据。
export const SITE_TZ = 'Asia/Shanghai'

// 当前 UTC 时间（用于落库）
export function nowUtcStr() {
	return dayjs.utc().format('YYYY-MM-DD HH:mm:ss')
}

// 当前站点时区时间（仅用于展示，例如 TG 公告署名）
export function localTimeStr(tz = SITE_TZ) {
	return dayjs.utc().tz(tz).format('YYYY-MM-DD HH:mm:ss')
}

// 站点时区的「今天」日期串（用于按天分桶的计数 / KV key）
export function localDayStr(tz = SITE_TZ) {
	return dayjs.utc().tz(tz).format('YYYY-MM-DD')
}
