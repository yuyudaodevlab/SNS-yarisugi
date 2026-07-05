// 京都はんなり見張り番 - ページ内ポップアップ
// バックグラウンドからの指示で、京都モチーフのお小言モーダルを表示する。
// Shadow DOM を使い、表示先サイトのCSSと干渉しないようにしている。

(() => {
  let host = null;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "showOverlay") {
      try {
        showOverlay(msg);
        sendResponse({ shown: true });
      } catch (e) {
        sendResponse({ shown: false });
      }
    }
    return false;
  });

  function removeOverlay() {
    if (host) {
      host.remove();
      host = null;
    }
  }

  function showOverlay({ siteName, siteEmoji, phrase, sessionMinutes, totalToday, level }) {
    removeOverlay();

    host = document.createElement("div");
    host.id = "kyoto-mihariban-host";
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    const levelLabel = ["", "はんなり", "じわじわ", "ぶぶ漬け"][level] || "はんなり";

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { margin: 0; padding: 0; box-sizing: border-box; }

        .backdrop {
          position: fixed; inset: 0;
          background: rgba(24, 16, 38, 0.72);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .card {
          width: min(480px, calc(100vw - 32px));
          background: linear-gradient(160deg, #faf6ef 0%, #f3ecdf 100%);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.45);
          animation: slideUp 0.45s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* 麻の葉文様の帯 + 夕暮れの京紫グラデーション */
        .header {
          position: relative;
          padding: 22px 26px 18px;
          background:
            url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g stroke="rgba(255,255,255,0.10)" stroke-width="1" fill="none"><path d="M24 0 L24 48 M0 24 L48 24 M0 0 L48 48 M48 0 L0 48"/><path d="M24 0 L0 24 L24 48 L48 24 Z"/></g></svg>'),
            linear-gradient(120deg, #4a2a6a 0%, #5b2c6f 45%, #8e3b62 100%);
          color: #f6efe4;
        }
        .header .badge {
          display: inline-block;
          font-size: 11px;
          letter-spacing: 0.2em;
          border: 1px solid rgba(246,239,228,0.5);
          border-radius: 999px;
          padding: 3px 12px;
          margin-bottom: 10px;
        }
        .header h1 {
          font-size: 19px;
          font-weight: 600;
          letter-spacing: 0.06em;
        }
        .header .moon {
          position: absolute; top: 14px; right: 20px;
          width: 44px; height: 44px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #f3d99a, #d9a83c);
          box-shadow: 0 0 24px rgba(230,190,100,0.55);
        }

        .body { padding: 26px; }
        .phrase {
          font-size: 17px;
          line-height: 2;
          color: #3a2c46;
          padding: 4px 6px 18px;
          border-bottom: 1px solid rgba(91,44,111,0.18);
        }
        .phrase::before { content: "「"; color: #a0763f; }
        .phrase::after  { content: "」"; color: #a0763f; }

        .meta {
          display: flex; gap: 18px;
          padding: 14px 6px 0;
          font-size: 12.5px; color: #7a6a58;
          letter-spacing: 0.04em;
        }
        .meta b { color: #5b2c6f; font-size: 15px; }

        .actions {
          display: flex; flex-direction: column; gap: 10px;
          padding: 8px 26px 24px;
        }
        button {
          font-family: inherit;
          font-size: 14.5px;
          letter-spacing: 0.08em;
          border-radius: 10px;
          padding: 13px 16px;
          cursor: pointer;
          border: none;
          transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
        }
        button:hover { transform: translateY(-1px); }
        button:active { transform: translateY(0); }
        .primary {
          background: linear-gradient(120deg, #5b2c6f, #8e3b62);
          color: #f6efe4;
          box-shadow: 0 6px 18px rgba(91,44,111,0.35);
        }
        .secondary {
          background: transparent;
          color: #5b2c6f;
          border: 1.5px solid rgba(91,44,111,0.45);
        }
        .tertiary {
          background: transparent;
          color: #8a7a66;
          font-size: 12.5px;
          padding: 6px;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .note {
          text-align: center;
          font-size: 11px;
          color: #a89a86;
          padding-bottom: 16px;
          letter-spacing: 0.1em;
        }
      </style>
      <div class="backdrop" part="backdrop">
        <div class="card" role="alertdialog" aria-live="assertive">
          <div class="header">
            <div class="moon"></div>
            <span class="badge">皮肉レベル・${levelLabel}</span>
            <h1>${escapeHtml(siteEmoji)} ${escapeHtml(siteName)}、もう ${Number(sessionMinutes)} 分どすえ</h1>
          </div>
          <div class="body">
            <p class="phrase">${escapeHtml(phrase)}</p>
            <div class="meta">
              <span>連続 <b>${Number(sessionMinutes)}</b> 分</span>
              <span>今日の合計 <b>${Number(totalToday)}</b> 分</span>
            </div>
          </div>
          <div class="actions">
            <button class="primary" id="back-to-work">おおきに、作業に戻ります</button>
            <button class="secondary" id="five-more">…あと5分だけ堪忍</button>
            <button class="tertiary" id="snooze-today">今日はもう通知せんといて（今日一日通知しない）</button>
          </div>
          <p class="note">— 京都はんなり見張り番 —</p>
        </div>
      </div>
    `;

    shadow.getElementById("back-to-work").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "resetSession" });
      removeOverlay();
    });
    shadow.getElementById("five-more").addEventListener("click", removeOverlay);
    shadow.getElementById("snooze-today").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "snoozeToday" });
      removeOverlay();
    });

    document.documentElement.appendChild(host);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
