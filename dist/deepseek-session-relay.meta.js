// ==UserScript==
// @name         DeepSeek - Session Relay + Stream Catcher
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      0.2.1
// @author       Andres
// @description  Captura Authorization y cookies de DeepSeek Chat y las envía al bridge local de capi. También intercepta el stream SSE para streaming en consola.
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/deepseek-session-relay.user.js
// @match        https://chat.deepseek.com/*
// @connect      localhost
// @connect      127.0.0.1
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==