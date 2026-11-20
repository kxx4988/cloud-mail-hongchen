import { publicFileHeaders } from '../utils/att-headers';

const kvObjService = {

	async putObj(c, key, content, metadata) {
		await c.env.kv.put(key, content, { metadata: metadata });
	},

	async deleteObj(c, keys) {

		if (typeof keys === 'string') {
			keys = [keys];
		}

		if (keys.length === 0) {
			return;
		}

		await Promise.all(keys.map( key => c.env.kv.delete(key)));
	},

	async getObj(c, key) {
		const obj = await c.env.kv.getWithMetadata(key, { type: "arrayBuffer"});
		if (!obj.value) {
			return null;
		}

		return new Response(obj.value, {
			headers: publicFileHeaders({
				contentType: obj.metadata?.contentType,
				contentDisposition: obj.metadata?.contentDisposition
			})
		});
	},

	async toObjResp(c, key) {
		const obj = await this.getObj(c, key);
		if (!obj) {
			// KV 中无此 key 时，原实现返回 null，会导致 Cloudflare 报
			// "Incorrect type for Promise"（fetch handler 必须返回 Response）。
			// 改为返回标准 404，避免 Worker 崩溃，也使缺失的 /static、/attachments 资源得到干净响应。
			return new Response('Not Found', {
				status: 404,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			});
		}
		return obj;
	}

};

export default kvObjService;
