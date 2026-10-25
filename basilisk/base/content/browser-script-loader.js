/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Runtime selector for the optional browser scripts.
 *
 * Tier 2/3 keep the historical startup graph by loading the optional scripts
 * after browser.js. Tier 0/1 install small no-op shims instead. The shims are
 * deliberately installed only for the low-memory tiers; the default tier is
 * still 3 and therefore still runs the real scripts.
 */

(function() {
  var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefBranch);
  var tier = 3;
  try {
    tier = prefs.getIntPref("browser.memoryTier");
  } catch (ex) {}

  if (tier >= 2) {
    var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                           .getService(Components.interfaces.mozIJSSubScriptLoader);
    var urls = [
      "chrome://browser/content/places/browserPlacesViews.js",
      "chrome://browser/content/browser-places.js",
      "chrome://browser/content/customizableui/panelUI.js",
      "chrome://global/content/viewSourceUtils.js",
      "chrome://browser/content/browser-addons.js",
      "chrome://browser/content/browser-captivePortal.js",
      "chrome://browser/content/browser-ctrlTab.js",
      "chrome://browser/content/browser-customization.js",
      "chrome://browser/content/browser-feeds.js",
      "chrome://browser/content/browser-gestureSupport.js",
      "chrome://browser/content/browser-media.js",
      "chrome://browser/content/browser-refreshblocker.js",
      "chrome://browser/content/browser-sidebar.js",
      "chrome://browser/content/browser-thumbnails.js",
      "chrome://browser/content/downloads/downloads.js",
      "chrome://browser/content/downloads/indicator.js",
      "chrome://browser/content/places/editBookmarkOverlay.js",
    ];
    for (var i = 0; i < urls.length; i++) {
      try {
        loader.loadSubScript(urls[i], window);
      } catch (ex) {
        Components.utils.reportError("low-shell optional script failed: " +
                                     urls[i] + " " + ex);
        throw ex;
      }
    }
    return;
  }

  function shim(name, props) {
    var base = props || {};
    base.__lowShellShim = name;
    return new Proxy(base, {
      get: function(target, prop) {
        if (prop in target) {
          return target[prop];
        }
        if (prop === "then") {
          return undefined;
        }
        if (prop === Symbol.toPrimitive) {
          return function() { return ""; };
        }
        var fn = function() {};
        target[prop] = fn;
        return fn;
      },
      set: function(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  }

  window.CustomizableUI = shim("CustomizableUI", {
    AREA_PANEL: "panel",
    AREA_NAVBAR: "nav-bar",
    AREA_TABSTRIP: "TabsToolbar",
    AREA_MENUBAR: "main-menubar",
    AREA_BOOKMARKS: "PersonalToolbar",
    TYPE_TOOLBAR: "toolbar",
    TYPE_MENU_PANEL: "menu-panel",
    getPlacementOfWidget: function() { return null; },
    getWidget: function() {
      return { forWindow: function() { return { node: null, anchor: null }; } };
    },
    getAreaType: function() { return null; },
    isWidgetRemovable: function() { return false; },
    registerToolbarNode: function() {},
    addListener: function() {},
    removeListener: function() {},
  });
  window.FeedHandler = shim("FeedHandler");
  window.RefreshBlocker = shim("RefreshBlocker");
  window.CaptivePortalWatcher = shim("CaptivePortalWatcher");
  window.gGestureSupport = shim("gGestureSupport");
  window.gHistorySwipeAnimation = shim("gHistorySwipeAnimation");
  window.gBrowserThumbnails = shim("gBrowserThumbnails");
  window.LightweightThemeListener = shim("LightweightThemeListener");
  window.LightWeightThemeWebInstaller = shim("LightWeightThemeWebInstaller");
  window.gViewSourceUtils = shim("gViewSourceUtils");
  window.PanelUI = shim("PanelUI", {
    panel: null,
    menuButton: null,
    show: function() { return Promise.resolve(); },
  });
  window.SidebarUI = shim("SidebarUI", {
    isOpen: false,
    currentID: null,
    browser: null,
    title: "",
  });
  window.CustomizationHandler = shim("CustomizationHandler", {
    isExitingCustomizeMode: false,
    isEnteringCustomizeMode: false,
    isCustomizing: function() { return false; },
  });
  window.ctrlTab = shim("ctrlTab", {
    prefName: "browser.ctrlTab.previews",
    observe: function() {},
    readPref: function() {},
    uninit: function() {},
  });
  window.tabPreviews = shim("tabPreviews");
  window.tabPreviewPanelHelper = shim("tabPreviewPanelHelper");
  window.allTabs = shim("allTabs");

  window.gCustomizeMode = shim("gCustomizeMode");
  window.PlacesViewBase = function() {};
  window.PlacesMenu = function() {};
  window.StarUI = shim("StarUI");
  window.DownloadsButton = shim("DownloadsButton");
  window.DownloadsPanel = shim("DownloadsPanel");
  window.DownloadsView = shim("DownloadsView");
  window.DownloadsIndicatorView = shim("DownloadsIndicatorView");
  window.gEditItemOverlay = shim("gEditItemOverlay");
  window.PlacesCommandHook = shim("PlacesCommandHook");
  window.PlacesToolbarHelper = shim("PlacesToolbarHelper");
  window.BookmarkingUI = shim("BookmarkingUI");
  window.AutoShowBookmarksToolbar = shim("AutoShowBookmarksToolbar");
  window.HistoryMenu = shim("HistoryMenu");
  window.BookmarksEventHandler = shim("BookmarksEventHandler");
  window.PlacesMenuDNDHandler = shim("PlacesMenuDNDHandler");

  window.gXPInstallObserver = {
    observe: function() {},
    QueryInterface: function(iid) {
      if (iid.equals(Components.interfaces.nsIObserver) ||
          iid.equals(Components.interfaces.nsISupports)) {
        return this;
      }
      throw Components.results.NS_ERROR_NO_INTERFACE;
    },
  };
})();
