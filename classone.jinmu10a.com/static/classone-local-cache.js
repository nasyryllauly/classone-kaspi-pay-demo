(function () {
  var ossOrigin = "https://oss.jinmu10a.com/";
  var basePath = location.pathname.endsWith("/")
    ? location.pathname
    : location.pathname.replace(/\/[^/]*$/, "/");

  function toLocalUrl(src) {
    if (!src) return src;
    if (src.indexOf(ossOrigin) === 0) return basePath + "oss/" + src.slice(ossOrigin.length);
    if (src.indexOf(location.origin + "/static/") === 0) return basePath + src.slice(location.origin.length + 1);
    if (src.indexOf("/static/") === 0) return basePath + src.slice(1);
    if (src.indexOf("static/") === 0) return basePath + src;
    if (src.indexOf(location.origin + "/classone-kaspi-pay-demo/static/") === 0) return src;
    return src;
  }

  function localizeImage(img) {
    var source = img.currentSrc || img.src;
    var localSource = toLocalUrl(source);
    if (localSource !== source) img.src = localSource;
  }

  function localizeAll(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll("img"), localizeImage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { localizeAll(document); });
  } else {
    localizeAll(document);
  }

  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.type === "attributes" && mutation.target && mutation.target.tagName === "IMG") {
        localizeImage(mutation.target);
        return;
      }
      Array.prototype.forEach.call(mutation.addedNodes, function (node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === "IMG") localizeImage(node);
        localizeAll(node);
      });
    });
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["src", "srcset"],
    childList: true,
    subtree: true
  });

  var retries = 0;
  var interval = setInterval(function () {
    localizeAll(document);
    retries += 1;
    if (retries > 10) clearInterval(interval);
  }, 500);
})();
