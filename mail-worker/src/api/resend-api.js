import resendService from '../service/resend-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		const raw = await c.req.text();
		if (!raw || raw.trim() === '') {
			return c.text('success', 200);
		}
		let body;
		try {
			body = JSON.parse(raw);
		} catch {
			return c.text('success', 200);
		}
		if (!body || !body.data || typeof body.data !== 'object') {
			return c.text('success', 200);
		}
		await resendService.webhooks(c, body);
		return c.text('success', 200)
	} catch (e) {
		return  c.text(e.message, 500)
	}
})
