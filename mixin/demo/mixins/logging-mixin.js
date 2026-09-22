export const LoggingMixin = (BaseClass) =>
  class LoggingMixinImpl extends BaseClass {
    toggle() {
      this.dispatchEvent(new CustomEvent('demo-log', {
        detail: '1. LoggingMixin: trước super',
      }));
      super.toggle();
      this.dispatchEvent(new CustomEvent('demo-log', {
        detail: '3. LoggingMixin: sau super',
      }));
    }
  };
