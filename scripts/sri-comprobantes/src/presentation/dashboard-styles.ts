export function injectStyles() {
  const style = document.createElement('style');

  style.textContent = `
    #tm-sri-dashboard {
      margin: 14px 0 18px 0;
      padding: 14px;
      border: 1px solid #d0d7de;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
      font-family: Arial, sans-serif;
      color: #24292f;
    }

    .tm-sri-dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .tm-sri-dashboard-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 3px;
    }

    .tm-sri-dashboard-message {
      font-size: 12px;
      color: #57606a;
      line-height: 1.4;
    }

    .tm-sri-dashboard-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .tm-sri-status-pill {
      display: inline-block;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tm-sri-status-loading {
      background: #ddf4ff;
      color: #0969da;
    }

    .tm-sri-status-success {
      background: #dafbe1;
      color: #1a7f37;
    }

    .tm-sri-status-warning {
      background: #fff8c5;
      color: #9a6700;
    }

    .tm-sri-status-error {
      background: #ffebe9;
      color: #cf222e;
    }

    .tm-sri-stats-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(90px, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }

    .tm-sri-stat {
      border: 1px solid #d8dee4;
      border-radius: 8px;
      padding: 8px;
      background: #f6f8fa;
      min-height: 48px;
    }

    .tm-sri-stat span {
      display: block;
      font-size: 11px;
      color: #57606a;
      margin-bottom: 4px;
    }

    .tm-sri-stat strong {
      display: block;
      font-size: 18px;
      color: #24292f;
    }

    .tm-sri-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 12px;
      color: #57606a;
    }

    .tm-sri-dashboard-actions {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 12px;
    }

    .tm-sri-filter-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .tm-sri-btn {
      cursor: pointer;
      border: 1px solid #0969da;
      background: #ffffff;
      color: #0969da;
      border-radius: 7px;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .tm-sri-btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1em;
      font-size: 12px;
      line-height: 1;
    }

    .tm-sri-btn-label {
      line-height: 1;
    }

    .tm-sri-btn:hover:not(:disabled) {
      background: #ddf4ff;
    }

    .tm-sri-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .tm-sri-btn-primary,
    .tm-sri-btn-active {
      background: #0969da;
      color: #ffffff;
    }

    .tm-sri-btn-secondary {
      border-color: #8c959f;
      color: #57606a;
    }

    .tm-sri-btn-danger {
      border-color: #cf222e;
      color: #cf222e;
    }

    .tm-sri-btn-danger:hover:not(:disabled) {
      background: #ffebe9;
    }

    .tm-sri-btn-txt {
      border-color: #8250df;
      color: #8250df;
    }

    .tm-sri-btn-txt:hover:not(:disabled) {
      background: #fbefff;
    }

    .tm-sri-dashboard-compact {
      padding: 10px 12px;
    }

    .tm-sri-dashboard-compact .tm-sri-dashboard-body,
    .tm-sri-dashboard-compact .tm-sri-dashboard-actions {
      display: none;
    }

    .tm-sri-dashboard-compact .tm-sri-dashboard-header {
      margin-bottom: 0;
    }

    .tm-sri-row-downloaded {
      background: #dafbe1 !important;
      opacity: 0.75;
    }

    .tm-sri-row-missing {
      background: #fff8c5 !important;
    }

    .tm-sri-row-unknown {
      background: #f6f8fa !important;
    }

    .tm-sri-row-processing {
      outline: 2px solid #0969da !important;
      outline-offset: -2px;
    }

    .tm-sri-row-hidden {
      display: none !important;
    }

    .tm-sri-row-badge {
      display: inline-block;
      margin-top: 4px;
      padding: 3px 7px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }

    .tm-sri-badge-downloaded {
      background: #1a7f37;
      color: #ffffff;
    }

    .tm-sri-badge-missing {
      background: #bf8700;
      color: #ffffff;
    }

    .tm-sri-badge-unknown {
      background: #6e7781;
      color: #ffffff;
    }

    .tm-sri-badge-processing {
      background: #0969da;
      color: #ffffff;
    }

    .tm-sri-file-badge {
      display: inline-block;
      padding: 4px 7px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tm-sri-file-downloaded {
      background: #1a7f37;
      color: #ffffff;
    }

    @media (max-width: 900px) {
      .tm-sri-stats-grid {
        grid-template-columns: repeat(2, minmax(120px, 1fr));
      }

      .tm-sri-dashboard-header,
      .tm-sri-dashboard-actions {
        align-items: stretch;
        flex-direction: column;
      }

      .tm-sri-dashboard-header-actions,
      .tm-sri-filter-group {
        justify-content: flex-start;
      }
    }
  `;

  document.head.appendChild(style);
}
