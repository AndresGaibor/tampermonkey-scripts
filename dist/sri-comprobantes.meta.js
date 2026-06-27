// ==UserScript==
// @name         SRI - Comprobantes sincronizados manual
// @namespace    https://github.com/AndresGaibor/userscripts
// @version      2026.6.12.12
// @author       Andres
// @description  Consulta API local, filtra meses, revisa TXT bajo demanda, pagina y descarga comprobantes recibidos en modo manual.
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @supportURL   https://github.com/AndresGaibor/tampermonkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/sri-comprobantes.user.js
// @updateURL    https://raw.githubusercontent.com/AndresGaibor/tampermonkey-scripts/main/dist/sri-comprobantes.user.js
// @match        https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf*
// @connect      localhost
// @connect      127.0.0.1
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==