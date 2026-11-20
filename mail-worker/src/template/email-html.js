import { parseHTML } from 'linkedom';
import domainUtils from '../utils/domain-uitls';

export default function emailHtmlTemplate(html, domain, attCount = 0, token = '', spaUrl = '', backUrl = '') {

	const { document } = parseHTML(html);
	document.querySelectorAll('script').forEach(script => script.remove());
	// [S41] 官方 v3.6.0 XSS 加固：去掉内联事件与 javascript:/vbscript: 伪协议，
	// 避免 innerHTML 后再执行（我方模板参数保持原样，仅吸收这段清洗逻辑）。
	document.querySelectorAll('*').forEach(el => {
		for (const name of el.getAttributeNames()) {
			const lower = name.toLowerCase();
			if (lower.startsWith('on') || lower === 'srcdoc') {
				el.removeAttribute(name);
				continue;
			}
			if (!['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background'].includes(lower)) {
				continue;
			}
			const value = (el.getAttribute(name) || '').trim();
			if (/^(javascript|vbscript):/i.test(value)) {
				el.removeAttribute(name);
			}
		}
	});
	html = document.toString();
	html = html.replace(/{{domain}}/g, (domainUtils.toOssDomain(domain) || '') + '/');
	const safeHtmlJson = JSON.stringify(html).replace(/</g, '\\u003C');

	return `<!DOCTYPE html>
<html lang='en' >
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            background: #FFF;
        }

        .att-tip {
            padding: 8px 12px;
            margin: 10px 10px 0 10px;
            background: #F2F3F5;
            border-radius: 8px;
            font-size: 13px;
            color: #4E5969;
            line-height: 1.5;
        }

        .content-box {
            padding: 15px 10px 72px 10px;
            width: 100%;
            height: 100%;
            overflow: auto; /* 改为 auto 允许滚动 */
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .content-html {
            width: 100%;
            height: 100%;
        }

        .reply-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            gap: 8px;
            padding: 8px 10px;
            background: #FFF;
            border-top: 1px solid #E5E6EB;
        }

        .reply-bar textarea {
            flex: 1;
            resize: none;
            border: 1px solid #D0D3D9;
            border-radius: 6px;
            padding: 6px 8px;
            font-size: 14px;
            font-family: inherit;
            line-height: 1.4;
        }

        .reply-bar button {
            width: 56px;
            border: none;
            border-radius: 6px;
            background: #0E70DF;
            color: #FFF;
            font-size: 14px;
            cursor: pointer;
        }

        .reply-bar button:disabled {
            opacity: 0.6;
            cursor: default;
        }

        .reply-tip {
            position: fixed;
            bottom: 76px;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 13px;
            padding: 0 10px;
        }
    </style>
</head>
<body>
    ${backUrl ? `<a href="${backUrl}" style="display:block;padding:10px 12px;color:#0E70DF;text-decoration:none;font-size:14px;background:#FFF;border-bottom:1px solid #E5E6EB;">返回邮件列表</a>` : ''}
    ${attCount > 0 ? (spaUrl
        ? `<div class='att-tip'>📎 本邮件包含 ${attCount} 个附件，请点<a href="${spaUrl.replace(/&/g, '&amp;')}" target="_blank" rel="noopener noreferrer">网页版查看/下载</a></div>`
        : `<div class='att-tip'>📎 本邮件包含 ${attCount} 个附件，请在网页版查看/下载</div>`) : ''}
    <div class='content-box'>
        <div id='container' class='content-html'></div>
    </div>

    <div class='reply-bar'>
        <textarea id='reply-text' rows='2' placeholder='回复邮件…'></textarea>
        <button id='reply-send'>发送</button>
    </div>
    <div id='reply-tip' class='reply-tip'></div>

    <script>

        const replyToken = ${JSON.stringify(token)};

        function sendReply() {
            const textEl = document.getElementById('reply-text');
            const btn = document.getElementById('reply-send');
            const tip = document.getElementById('reply-tip');
            const content = (textEl.value || '').trim();
            if (!content) {
                tip.textContent = '请输入回复内容';
                tip.style.color = '#F53F3F';
                setTimeout(() => { tip.textContent = ''; }, 2500);
                return;
            }
            btn.disabled = true;
            btn.textContent = '发送中…';
            fetch('/api/telegram/replyEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: replyToken, content: content })
            })
            .then(r => r.json())
            .then(d => {
                if (d && d.success) {
                    tip.textContent = '✅ 回复已发送';
                    tip.style.color = '#00B42A';
                    textEl.value = '';
                } else {
                    tip.textContent = '❌ ' + ((d && d.message) || '发送失败');
                    tip.style.color = '#F53F3F';
                }
            })
            .catch(() => {
                tip.textContent = '❌ 网络错误，请重试';
                tip.style.color = '#F53F3F';
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = '发送';
                setTimeout(() => { tip.textContent = ''; }, 2500);
            });
        }

        document.getElementById('reply-send').addEventListener('click', sendReply);
        document.getElementById('reply-text').addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                sendReply();
            }
        });

        function renderHTML(html) {
            const container = document.getElementById('container');
            const shadowRoot = container.attachShadow({ mode: 'open' });

            // 提取 <body> 的 style 属性
            const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
            const bodyStyleMatch = html.match(bodyStyleRegex);
            const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : '';

            // 移除 <body> 标签
            const cleanedHtml = html.replace(/<\\/?body[^>]*>/gi, '');

            // 渲染内容
            shadowRoot.innerHTML = \`
                <style>
                    :host {
                        all: initial;
                        width: 100%;
                        height: 100%;
                        font-family: Inter, -apple-system, BlinkMacSystemFont,
                                    'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #13181D;
                        word-break: break-word;
                        overflow: auto; /* 添加滚动 */
                    }

                    h1, h2, h3, h4 {
                        font-size: 18px;
                        font-weight: 700;
                    }

                    p {
                        margin: 0;
                    }

                    a {
                        text-decoration: none;
                        color: #0E70DF;
                    }

                    .shadow-content {
                        background: #FFFFFF;
                        width: fit-content;
                        height: fit-content;
                        min-width: 100%;
                        \${bodyStyle ? bodyStyle : ''} /* 注入 body 的 style */
                    }

                    img:not(table img) {
                        max-width: 100% !important;
                        height: auto !important;
                    }
                </style>
                <div class="shadow-content">
                    \${cleanedHtml}
                </div>
            \`;

            // 自动缩放
            autoScale(shadowRoot, container);
        }

        function autoScale(shadowRoot, container) {

            if (!shadowRoot || !container) return;

            const parent = container;
            const shadowContent = shadowRoot.querySelector('.shadow-content');

            if (!shadowContent) return;

            const parentWidth = parent.offsetWidth;
            const childWidth = shadowContent.scrollWidth;

            if (childWidth === 0) return;

            const scale = parentWidth / childWidth;

            const hostElement = shadowRoot.host;
            hostElement.style.zoom = scale;
        }

        // 使用示例
        const exampleHtml = ${safeHtmlJson};

        // 渲染HTML
        renderHTML(exampleHtml);
    </script>
</body>
</html>`
}
