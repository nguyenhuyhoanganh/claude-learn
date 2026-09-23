const FRUITS = [
  'apple', 'apricot', 'avocado', 'banana', 'blueberry', 'cherry',
  'coconut', 'grape', 'guava', 'lemon', 'lychee', 'mango',
  'orange', 'papaya', 'peach', 'pear', 'pineapple', 'plum',
];

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, {once: true});
  });
}

// API giả lập có độ trễ và hỗ trợ AbortSignal giống fetch().
export async function searchFruits(query, {delay = 600, signal} = {}) {
  await wait(delay, signal);
  if (query === 'error') {
    throw new Error('API giả lập trả lỗi');
  }
  return FRUITS.filter((fruit) => fruit.includes(query.toLowerCase()));
}
