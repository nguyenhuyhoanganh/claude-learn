import {BasicPanel} from './components/basic-panel.js';

function createLogger(selector, emptyText) {
  const output = document.querySelector(selector);
  let empty = true;

  return {
    write(message) {
      if (empty) {
        output.textContent = '';
        empty = false;
      }
      output.textContent += `${message}\n`;
    },
    clear() {
      output.textContent = emptyText;
      empty = true;
    },
  };
}

function setupJavaScriptDemo() {
  const panel = document.querySelector('#js-panel');
  const logger = createLogger('#js-log', 'Chưa gọi toggle().');
  const chain = [];
  let prototype = BasicPanel.prototype;

  while (prototype && prototype !== HTMLElement.prototype) {
    chain.push(prototype.constructor.name);
    prototype = Object.getPrototypeOf(prototype);
  }

  chain.push('HTMLElement');
  document.querySelector('#js-chain').textContent = chain.join(' → ');

  panel.addEventListener('demo-log', (event) => {
    logger.write(event.detail);
  });

  document.querySelector('#js-toggle').addEventListener('click', () => {
    panel.toggle();
  });

  document.querySelector('#js-clear').addEventListener('click', () => {
    logger.clear();
  });
}

async function setupPolymerDemo() {
  const section = document.querySelector('#polymer-mixin');
  const status = document.querySelector('#polymer-status');
  const host = document.querySelector('#polymer-host');
  const logger = createLogger('#polymer-log', 'Chưa có dữ liệu.');
  let element;

  try {
    await import('./components/polymer-panel.js');
    status.textContent = 'Đã tải Polymer 3.';
    section.querySelectorAll('button').forEach((button) => {
      button.disabled = false;
    });

    document.querySelector('#polymer-mount').addEventListener('click', () => {
      if (!element) {
        element = document.createElement('polymer-panel');
        element.addEventListener('demo-log', (event) => {
          logger.write(event.detail);
        });
        element.addEventListener('opened-changed', (event) => {
          logger.write(`event opened-changed: ${event.detail.value}`);
        });
      }

      if (!element.isConnected) {
        host.append(element);
      }
    });

    document.querySelector('#polymer-unmount').addEventListener('click', () => {
      element?.remove();
    });

    document.querySelector('#polymer-toggle').addEventListener('click', () => {
      if (element?.isConnected) {
        element.toggle();
      }
    });
  } catch (error) {
    status.textContent = `Không tải được Polymer: ${error.message}`;
  }
}

async function setupLitDemo() {
  const section = document.querySelector('#lit-controller');
  const status = document.querySelector('#lit-status');
  const host = document.querySelector('#lit-host');
  const logger = createLogger('#lit-log', 'Chưa có dữ liệu.');
  let element;

  try {
    await import('./components/lit-panel.js');
    status.textContent = 'Đã tải Lit 3.';
    section.querySelectorAll('button').forEach((button) => {
      button.disabled = false;
    });

    document.querySelector('#lit-mount').addEventListener('click', () => {
      if (!element) {
        element = document.createElement('lit-panel');
        element.addEventListener('demo-log', (event) => {
          logger.write(event.detail);
        });
      }

      if (!element.isConnected) {
        host.append(element);
      }
    });

    document.querySelector('#lit-unmount').addEventListener('click', () => {
      element?.remove();
    });
  } catch (error) {
    status.textContent = `Không tải được Lit: ${error.message}`;
  }
}

async function setupReactiveControllerDemo() {
  const section = document.querySelector('#reactive-controller');
  const status = document.querySelector('#rc-status');
  const host = document.querySelector('#rc-host');
  const logger = createLogger('#rc-log', 'Chưa có dữ liệu.');
  let element;

  try {
    await import('./components/controller-lab.js');
    status.textContent = 'Đã tải Lit 3.';
    section.querySelectorAll('button').forEach((button) => {
      button.disabled = false;
    });

    document.querySelector('#rc-mount').addEventListener('click', () => {
      if (!element) {
        element = document.createElement('controller-lab');
        element.addEventListener('demo-log', (event) => {
          logger.write(event.detail);
        });
      }

      if (!element.isConnected) {
        host.append(element);
      }
    });

    document.querySelector('#rc-unmount').addEventListener('click', () => {
      element?.remove();
    });

    document.querySelector('#rc-attach-probe').addEventListener('click', () => {
      element?.attachProbe();
    });

    document.querySelector('#rc-detach-probe').addEventListener('click', () => {
      element?.detachProbe();
    });

    document.querySelector('#rc-clear').addEventListener('click', () => {
      logger.clear();
    });
  } catch (error) {
    status.textContent = `Không tải được Lit: ${error.message}`;
  }
}

setupJavaScriptDemo();
setupPolymerDemo();
setupLitDemo();
setupReactiveControllerDemo();
