import http from "@/axios/index.js";

// 支持单条（number）与批量（array）：批量统一转成逗号串，避免数组被塞进 query / JSON 后绑定异常
function toIdParam(emailId) {
    return Array.isArray(emailId) ? emailId.join(',') : emailId
}

export function starAdd(emailId) {
    return http.post('/star/add', {emailId: toIdParam(emailId)})
}

export function starCancel(emailId) {
    return http.delete('/star/cancel', {params: {emailId: toIdParam(emailId)}})
}

export function starList(emailId,size,full) {
    return http.get('/star/list', {params: {emailId,size,full}})
}