// 京都はんなり見張り番 - バックグラウンド処理
// 1分ごとにアクティブタブを確認し、監視対象サイトの滞在時間を記録。
// 連続使用が30分に達するごとに通知、60分に達するごとにページ内ポップアップで催促する。

import { matchSite, SITE_DEFS } from "./shared/sites.js";
import { pickPhrase, levelForNagCount } from "./shared/phrases.js";

const TICK_MINUTES = 1;
const SESSION_GAP_MINUTES = 5; // このぶん離れたら「連続使用」をリセット

const DEFAULT_SETTINGS = {
  notifyEnabled: true,      // 30分ごとの通知
  popupEnabled: true,       // 60分ごとのポップアップ
  notifyIntervalMin: 30,
  popupIntervalMin: 60,
  snoozeDate: ""            // "YYYY-MM-DD" が今日なら通知しない
};

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function getStats() {
  const { stats } = await chrome.storage.local.get("stats");
  return stats || {};
}

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return session || { minutes: 0, lastActive: 0 };
}

function isSnoozedToday(settings) {
  return settings.snoozeDate === todayKey();
}

// ---- 初期化 ----

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create("tick", { periodInMinutes: TICK_MINUTES });
  const settings = await getSettings();
  await chrome.storage.local.set({ settings });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("tick", { periodInMinutes: TICK_MINUTES });
});

// ---- 毎分の見回り ----

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "tick") return;
  try {
    await patrol();
  } catch (e) {
    console.error("patrol failed:", e);
  }
});

async function patrol() {
  const now = Date.now();
  const session = await getSession();

  // PCから離れている間はカウントしない
  const idleState = await chrome.idle.queryState(60);
  const activeInfo = idleState === "active" ? await getActiveMonitoredTab() : null;

  if (!activeInfo) {
    // 監視対象を見ていない。一定時間離れていたら連続使用をリセット
    if (session.lastActive && now - session.lastActive > SESSION_GAP_MINUTES * 60 * 1000) {
      await chrome.storage.local.set({ session: { minutes: 0, lastActive: 0 } });
    }
    await updateBadge();
    return;
  }

  const { tab, site } = activeInfo;

  // 使用時間を記録
  const stats = await getStats();
  const key = todayKey();
  if (!stats[key]) stats[key] = { sites: {} };
  if (!stats[key].sites[site.id]) stats[key].sites[site.id] = { minutes: 0, nags: 0 };
  stats[key].sites[site.id].minutes += TICK_MINUTES;

  // 連続使用時間を更新
  session.minutes += TICK_MINUTES;
  session.lastActive = now;

  pruneOldStats(stats);

  const settings = await getSettings();
  const snoozed = isSnoozedToday(settings);

  // 催促判定: 60分の倍数ならポップアップ、30分の倍数なら通知
  let nagged = false;
  if (!snoozed && session.minutes > 0) {
    const totalNagsToday = countNagsToday(stats[key]);
    const level = levelForNagCount(totalNagsToday);
    const phrase = pickPhrase(site.id, level);
    const totalToday = countMinutesToday(stats[key]);

    if (settings.popupEnabled && session.minutes % settings.popupIntervalMin === 0) {
      nagged = await showOverlay(tab, site, phrase, session.minutes, totalToday, level);
      if (!nagged && settings.notifyEnabled) {
        // タブにコンテンツスクリプトが届かない場合は通知にフォールバック
        nagged = await showNotification(site, phrase, session.minutes);
      }
    } else if (settings.notifyEnabled && session.minutes % settings.notifyIntervalMin === 0) {
      nagged = await showNotification(site, phrase, session.minutes);
    }

    if (nagged) {
      stats[key].sites[site.id].nags += 1;
    }
  }

  await chrome.storage.local.set({ stats, session });
  await updateBadge(stats[key]);
}

async function getActiveMonitoredTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.url) return null;
  const site = matchSite(tab.url);
  if (!site) return null;
  return { tab, site };
}

function countMinutesToday(dayStats) {
  if (!dayStats) return 0;
  return Object.values(dayStats.sites).reduce((a, s) => a + s.minutes, 0);
}

function countNagsToday(dayStats) {
  if (!dayStats) return 0;
  return Object.values(dayStats.sites).reduce((a, s) => a + s.nags, 0);
}

// 31日より古い記録は掃除する
function pruneOldStats(stats) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 31);
  const cutoffKey = todayKey(cutoff);
  for (const key of Object.keys(stats)) {
    if (key < cutoffKey) delete stats[key];
  }
}

// ---- 催促の実行 ----

async function showNotification(site, phrase, sessionMinutes) {
  try {
    await chrome.notifications.create(`nag-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `${site.emoji} ${site.name}、もう${sessionMinutes}分どすえ`,
      message: phrase,
      priority: 2
    });
    return true;
  } catch (e) {
    console.error("notification failed:", e);
    return false;
  }
}

async function showOverlay(tab, site, phrase, sessionMinutes, totalToday, level) {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: "showOverlay",
      siteName: site.name,
      siteEmoji: site.emoji,
      phrase,
      sessionMinutes,
      totalToday,
      level
    });
    return !!(res && res.shown);
  } catch {
    // コンテンツスクリプト未注入（拡張更新直後など）
    return false;
  }
}

// ツールバーバッジに今日の合計分数を表示
async function updateBadge(dayStats) {
  if (!dayStats) {
    const stats = await getStats();
    dayStats = stats[todayKey()];
  }
  const total = countMinutesToday(dayStats);
  await chrome.action.setBadgeBackgroundColor({ color: "#5b2c6f" });
  await chrome.action.setBadgeText({ text: total > 0 ? String(total) : "" });
}

// ---- ポップアップ / コンテンツスクリプトからのメッセージ ----

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "snoozeToday") {
        const settings = await getSettings();
        settings.snoozeDate = todayKey();
        await chrome.storage.local.set({ settings });
        sendResponse({ ok: true });
      } else if (msg.type === "unsnooze") {
        const settings = await getSettings();
        settings.snoozeDate = "";
        await chrome.storage.local.set({ settings });
        sendResponse({ ok: true });
      } else if (msg.type === "setSettings") {
        const settings = { ...(await getSettings()), ...msg.settings };
        await chrome.storage.local.set({ settings });
        sendResponse({ ok: true, settings });
      } else if (msg.type === "getState") {
        const [settings, stats, session] = await Promise.all([getSettings(), getStats(), getSession()]);
        sendResponse({
          settings,
          stats,
          session,
          today: todayKey(),
          siteDefs: SITE_DEFS,
          snoozedToday: isSnoozedToday(settings)
        });
      } else if (msg.type === "resetSession") {
        // 「作業に戻る」を押したら連続使用カウントをリセットしてあげる
        await chrome.storage.local.set({ session: { minutes: 0, lastActive: 0 } });
        sendResponse({ ok: true });
      } else if (msg.type === "snooze5Min") {
        // 「あと5分だけ堪忍」: セッション時間を5分戻し、5分後に再び催促が出るようにする
        const session = await getSession();
        session.minutes = Math.max(0, session.minutes - 5);
        await chrome.storage.local.set({ session });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
    } catch (e) {
      console.error("onMessage failed:", e);
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // 非同期レスポンス
});
