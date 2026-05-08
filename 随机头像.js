// ============================================================
// 随机头像小组件 Pro Max 修正版
// 适配：小组件 / 中组件 / 大组件 / 深色模式 / 浅色模式
//
// 默认头像 API：
// https://www.loliapi.com/acg/pp/
//
// 功能：
// 1. 随机显示二次元头像
// 2. 点击头像或“预览保存”按钮：先预览大图，再询问是否保存
// 3. 点击“换一张”：重新随机获取头像
// 4. 显示头像来源链接
// 5. 点击来源链接可打开来源地址
// 6. 支持 API 直接返回图片
// 7. 支持 API 返回 JSON 图片地址
// 8. 支持小 / 中 / 大尺寸布局
// 9. 支持深色模式和浅色模式
//
// 使用方法：
// 1. 打开 iPhone 上的 Scriptable
// 2. 新建一个脚本
// 3. 把本代码完整复制进去
// 4. 保存脚本
// 5. 回到桌面添加 Scriptable 小组件
// 6. 选择这个脚本
//
// 重要说明：
// iOS 小组件不能真正后台静默下载。
// 所以点击头像、按钮、来源链接时，会打开 Scriptable 或 Safari。
// 这是 iOS 系统限制，不是脚本问题。
// ============================================================


// ============================================================
// 一、头像 API 配置区
// ============================================================

// 默认使用 LoliAPI 随机二次元头像接口。
// 这个接口一般是“直接返回图片”类型。
const AVATAR_API = "https://www.loliapi.com/acg/pp/";


// 如果 API 是直接返回图片，保持 false。
// 如果 API 返回 JSON，例如：
// {
//   "url": "https://example.com/avatar.jpg"
// }
// 就改成 true。
const API_RETURNS_JSON = false;


// 当 API_RETURNS_JSON = true 时，这里填写 JSON 里的图片字段名。
//
// 示例一：
// {
//   "url": "https://example.com/avatar.jpg"
// }
// 填：
// const JSON_IMAGE_KEY = "url";
//
// 示例二：
// {
//   "data": {
//     "url": "https://example.com/avatar.jpg"
//   }
// }
// 填：
// const JSON_IMAGE_KEY = "data.url";
const JSON_IMAGE_KEY = "url";


// 是否给图片请求链接添加随机参数。
// 作用：尽量避免系统或接口缓存旧头像。
// 如果你的接口加了 ?_t=xxx 后加载失败，就改成 false。
const ENABLE_CACHE_BUST = true;


// 小组件标题。
const WIDGET_TITLE = "随机头像";


// 小组件副标题。
const WIDGET_SUBTITLE = "点击预览大图 · 再保存";


// 缓存头像文件名。
// 不建议随便改，除非你想重新生成缓存。
const CACHE_IMAGE_NAME = "nuan_random_avatar_cache.png";


// 缓存信息文件名。
// 用来记录更新时间、来源链接等信息。
const CACHE_INFO_NAME = "nuan_random_avatar_info.json";


// ============================================================
// 二、初始化区域
// 一般不用修改
// ============================================================

const fm = FileManager.local();

const cachePath = fm.joinPath(
  fm.documentsDirectory(),
  CACHE_IMAGE_NAME
);

const infoPath = fm.joinPath(
  fm.documentsDirectory(),
  CACHE_INFO_NAME
);

const params = args.queryParameters || {};
const action = params.action || "";


// ============================================================
// 三、主程序入口
// ============================================================

await main();
Script.complete();

async function main() {
  // 点击头像或保存按钮：先预览大图，再询问是否保存。
  if (action === "previewSave") {
    await previewAndMaybeSaveAvatar();
    return;
  }

  // 点击换一张按钮：重新获取头像。
  if (action === "change") {
    await changeAvatar();
    return;
  }

  // 正常显示小组件。
  await showWidget();
}


// ============================================================
// 四、正常显示小组件
// 优先读取缓存头像。
// 如果没有缓存，就获取一张新头像。
// 如果获取失败，只显示备用图，不覆盖已有缓存。
// ============================================================

async function showWidget() {
  let avatar;

  if (fm.fileExists(cachePath)) {
    avatar = fm.readImage(cachePath);
  } else {
    const payload = await getAvatarPayload();

    if (payload.success) {
      avatar = payload.image;
      writeAvatarCache(payload);
    } else {
      avatar = payload.image;
    }
  }

  const widget = await createWidget(avatar);
  Script.setWidget(widget);

  if (!config.runsInWidget) {
    await presentWidget(widget);
  }
}


// ============================================================
// 五、更换头像
// 点击“换一张”按钮时执行。
// 修复点：
// 如果接口失败，不会用“加载失败图”覆盖原头像缓存。
// ============================================================

async function changeAvatar() {
  const payload = await getAvatarPayload();

  let avatarToShow = payload.image;

  if (payload.success) {
    writeAvatarCache(payload);

    await notify(
      "头像已更换",
      "新的随机头像已经准备好啦 ✨"
    );
  } else {
    if (fm.fileExists(cachePath)) {
      avatarToShow = fm.readImage(cachePath);
    }

    await notify(
      "头像更换失败",
      "接口暂时没有成功返回图片，已保留原头像。"
    );
  }

  const widget = await createWidget(avatarToShow);
  Script.setWidget(widget);

  if (!config.runsInWidget) {
    await presentWidget(widget);
  }

  if (!payload.success) {
    const alert = new Alert();
    alert.title = "头像获取失败";
    alert.message =
      "没有成功获取到新头像。\n\n可能原因：\n" +
      "1. API 暂时不可用\n" +
      "2. 网络异常\n" +
      "3. 接口返回的不是图片\n\n" +
      "当前不会覆盖你原来的头像缓存。";
    alert.addAction("知道了");
    await alert.present();
  }
}


// ============================================================
// 六、预览大图并询问是否保存
// 点击头像或“预览保存”按钮时执行。
// 流程：
// 1. 读取当前缓存头像
// 2. 打开大图预览
// 3. 关闭预览后弹出确认框
// 4. 用户选择是否保存到相册
// ============================================================

async function previewAndMaybeSaveAvatar() {
  try {
    if (!fm.fileExists(cachePath)) {
      const alert = new Alert();
      alert.title = "没有找到头像";
      alert.message =
        "请先让小组件加载出头像，或者点击“换一张”。";
      alert.addAction("知道了");
      await alert.present();
      return;
    }

    const image = fm.readImage(cachePath);
    const info = readCacheInfo();
    const sourceUrl = info.sourceUrl || AVATAR_API;

    // 先预览大图。
    // 第二个参数 true 表示尽量使用全屏预览。
    await QuickLook.present(image, true);

    const alert = new Alert();
    alert.title = "保存这张头像？";
    alert.message =
      "你刚刚预览的是当前小组件头像。\n\n" +
      "来源：\n" +
      sourceUrl +
      "\n\n是否保存到相册？";

    alert.addAction("保存到相册");
    alert.addAction("打开来源链接");
    alert.addCancelAction("取消");

    const index = await alert.presentAlert();

    if (index === 0) {
      await Photos.save(image);

      await notify(
        "头像已保存",
        "当前头像已经保存到相册啦 ✨"
      );

      return;
    }

    if (index === 1) {
      Safari.open(sourceUrl);
      return;
    }

  } catch (e) {
    const alert = new Alert();
    alert.title = "预览或保存失败";
    alert.message = String(e);
    alert.addAction("知道了");
    await alert.present();
  }
}


// ============================================================
// 七、获取头像数据
//
// 返回结构：
// {
//   success: true / false,
//   image: 图片对象,
//   sourceUrl: 来源链接,
//   requestUrl: 实际请求链接,
//   error: 错误信息
// }
//
// 说明：
// 如果 API_RETURNS_JSON = false：
// 来源链接显示 AVATAR_API。
//
// 如果 API_RETURNS_JSON = true：
// 来源链接显示 JSON 里解析出来的真实图片地址。
// ============================================================

async function getAvatarPayload() {
  try {
    let imageUrl = AVATAR_API;
    let sourceUrl = AVATAR_API;

    if (API_RETURNS_JSON) {
      const jsonReq = new Request(addCacheBuster(AVATAR_API));
      jsonReq.headers = createRequestHeaders();

      const json = await jsonReq.loadJSON();
      imageUrl = getValueByPath(json, JSON_IMAGE_KEY);

      if (!imageUrl) {
        throw new Error(
          "JSON 中没有找到图片地址，请检查 JSON_IMAGE_KEY 是否填写正确"
        );
      }

      sourceUrl = imageUrl;
    }

    const requestUrl = addCacheBuster(imageUrl);

    const imgReq = new Request(requestUrl);
    imgReq.headers = createRequestHeaders();

    const image = await imgReq.loadImage();

    return {
      success: true,
      image,
      sourceUrl,
      requestUrl,
      error: ""
    };

  } catch (e) {
    console.log("获取头像失败：" + e);

    const image = await createFallbackImage("加载失败");

    return {
      success: false,
      image,
      sourceUrl: AVATAR_API,
      requestUrl: AVATAR_API,
      error: String(e)
    };
  }
}


// ============================================================
// 八、写入头像缓存和来源信息
// 只有成功获取头像时才会写入缓存。
// 这样可以避免接口失败时覆盖原来的正常头像。
// ============================================================

function writeAvatarCache(payload) {
  try {
    if (!payload || !payload.success) {
      console.log("头像获取失败，不写入缓存。");
      return;
    }

    fm.writeImage(cachePath, payload.image);

    const data = {
      updatedAt: new Date().toISOString(),
      sourceUrl: payload.sourceUrl || AVATAR_API,
      requestUrl: payload.requestUrl || payload.sourceUrl || AVATAR_API
    };

    fm.writeString(infoPath, JSON.stringify(data));

  } catch (e) {
    console.log("写入缓存失败：" + e);
  }
}


// ============================================================
// 九、读取缓存信息
// 如果没有缓存信息，就返回默认 API。
// ============================================================

function readCacheInfo() {
  try {
    if (!fm.fileExists(infoPath)) {
      return {
        updatedAt: null,
        sourceUrl: AVATAR_API,
        requestUrl: AVATAR_API
      };
    }

    const raw = fm.readString(infoPath);
    const json = JSON.parse(raw);

    return {
      updatedAt: json.updatedAt || null,
      sourceUrl: json.sourceUrl || AVATAR_API,
      requestUrl: json.requestUrl || json.sourceUrl || AVATAR_API
    };

  } catch (e) {
    return {
      updatedAt: null,
      sourceUrl: AVATAR_API,
      requestUrl: AVATAR_API
    };
  }
}


// ============================================================
// 十、创建小组件
// 根据小 / 中 / 大尺寸自动切换布局。
// ============================================================

async function createWidget(avatar) {
  const widget = new ListWidget();

  const family = config.widgetFamily || "medium";

  widget.backgroundGradient = createBackgroundGradient();

  const padding = getPaddingByFamily(family);
  widget.setPadding(
    padding.top,
    padding.left,
    padding.bottom,
    padding.right
  );

  if (family === "small") {
    await buildSmallWidget(widget, avatar);
  } else if (family === "large") {
    await buildLargeWidget(widget, avatar);
  } else {
    await buildMediumWidget(widget, avatar);
  }

  // 建议 30 分钟刷新一次。
  // 实际刷新时间由 iOS 决定，不一定完全准时。
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30);
  widget.refreshAfterDate = next;

  return widget;
}


// ============================================================
// 十一、小尺寸布局
// 小组件空间较小，所以内容更紧凑。
// 显示：标题 / 头像 / 来源入口 / 预览按钮 / 换一张按钮
// ============================================================

async function buildSmallWidget(widget, avatar) {
  const urls = getActionUrls();

  widget.addSpacer(1);

  const title = widget.addText(WIDGET_TITLE);
  title.font = Font.boldSystemFont(13);
  title.textColor = primaryTextColor();
  title.centerAlignText();

  widget.addSpacer(5);

  const avatarWrap = widget.addStack();
  avatarWrap.centerAlignContent();
  avatarWrap.url = urls.previewSaveUrl;

  avatarWrap.addSpacer();

  const img = avatarWrap.addImage(avatar);
  img.imageSize = new Size(56, 56);
  img.cornerRadius = 999;
  img.centerAlignImage();

  avatarWrap.addSpacer();

  widget.addSpacer(5);

  addSourceLink(widget, "small");

  widget.addSpacer(5);

  const btnRow = widget.addStack();
  btnRow.layoutHorizontally();
  btnRow.centerAlignContent();

  createButton(btnRow, "预览", urls.previewSaveUrl, "small");

  btnRow.addSpacer(6);

  createButton(btnRow, "换一张", urls.changeUrl, "small");
}


// ============================================================
// 十二、中尺寸布局
// 推荐日常使用。
// 左边头像，右边标题、说明、来源和按钮。
// ============================================================

async function buildMediumWidget(widget, avatar) {
  const urls = getActionUrls();

  const root = widget.addStack();
  root.layoutHorizontally();
  root.centerAlignContent();

  const left = root.addStack();
  left.layoutVertically();
  left.centerAlignContent();

  const avatarWrap = left.addStack();
  avatarWrap.url = urls.previewSaveUrl;
  avatarWrap.centerAlignContent();

  avatarWrap.addSpacer();

  const img = avatarWrap.addImage(avatar);
  img.imageSize = new Size(90, 90);
  img.cornerRadius = 999;
  img.centerAlignImage();

  avatarWrap.addSpacer();

  root.addSpacer(16);

  const right = root.addStack();
  right.layoutVertically();
  right.centerAlignContent();

  const title = right.addText(WIDGET_TITLE);
  title.font = Font.boldSystemFont(17);
  title.textColor = primaryTextColor();

  right.addSpacer(5);

  const desc = right.addText(WIDGET_SUBTITLE);
  desc.font = Font.systemFont(11);
  desc.textColor = secondaryTextColor();

  right.addSpacer(5);

  const timeText = right.addText("更新时间：" + getUpdateTimeText());
  timeText.font = Font.systemFont(10);
  timeText.textColor = tertiaryTextColor();

  right.addSpacer(6);

  addSourceLink(right, "medium");

  right.addSpacer(12);

  const btnRow = right.addStack();
  btnRow.layoutHorizontally();

  createButton(btnRow, "预览保存", urls.previewSaveUrl, "medium");

  btnRow.addSpacer(8);

  createButton(btnRow, "换一张", urls.changeUrl, "medium");
}


// ============================================================
// 十三、大尺寸布局
// 显示完整信息和更大的头像。
// ============================================================

async function buildLargeWidget(widget, avatar) {
  const urls = getActionUrls();

  const title = widget.addText(WIDGET_TITLE);
  title.font = Font.boldSystemFont(20);
  title.textColor = primaryTextColor();
  title.centerAlignText();

  widget.addSpacer(6);

  const sub = widget.addText(WIDGET_SUBTITLE);
  sub.font = Font.systemFont(12);
  sub.textColor = secondaryTextColor();
  sub.centerAlignText();

  widget.addSpacer(12);

  const avatarWrap = widget.addStack();
  avatarWrap.centerAlignContent();
  avatarWrap.url = urls.previewSaveUrl;

  avatarWrap.addSpacer();

  const img = avatarWrap.addImage(avatar);
  img.imageSize = new Size(138, 138);
  img.cornerRadius = 999;
  img.centerAlignImage();

  avatarWrap.addSpacer();

  widget.addSpacer(12);

  const infoBox = widget.addStack();
  infoBox.layoutVertically();
  infoBox.backgroundColor = infoBgColor();
  infoBox.cornerRadius = 16;
  infoBox.setPadding(10, 12, 10, 12);

  const info1 = infoBox.addText("当前状态：头像已加载");
  info1.font = Font.systemFont(12);
  info1.textColor = primaryTextColor();

  infoBox.addSpacer(4);

  const info2 = infoBox.addText("更新时间：" + getUpdateTimeText());
  info2.font = Font.systemFont(11);
  info2.textColor = tertiaryTextColor();

  infoBox.addSpacer(6);

  addSourceLink(infoBox, "large");

  widget.addSpacer(12);

  const btnRow = widget.addStack();
  btnRow.layoutHorizontally();
  btnRow.centerAlignContent();

  createButton(btnRow, "预览并保存", urls.previewSaveUrl, "large");

  btnRow.addSpacer(10);

  createButton(btnRow, "换一张头像", urls.changeUrl, "large");

  widget.addSpacer(2);
}


// ============================================================
// 十四、来源链接组件
// 点击后会打开头像来源。
// 对于直接返回图片的随机 API，来源通常显示接口域名。
// ============================================================

function addSourceLink(parent, family) {
  const info = readCacheInfo();
  const sourceUrl = info.sourceUrl || AVATAR_API;

  const box = parent.addStack();
  box.layoutHorizontally();
  box.centerAlignContent();
  box.url = safeOpenUrl(sourceUrl);
  box.backgroundColor = sourceBgColor();
  box.cornerRadius = family === "small" ? 10 : 12;

  if (family === "small") {
    box.setPadding(4, 7, 4, 7);
  } else {
    box.setPadding(5, 8, 5, 8);
  }

  const labelText =
    family === "small"
      ? "来源链接 ↗"
      : "来源：" + getSourceLabel(sourceUrl, family);

  const label = box.addText(labelText);
  label.font = Font.systemFont(family === "large" ? 11 : 10);
  label.textColor = linkTextColor();
  label.lineLimit = 1;
}


// ============================================================
// 十五、按钮组件
// 所有尺寸的小组件按钮都从这里生成。
// ============================================================

function createButton(parent, text, url, family) {
  const btn = parent.addStack();
  btn.url = url;
  btn.layoutHorizontally();
  btn.centerAlignContent();
  btn.backgroundColor = buttonBgColor();
  btn.cornerRadius = 14;

  let paddingH = 10;
  let paddingV = 6;
  let fontSize = 11;

  if (family === "small") {
    paddingH = 8;
    paddingV = 4;
    fontSize = 10;
  }

  if (family === "large") {
    paddingH = 14;
    paddingV = 8;
    fontSize = 12;
  }

  btn.setPadding(paddingV, paddingH, paddingV, paddingH);

  const label = btn.addText(text);
  label.font = Font.boldSystemFont(fontSize);
  label.textColor = buttonTextColor();

  return btn;
}


// ============================================================
// 十六、备用图片
// 当头像 API 失效、网络异常、接口返回错误时显示。
// ============================================================

async function createFallbackImage(text) {
  const ctx = new DrawContext();
  ctx.size = new Size(300, 300);
  ctx.opaque = false;

  const dark = Device.isUsingDarkAppearance();

  ctx.setFillColor(
    dark ? new Color("#232734") : new Color("#ffc7d6")
  );

  ctx.fillRect(new Rect(0, 0, 300, 300));

  ctx.setTextColor(new Color("#ffffff"));
  ctx.setFont(Font.boldSystemFont(32));

  const showText = text || "加载失败";

  ctx.drawTextInRect(
    showText,
    new Rect(70, 120, 180, 50)
  );

  return ctx.getImage();
}


// ============================================================
// 十七、生成点击链接
// previewSave：预览大图并询问是否保存
// change：更换头像
// ============================================================

function getActionUrls() {
  const scriptName = encodeURIComponent(Script.name());

  return {
    previewSaveUrl: `scriptable:///run/${scriptName}?action=previewSave`,
    changeUrl: `scriptable:///run/${scriptName}?action=change`
  };
}


// ============================================================
// 十八、深色模式 / 浅色模式背景
// 这里可以改整体颜色风格。
// ============================================================

function createBackgroundGradient() {
  const gradient = new LinearGradient();
  gradient.locations = [0, 1];

  if (Device.isUsingDarkAppearance()) {
    gradient.colors = [
      new Color("#1f2330"),
      new Color("#12151d")
    ];
  } else {
    gradient.colors = [
      new Color("#ffd1dc"),
      new Color("#ffe6ee")
    ];
  }

  return gradient;
}


// ============================================================
// 十九、不同尺寸的小组件边距
// 小尺寸边距更小，中尺寸适中，大尺寸更宽松。
// ============================================================

function getPaddingByFamily(family) {
  if (family === "small") {
    return {
      top: 9,
      left: 9,
      bottom: 9,
      right: 9
    };
  }

  if (family === "large") {
    return {
      top: 16,
      left: 16,
      bottom: 16,
      right: 16
    };
  }

  return {
    top: 14,
    left: 14,
    bottom: 14,
    right: 14
  };
}


// ============================================================
// 二十、文字颜色
// 自动根据深色模式 / 浅色模式切换。
// ============================================================

function primaryTextColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#ffffff")
    : new Color("#222222");
}

function secondaryTextColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#d6d9e0")
    : new Color("#555555");
}

function tertiaryTextColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#aab0bb")
    : new Color("#777777");
}

function linkTextColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#b8d7ff")
    : new Color("#3b5bcc");
}


// ============================================================
// 二十一、按钮和信息框颜色
// ============================================================

function buttonBgColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#ffffff", 0.14)
    : new Color("#ffffff", 0.72);
}

function buttonTextColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#ffffff")
    : new Color("#333333");
}

function infoBgColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#ffffff", 0.08)
    : new Color("#ffffff", 0.55);
}

function sourceBgColor() {
  return Device.isUsingDarkAppearance()
    ? new Color("#ffffff", 0.10)
    : new Color("#ffffff", 0.62);
}


// ============================================================
// 二十二、读取更新时间
// 显示格式：HH:mm
// ============================================================

function getUpdateTimeText() {
  try {
    const info = readCacheInfo();

    if (!info.updatedAt) {
      return "刚刚";
    }

    const d = new Date(info.updatedAt);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");

    return `${h}:${m}`;
  } catch (e) {
    return "未知";
  }
}


// ============================================================
// 二十三、预览小组件
// 在 Scriptable 内手动运行脚本时使用。
// 桌面小组件正常运行时不会弹出预览。
// ============================================================

async function presentWidget(widget) {
  const family = config.widgetFamily || "medium";

  if (family === "small") {
    await widget.presentSmall();
  } else if (family === "large") {
    await widget.presentLarge();
  } else {
    await widget.presentMedium();
  }
}


// ============================================================
// 二十四、给链接添加随机参数
// 作用：尽量避免接口或系统缓存旧头像。
// ============================================================

function addCacheBuster(url) {
  if (!ENABLE_CACHE_BUST) {
    return url;
  }

  const str = String(url || "");

  if (!str.startsWith("http://") && !str.startsWith("https://")) {
    return str;
  }

  const mark = str.includes("?") ? "&" : "?";
  return `${str}${mark}_t=${Date.now()}`;
}


// ============================================================
// 二十五、读取嵌套 JSON 字段
// 支持：
// JSON_IMAGE_KEY = "url"
// JSON_IMAGE_KEY = "data.url"
// JSON_IMAGE_KEY = "data.image.url"
// ============================================================

function getValueByPath(obj, path) {
  try {
    return String(path || "")
      .split(".")
      .reduce((current, key) => {
        if (current && current[key] !== undefined) {
          return current[key];
        }
        return undefined;
      }, obj);
  } catch (e) {
    return undefined;
  }
}


// ============================================================
// 二十六、来源链接显示优化
// 避免小组件里显示一整串超长 URL。
// ============================================================

function getSourceLabel(url, family) {
  if (!url) {
    return "未知来源";
  }

  const host = getHostFromUrl(url);

  if (family === "large") {
    return shortenText(url, 42);
  }

  if (host) {
    return host;
  }

  return shortenText(url, 24);
}

function getHostFromUrl(url) {
  try {
    const match = String(url).match(/^https?:\/\/([^\/?#]+)/i);

    if (match && match[1]) {
      return match[1];
    }

    return "";
  } catch (e) {
    return "";
  }
}

function shortenText(text, maxLength) {
  const str = String(text || "");

  if (str.length <= maxLength) {
    return str;
  }

  return str.slice(0, maxLength - 3) + "...";
}


// ============================================================
// 二十七、安全打开链接
// 如果来源链接不是 http/https，就回退到默认头像 API。
// ============================================================

function safeOpenUrl(url) {
  const str = String(url || "");

  if (str.startsWith("http://") || str.startsWith("https://")) {
    return str;
  }

  return AVATAR_API;
}


// ============================================================
// 二十八、请求头
// 有些接口会检查 User-Agent，加上后兼容性更好。
// ============================================================

function createRequestHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 Scriptable Avatar Widget"
  };
}


// ============================================================
// 二十九、通知工具
// ============================================================

async function notify(title, body) {
  const n = new Notification();
  n.title = title;
  n.body = body;
  await n.schedule();
}


// ============================================================
// 常见问题说明
//
// 问：为什么点击“换一张”后桌面没有立刻变化？
// 答：iOS 小组件刷新不是完全实时的。
//     脚本已经更新缓存，回到桌面等几秒通常会变化。
//
// 问：为什么来源链接打开后和当前头像不一样？
// 答：因为当前默认 API 是随机图片接口。
//     来源链接本身每次打开都有可能随机返回另一张头像。
//     如果你想显示精确图片地址，需要使用返回 JSON 图片 URL 的 API。
//
// 问：为什么保存失败？
// 答：第一次保存时需要给 Scriptable 相册权限。
//     可以去 iPhone 设置里找到 Scriptable，允许访问照片。
//
// 问：为什么头像加载失败？
// 答：常见原因：
//     1. 网络异常
//     2. API 暂时不可用
//     3. 接口返回的不是图片
//     4. ENABLE_CACHE_BUST = true 导致接口不兼容
//
// 问：如果 LoliAPI 加随机参数后失效怎么办？
// 答：把这里改成 false：
//     const ENABLE_CACHE_BUST = false;
//
// 问：推荐用哪个尺寸？
// 答：中尺寸最实用，大尺寸最好看，小尺寸最省空间。
// ============================================================