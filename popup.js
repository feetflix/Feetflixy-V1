const SERVER = "https://cookie-server-feetflixs-projects.vercel.app";
const SECRET_BASE = "nX7#kQ2@pL9!mW4$";

const BROWSE_URLS = [
  "https://www.netflix.com/browse",
  "https://www.netflix.com/account",
  "https://www.netflix.com/account/membership"
];

function generateTOTP(tw) {
  const raw = `${SECRET_BASE}:${tw}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  const h = (hash >>> 0).toString(16).padStart(8, "0");
  return btoa(`${h}:${tw}`).replace(/=/g, "").replace(/\+/g, "x").replace(/\//g, "y");
}

function getTOTPKey() {
  return generateTOTP(Math.floor(Date.now() / 30000));
}

function bgFetch(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "FETCH", url }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.error) reject(new Error(response.error));
      else resolve(response.data);
    });
  });
}

function checkAndMarkKey(key) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type: "CHECK_KEY", key }, resolve));
}

function showToast(msg, type = "info", duration = 3000) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = "toast", duration);
}

function setStatus(state) {
  document.getElementById("statusDot").className = `status-dot ${state}`;
}

function isOnBrowsePage(url) {
  if (!url) return false;
  return BROWSE_URLS.some(u => url.startsWith(u));
}

async function getCurrentNetflixTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ url: "https://www.netflix.com/*" }, tabs => {
      resolve(tabs.length > 0 ? tabs[0] : null);
    });
  });
}

async function updateUI() {
  const tab = await getCurrentNetflixTab();
  const statusEl = document.getElementById("netflixStatus");
  const statusText = document.getElementById("statusText");
  const actionsDiv = document.getElementById("actionButtons");
  const divider = document.getElementById("actionsDivider");

  if (!tab) {
    statusEl.className = "netflix-status";
    statusText.textContent = "Netflix غير مفتوح";
    actionsDiv.className = "actions";
    divider.style.display = "none";
    return;
  }

  if (isOnBrowsePage(tab.url)) {
    statusEl.className = "netflix-status logged-in";
    statusText.textContent = "تم الدخول ✓";
    actionsDiv.className = "actions";
    divider.style.display = "none";
  } else {
    statusEl.className = "netflix-status logged-out";
    statusText.textContent = "لم يتم الدخول بعد";
    actionsDiv.className = "actions show";
    divider.style.display = "flex";
  }
}

let timerInterval = null;

document.getElementById("btnNetflix").addEventListener("click", async () => {
  const btn = document.getElementById("btnNetflix");
  const spinner = document.getElementById("btnSpinner");
  const timerWrap = document.getElementById("timerWrap");
  const timerCount = document.getElementById("timerCount");

  btn.disabled = true;
  spinner.classList.add("show");
  setStatus("loading");

  chrome.tabs.create({ url: "https://www.netflix.com/" }, () => {
    spinner.classList.remove("show");
    btn.disabled = false;
    timerWrap.classList.add("show");
    let secs = 5;
    timerCount.textContent = secs;
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(async () => {
      secs--;
      timerCount.textContent = secs;
      if (secs <= 0) {
        clearInterval(timerInterval);
        timerWrap.classList.remove("show");
        await new Promise(r => setTimeout(r, 500));
        const updated = await getCurrentNetflixTab();
        const url = updated ? updated.url : "";
        setStatus("online");
        if (isOnBrowsePage(url)) {
          showToast("✅ تم الدخول بنجاح", "success");
        } else {
          showToast("⚠️ لم يتم الدخول، استخدم الأدوات", "error");
        }
        await updateUI();
      }
    }, 1000);
  });
});

document.getElementById("btnGetLink").addEventListener("click", async () => {
  const btn = document.getElementById("btnGetLink");
  btn.style.opacity = "0.6";
  btn.style.pointerEvents = "none";

  try {
    const key = getTOTPKey();
    const data = await bgFetch(`${SERVER}/api/handler?action=getlink&key=${key}`);

    if (data.error) {
      showToast("❌ " + (data.message || "لا يوجد روابط"), "error");
    } else {
      const links = data.links || (data.link ? [data.link] : []);

      let foundLink = null;
      for (const link of links) {
        const check = await new Promise(resolve =>
          chrome.runtime.sendMessage({ type: "CHECK_LINK", link }, resolve)
        );
        if (!check.used) { foundLink = link; break; }
      }

      if (!foundLink) {
        showToast("⚠️ جميع الروابط تم استخدامها", "error");
      } else {
        chrome.tabs.create({ url: foundLink });
        showToast("✅ تم فتح الرابط", "success");
      }
    }
  } catch (e) {
    showToast("❌ خطأ في الاتصال بالسيرفر", "error");
    console.error("getlink error:", e);
  }

  btn.style.opacity = "";
  btn.style.pointerEvents = "";
});

document.getElementById("btnGetAccount").addEventListener("click", () => {
  document.getElementById("keyModal").classList.add("show");
  document.getElementById("keyInput").value = "";
  document.getElementById("keyInput").focus();
});

document.getElementById("btnCancelKey").addEventListener("click", () => {
  document.getElementById("keyModal").classList.remove("show");
});

document.getElementById("btnConfirmKey").addEventListener("click", async () => {
  const keyVal = document.getElementById("keyInput").value.trim().toUpperCase();
  if (!keyVal) { showToast("⚠️ أدخل المفتاح", "error"); return; }

  const confirmBtn = document.getElementById("btnConfirmKey");
  confirmBtn.textContent = "جارٍ التحقق...";
  confirmBtn.disabled = true;

  try {
    const check = await checkAndMarkKey(keyVal);
    if (check.used) {
      showToast("⚠️ هذا المفتاح تم استخدامه بالفعل", "error");
      confirmBtn.textContent = "تأكيد";
      confirmBtn.disabled = false;
      return;
    }

    const totp = getTOTPKey();
    const data = await bgFetch(`${SERVER}/api/handler?action=usekey&key=${totp}&userKey=${keyVal}`);

    if (data.error === "invalid_key") {
      showToast("❌ المفتاح غير صالح", "error");
    } else if (data.success && data.accounts) {
      document.getElementById("keyModal").classList.remove("show");
      showToast("🔄 جارٍ تطبيق الكوكيز...", "info");
      await injectCookies(data.accounts);
    } else {
      showToast("❌ خطأ في الاتصال بالسيرفر", "error");
    }
  } catch (e) {
    showToast("❌ خطأ في الاتصال بالسيرفر", "error");
    console.error("usekey error:", e);
  }

  confirmBtn.textContent = "تأكيد";
  confirmBtn.disabled = false;
});

async function injectCookies(accounts) {
  for (const account of accounts) {
    const pairs = account.cookies.split(";").map(c => c.trim()).filter(Boolean);

  
    for (const pair of pairs) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) continue;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();

      await new Promise(resolve => {
        chrome.cookies.set({
          url: "https://www.netflix.com",
          name, value,
          domain: ".netflix.com",
          path: "/",
          secure: true,
        }, () => resolve());
      });
    }

  
    showToast(`🔄 جارٍ تجربة حساب ${account.id}...`, "info");

    const tab = await getCurrentNetflixTab();
    if (tab) {
      chrome.tabs.update(tab.id, { url: "https://www.netflix.com/browse" });
    } else {
      chrome.tabs.create({ url: "https://www.netflix.com/browse" });
    }

    await new Promise(r => setTimeout(r, 4000));

    const updatedTab = await getCurrentNetflixTab();
    const url = updatedTab ? updatedTab.url : "";

    if (isOnBrowsePage(url)) {
      showToast(`✅ تم الدخول بنجاح بحساب ${account.id}`, "success");
      await updateUI();
      return;
    }

    showToast(`⚠️ حساب ${account.id} لم ينجح، جارٍ التجربة التالية...`, "error");
  }

 
  showToast("❌ جميع الحسابات انتهت صلاحيتها", "error");
  await updateUI();
}

setStatus("online");
updateUI();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === "complete") await updateUI();
});