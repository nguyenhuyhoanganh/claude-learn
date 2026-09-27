// Ghi một dòng log ra console và vào <pre data-log-for="id"> của card demo.
export function writeLog(element, message) {
  const line = `${new Date().toLocaleTimeString()}  ${message}`;
  console.log(`<${element.localName}#${element.id}> ${message}`);

  const output = document.querySelector(`[data-log-for="${element.id}"]`);
  if (!output) return;

  output.textContent += `${line}\n`;
  output.scrollTop = output.scrollHeight;
}
