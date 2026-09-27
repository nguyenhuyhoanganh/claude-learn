import {html} from '@polymer/polymer/polymer-element.js';

// Style dùng chung cho các dialog Polymer trong demo.
export const dialogStyles = html`
  <style>
    :host {
      display: block;
    }

    [hidden] {
      display: none !important;
    }

    .dialog {
      margin-top: 12px;
      padding: 16px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: white;
      box-shadow: 0 8px 24px rgb(15 23 42 / 12%);
    }

    .dialog h4 {
      margin: 0 0 8px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .backdrop {
      margin-top: 12px;
      padding: 24px;
      border-radius: 12px;
      background: rgb(15 23 42 / 35%);
      cursor: pointer;
    }

    .backdrop .dialog {
      margin-top: 0;
      cursor: default;
    }
  </style>
`;
